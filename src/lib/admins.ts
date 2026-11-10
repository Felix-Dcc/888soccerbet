/**
 * Administrator management. Every function here is super-admin only (checked by callers via
 * requirePermission("admins.manage" | "roles.manage")) and enforces the rules that keep access
 * safe no matter which screen or request calls it:
 *  - nobody edits their own access or suspends themselves;
 *  - the last active super admin can't be suspended or demoted;
 *  - passwords are never set or seen by another person: new admins and resets get a single-use
 *    link (only its hash is stored) to choose their own;
 *  - every change is written to the audit log with before/after values, in the same transaction.
 */
import { randomBytes } from "node:crypto";
import { Prisma, type Role, type User } from "@prisma/client";
import { prisma } from "./db";
import { hashPassword, hashToken } from "./auth";
import { audit } from "./audit";
import { cleanPermissions } from "./permissions";

export class AdminError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

const ALPHABET = "ACDEFGHJKLMNPQRSTUVWXYZ2345679";
const SETUP_TTL_MS = 72 * 3600_000;
const RESET_TTL_MS = 24 * 3600_000;

/** Stored without dashes (codes are matched after normaliseCode strips them); shown as ADM-NAME-XXXX. */
/** "ADM" + 8 random symbols. Nothing about the admin (name, username) is in it: codes are shared publicly. */
export function newAdminReferralCode(): string {
  const bytes = randomBytes(8);
  return `ADM${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}
/** ADMXXXXXXXX -> ADM-XXXX-XXXX for reading aloud; anything else is shown as stored. */
export const formatReferralCode = (code: string, staff: boolean) => (staff && /^ADM[A-Z0-9]{8}$/.test(code) ? `ADM-${code.slice(3, 7)}-${code.slice(7)}` : code);

const accessSnapshot = (u: Pick<User, "role" | "status" | "adminRoleId" | "permGrants" | "permDenials">) => ({
  role: u.role,
  status: u.status,
  adminRoleId: u.adminRoleId,
  permGrants: u.permGrants,
  permDenials: u.permDenials,
});

async function activeSuperAdmins(tx: Prisma.TransactionClient) {
  return tx.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } });
}

async function lockUser(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
  const u = await tx.user.findUnique({ where: { id } });
  if (!u || (u.role !== "ADMIN" && u.role !== "SUPER_ADMIN")) throw new AdminError("NOT_FOUND", "Administrator not found", 404);
  return u;
}

/** Single-use link token; returns the raw token (shown once) and stores only its hash. */
async function issueToken(tx: Prisma.TransactionClient, userId: string, purpose: "ADMIN_SETUP" | "PASSWORD_RESET", actorId: string) {
  await tx.accountToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }); // older links stop working
  const token = randomBytes(32).toString("base64url");
  await tx.accountToken.create({
    data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + (purpose === "ADMIN_SETUP" ? SETUP_TTL_MS : RESET_TTL_MS)), createdById: actorId },
  });
  return token;
}

export interface NewAdmin {
  email: string;
  displayName: string;
  username: string;
  role: Extract<Role, "ADMIN" | "SUPER_ADMIN">;
  adminRoleId?: string | null;
  permGrants?: string[];
  permDenials?: string[];
}

export async function createAdmin(actor: User, input: NewAdmin, ip?: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.adminRoleId && !(await tx.adminRole.findUnique({ where: { id: input.adminRoleId } }))) throw new AdminError("BAD_ROLE", "That role doesn't exist", 422);
      const taken = await tx.user.findFirst({ where: { OR: [{ email: input.email }, { adminUsername: input.username }] }, select: { email: true } });
      if (taken) throw taken.email === input.email ? new AdminError("EMAIL_TAKEN", "An account with this email already exists") : new AdminError("USERNAME_TAKEN", "That username is taken");
      let code = newAdminReferralCode();
      for (let i = 0; i < 5 && (await tx.user.findUnique({ where: { referralCode: code }, select: { id: true } })); i++) code = newAdminReferralCode();
      const user = await tx.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          adminUsername: input.username,
          role: input.role,
          adminRoleId: input.role === "ADMIN" ? (input.adminRoleId ?? null) : null,
          permGrants: input.role === "ADMIN" ? cleanPermissions(input.permGrants ?? []) : [],
          permDenials: input.role === "ADMIN" ? cleanPermissions(input.permDenials ?? []) : [],
          passwordHash: hashPassword(randomBytes(32).toString("hex")), // unusable until they set their own
          referralCode: code, // unique in the database; a clash fails the insert, never reuses a code
        },
      });
      const token = await issueToken(tx, user.id, "ADMIN_SETUP", actor.id);
      await audit(
        { actorUserId: actor.id, action: "ADMIN_CREATE", targetType: "User", targetId: user.id, after: { email: user.email, username: user.adminUsername, ...accessSnapshot(user), referralCode: user.referralCode }, ip },
        tx,
      );
      return { user, token };
    });
  } catch (e) {
    // Lost a race with another insert of the same email/username/code: nothing was written.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AdminError("TAKEN", "Email or username already in use; try again");
    throw e;
  }
}

export interface InviteAccess {
  role: Extract<Role, "ADMIN" | "SUPER_ADMIN">;
  adminRoleId?: string | null;
  permGrants?: string[];
  permDenials?: string[];
}

/** A single-use invite link (raw token returned once, only its hash stored) for a new administrator with this access. */
export async function createAdminInvite(actor: User, access: InviteAccess, ip?: string) {
  return prisma.$transaction(async (tx) => {
    if (access.adminRoleId && !(await tx.adminRole.findUnique({ where: { id: access.adminRoleId } }))) throw new AdminError("BAD_ROLE", "That role doesn't exist", 422);
    const admin = access.role === "ADMIN";
    const token = randomBytes(32).toString("base64url");
    const invite = await tx.adminInvite.create({
      data: {
        tokenHash: hashToken(token),
        role: access.role,
        adminRoleId: admin ? (access.adminRoleId ?? null) : null,
        permGrants: admin ? cleanPermissions(access.permGrants ?? []) : [],
        permDenials: admin ? cleanPermissions(access.permDenials ?? []) : [],
        createdById: actor.id,
        expiresAt: new Date(Date.now() + SETUP_TTL_MS),
      },
    });
    await audit(
      { actorUserId: actor.id, action: "ADMIN_INVITE", targetType: "AdminInvite", targetId: invite.id, after: { role: invite.role, adminRoleId: invite.adminRoleId, permGrants: invite.permGrants, permDenials: invite.permDenials, expiresAt: invite.expiresAt }, ip },
      tx,
    );
    return { token, expiresAt: invite.expiresAt };
  });
}

type Db = Prisma.TransactionClient | typeof prisma;

/** The invite behind a link if it can still be used: unused, unexpired, and its creator still an active super admin. */
async function usableInvite(db: Db, token: string) {
  const invite = await db.adminInvite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) return null;
  const creator = await db.user.findUnique({ where: { id: invite.createdById }, select: { role: true, status: true } });
  if (creator?.role !== "SUPER_ADMIN" || creator.status !== "ACTIVE") return null;
  return invite;
}

/** For the invite page: whether the link still works, before the visitor fills anything in. */
export async function adminInviteValid(token: string): Promise<boolean> {
  return !!(await usableInvite(prisma, token));
}

/** The invitee chooses their email and password: the administrator account is created with the invite's access. */
export async function acceptAdminInvite(token: string, email: string, password: string, ip?: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const invite = await usableInvite(tx, token);
      if (!invite) throw new AdminError("BAD_LINK", "This invite link is invalid, used or expired; ask a super admin for a new one", 410);
      // Claim it first, so two tabs (or two people) can never both use one link.
      const claimed = await tx.adminInvite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date() } });
      if (!claimed.count) throw new AdminError("BAD_LINK", "This invite link has already been used", 410);
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) throw new AdminError("EMAIL_TAKEN", "An account with this email already exists; use a different email");
      if (invite.adminRoleId && !(await tx.adminRole.findUnique({ where: { id: invite.adminRoleId } })))
        throw new AdminError("BAD_ROLE", "The role on this invite no longer exists; ask a super admin for a new link", 410);
      let code = newAdminReferralCode();
      for (let i = 0; i < 5 && (await tx.user.findUnique({ where: { referralCode: code }, select: { id: true } })); i++) code = newAdminReferralCode();
      const user = await tx.user.create({
        data: {
          email,
          role: invite.role,
          adminRoleId: invite.adminRoleId,
          permGrants: invite.permGrants,
          permDenials: invite.permDenials,
          passwordHash: hashPassword(password),
          referralCode: code,
        },
      });
      await tx.adminInvite.update({ where: { id: invite.id }, data: { usedById: user.id } });
      await audit(
        { actorUserId: invite.createdById, action: "ADMIN_CREATE", targetType: "User", targetId: user.id, after: { email: user.email, ...accessSnapshot(user), referralCode: user.referralCode, inviteId: invite.id }, ip },
        tx,
      );
      await audit({ actorUserId: user.id, action: "ADMIN_SETUP_COMPLETE", targetType: "User", targetId: user.id, ip }, tx);
      return user;
    });
  } catch (e) {
    // Lost a race with another sign-up for the same email (or referral code): nothing was written, the link still works.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AdminError("TAKEN", "That email was just taken; use a different email");
    throw e;
  }
}

export interface AccessChange {
  role?: Extract<Role, "ADMIN" | "SUPER_ADMIN">;
  adminRoleId?: string | null;
  permGrants?: string[];
  permDenials?: string[];
}

export async function updateAdminAccess(actor: User, targetId: string, change: AccessChange, ip?: string) {
  if (actor.id === targetId) throw new AdminError("SELF_EDIT", "You can't change your own access", 403);
  return prisma.$transaction(async (tx) => {
    const target = await lockUser(tx, targetId);
    if (change.adminRoleId && !(await tx.adminRole.findUnique({ where: { id: change.adminRoleId } }))) throw new AdminError("BAD_ROLE", "That role doesn't exist", 422);
    const role = change.role ?? target.role;
    if (target.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN" && target.status === "ACTIVE" && (await activeSuperAdmins(tx)) <= 1)
      throw new AdminError("LAST_SUPER_ADMIN", "This is the last active super admin; promote someone else first");
    const after = await tx.user.update({
      where: { id: targetId },
      data:
        role === "SUPER_ADMIN"
          ? { role, adminRoleId: null, permGrants: [], permDenials: [] }
          : {
              role,
              ...(change.adminRoleId !== undefined ? { adminRoleId: change.adminRoleId } : {}),
              ...(change.permGrants ? { permGrants: cleanPermissions(change.permGrants) } : {}),
              ...(change.permDenials ? { permDenials: cleanPermissions(change.permDenials) } : {}),
            },
    });
    await audit({ actorUserId: actor.id, action: "ADMIN_ACCESS_CHANGE", targetType: "User", targetId, before: accessSnapshot(target), after: accessSnapshot(after), ip }, tx);
    return after;
  });
}

export async function setAdminStatus(actor: User, targetId: string, status: "ACTIVE" | "SUSPENDED", ip?: string) {
  if (actor.id === targetId) throw new AdminError("SELF_EDIT", "You can't change your own status", 403);
  return prisma.$transaction(async (tx) => {
    const target = await lockUser(tx, targetId);
    if (status === "SUSPENDED" && target.role === "SUPER_ADMIN" && target.status === "ACTIVE" && (await activeSuperAdmins(tx)) <= 1)
      throw new AdminError("LAST_SUPER_ADMIN", "This is the last active super admin");
    const after = await tx.user.update({ where: { id: targetId }, data: { status } });
    if (status === "SUSPENDED") await tx.session.deleteMany({ where: { userId: targetId } }); // signed out everywhere, now
    await audit({ actorUserId: actor.id, action: status === "SUSPENDED" ? "ADMIN_SUSPEND" : "ADMIN_REACTIVATE", targetType: "User", targetId, before: { status: target.status }, after: { status: after.status }, ip }, tx);
    return after;
  });
}

export async function updateAdminProfile(actor: User, targetId: string, p: { displayName?: string; username?: string }, ip?: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const target = await lockUser(tx, targetId);
      const after = await tx.user.update({
        where: { id: targetId },
        data: { ...(p.displayName ? { displayName: p.displayName } : {}), ...(p.username ? { adminUsername: p.username } : {}) },
      });
      await audit(
        { actorUserId: actor.id, action: "ADMIN_PROFILE_CHANGE", targetType: "User", targetId, before: { displayName: target.displayName, username: target.adminUsername }, after: { displayName: after.displayName, username: after.adminUsername }, ip },
        tx,
      );
      return after;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AdminError("USERNAME_TAKEN", "That username is taken");
    throw e;
  }
}

/** A fresh single-use reset link for an admin (old links stop working; they are signed out). */
export async function issueResetLink(actor: User, targetId: string, ip?: string) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, targetId);
    const token = await issueToken(tx, targetId, "PASSWORD_RESET", actor.id);
    await tx.session.deleteMany({ where: { userId: targetId } });
    await audit({ actorUserId: actor.id, action: "ADMIN_RESET_LINK", targetType: "User", targetId, ip }, tx);
    return token;
  });
}

/** The admin opens their link and chooses a password. Single use; expires. */
export async function consumeAccessToken(token: string, password: string) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.accountToken.findUnique({ where: { tokenHash: hashToken(token) } });
    // Email-confirmation codes live in the same table but are never password links.
    if (!row || row.purpose === "EMAIL_VERIFY" || row.usedAt || row.expiresAt < new Date()) throw new AdminError("BAD_LINK", "This link is invalid or has expired; ask for a new one", 410);
    const used = await tx.accountToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!used.count) throw new AdminError("BAD_LINK", "This link has already been used", 410); // two tabs at once
    // A self-service reset link arrived by email, so the player has proven they own the inbox.
    const viaEmail = row.purpose === "PASSWORD_RESET" && !row.createdById;
    const user = await tx.user.update({ where: { id: row.userId }, data: { passwordHash: hashPassword(password), ...(viaEmail ? { emailVerifiedAt: new Date() } : {}) } });
    await tx.session.deleteMany({ where: { userId: row.userId } });
    await audit({ actorUserId: row.userId, action: row.purpose === "ADMIN_SETUP" ? "ADMIN_SETUP_COMPLETE" : "PASSWORD_RESET_COMPLETE", targetType: "User", targetId: row.userId }, tx);
    return { userId: row.userId, role: user.role };
  });
}

export async function saveRole(actor: User, input: { id?: string; name: string; description?: string; permissions: string[] }, ip?: string) {
  const permissions = cleanPermissions(input.permissions);
  try {
    return await prisma.$transaction(async (tx) => {
      const before = input.id ? await tx.adminRole.findUnique({ where: { id: input.id } }) : null;
      if (input.id && !before) throw new AdminError("NOT_FOUND", "Role not found", 404);
      const role = input.id
        ? await tx.adminRole.update({ where: { id: input.id }, data: { name: input.name, description: input.description ?? null, permissions } })
        : await tx.adminRole.create({ data: { name: input.name, description: input.description ?? null, permissions } });
      await audit(
        { actorUserId: actor.id, action: input.id ? "ROLE_UPDATE" : "ROLE_CREATE", targetType: "AdminRole", targetId: role.id, before: before && { name: before.name, permissions: before.permissions }, after: { name: role.name, permissions: role.permissions }, ip },
        tx,
      );
      return role;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AdminError("ROLE_NAME_TAKEN", "A role with that name already exists");
    throw e;
  }
}

export async function deleteRole(actor: User, id: string, ip?: string) {
  return prisma.$transaction(async (tx) => {
    const role = await tx.adminRole.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new AdminError("NOT_FOUND", "Role not found", 404);
    if (role._count.users) throw new AdminError("ROLE_IN_USE", `${role._count.users} admin(s) still have this role; move them first`);
    await tx.adminRole.delete({ where: { id } });
    await audit({ actorUserId: actor.id, action: "ROLE_DELETE", targetType: "AdminRole", targetId: id, before: { name: role.name, permissions: role.permissions }, ip }, tx);
  });
}
