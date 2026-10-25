import { describe, it, expect } from "vitest";
import { ALL_PERMISSIONS, can, cleanPermissions, effectivePermissions } from "../src/lib/permissions";

const staff = (over: Partial<Parameters<typeof effectivePermissions>[0]> = {}) => ({
  role: "ADMIN" as const,
  permGrants: [] as string[],
  permDenials: [] as string[],
  adminRole: null as { permissions: string[] } | null,
  ...over,
});

describe("admin permissions", () => {
  it("denies by default", () => {
    expect([...effectivePermissions(staff())]).toEqual([]);
    expect(can({ ...staff(), role: "USER" }, "dashboard.view")).toBe(false);
    expect([...effectivePermissions({ ...staff({ permGrants: ["reports.view"] }), role: "USER" })]).toEqual([]); // players never get staff access
  });

  it("is role permissions plus grants minus denials", () => {
    const u = staff({ adminRole: { permissions: ["dashboard.view", "referrals.view", "reports.view"] }, permGrants: ["reports.export"], permDenials: ["reports.view"] });
    expect([...effectivePermissions(u)].sort()).toEqual(["dashboard.view", "referrals.view", "reports.export"]);
  });

  it("ignores unknown permission strings instead of honouring them", () => {
    expect([...effectivePermissions(staff({ permGrants: ["admins.manage", "everything", "users.view"] }))]).toEqual(["users.view"]);
    expect(cleanPermissions(["users.view", "users.view", "root", "roles.manage"])).toEqual(["users.view"]);
  });

  it("gives super admins everything, and only they manage admins and roles", () => {
    const sa = { ...staff(), role: "SUPER_ADMIN" as const };
    expect(effectivePermissions(sa).size).toBe(ALL_PERMISSIONS.length);
    expect(can(sa, "admins.manage")).toBe(true);
    expect(can(sa, "roles.manage")).toBe(true);
    const loaded = staff({ permGrants: [...ALL_PERMISSIONS] }); // an admin holding every grantable permission
    expect(can(loaded, "admins.manage")).toBe(false);
    expect(can(loaded, "roles.manage")).toBe(false);
  });
});
