import { z } from "zod";
import { NETWORKS } from "./providers/payments/types";

// Messages here are shown to players verbatim (see errorResponse), so forms carry no helper text.
const email = z.string().email("Enter a valid email").max(200).transform((s) => s.toLowerCase().trim());
const msisdn = z.string().regex(/^0\d{9}$/, "Enter a 10-digit mobile number, e.g. 0241234567");
const amountGhs = z.number({ invalid_type_error: "Enter an amount" }).positive("Enter an amount").max(100_000, "Amount too large");

// Blank optional fields arrive as "" from forms; treat them as absent.
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((s) => s || undefined);

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name").max(60, "Name is too long"),
    email,
    password: z.string().min(8, "Password must be at least 8 characters").max(200),
    confirmPassword: z.string(),
    phone: z.string().trim().min(1, "Enter your mobile number").max(20),
    dateOfBirth: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Enter your date of birth"),
    referralCode: optionalText(24),
    referralSource: z.enum(["LINK", "CODE"]).optional(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: "Accept the Terms & Conditions and Privacy Policy to continue" }) }),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your phone or email").max(200),
  password: z.string().min(1, "Enter your password").max(200),
  remember: z.boolean().default(true),
});

export const selectionIdsSchema = z.object({
  selectionIds: z
    .array(z.string().min(1))
    .min(1, "Add a selection")
    .max(Number(process.env.MAX_ACCA_LEGS ?? 20), "Too many selections"),
});

export const placeBetSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  stakeGhs: z.number({ invalid_type_error: "Enter a stake" }).positive("Enter a stake").max(1_000_000),
  acceptOddsChange: z.boolean().default(false),
  selections: z
    .array(
      z.object({
        selectionId: z.string().min(1),
        // odds the customer saw, in milli-odds — the server re-checks against live odds.
        expectedMilliOdds: z.number().int().min(1000),
      }),
    )
    .min(1, "Add a selection")
    .max(Number(process.env.MAX_ACCA_LEGS ?? 20), "Too many selections"),
});
export type PlaceBetInput = z.infer<typeof placeBetSchema>;

// Optional: older clients omit it and the server guesses from the number prefix.
export const network = z.enum(NETWORKS, { errorMap: () => ({ message: "Choose your mobile money network" }) }).optional();

export const depositSchema = z.object({
  amountGhs,
  idempotencyKey: z.string().min(8).max(100),
  msisdn,
  network,
});

export const withdrawSchema = z.object({
  amountGhs,
  idempotencyKey: z.string().min(8).max(100),
  msisdn,
  network,
});

// --- Admin: manually created games ---
const odds = z.number({ invalid_type_error: "Enter the odds" }).min(1.01, "Odds must be at least 1.01").max(1000, "Odds must be at most 1000");
const MAX_AHEAD_MS = 60 * 86_400_000;

export const manualFixtureSchema = z
  .object({
    sportKey: z.enum(["football", "basketball"]),
    competition: z.string().trim().min(2, "Enter the competition").max(80),
    homeTeam: z.string().trim().min(2, "Enter the home team").max(60),
    awayTeam: z.string().trim().min(2, "Enter the away team").max(60),
    startsAt: z.string().datetime({ offset: true, message: "Enter a valid kick-off time" }),
    venue: optionalText(80),
    result: z.object({ home: odds, draw: odds.optional(), away: odds }),
    total: z
      .object({
        line: z.number().positive().max(400).refine((l) => Number.isInteger(l * 2), "Totals line must be a whole or half number (e.g. 2.5)"),
        over: odds,
        under: odds,
      })
      .optional(),
    btts: z.object({ yes: odds, no: odds }).optional(),
  })
  .refine((f) => f.homeTeam.toLowerCase() !== f.awayTeam.toLowerCase(), { message: "Home and away teams must differ", path: ["awayTeam"] })
  .refine((f) => (f.sportKey === "football" ? f.result.draw !== undefined : f.result.draw === undefined), {
    message: "Football needs draw odds; basketball has no draw",
    path: ["result", "draw"],
  })
  .refine((f) => f.sportKey === "football" || !f.btts, { message: "Both teams to score is a football market", path: ["btts"] })
  .refine((f) => new Date(f.startsAt).getTime() > Date.now() + 60_000, { message: "Kick-off must be in the future", path: ["startsAt"] })
  .refine((f) => new Date(f.startsAt).getTime() < Date.now() + MAX_AHEAD_MS, { message: "Kick-off must be within 60 days", path: ["startsAt"] });
export type ManualFixtureInput = z.infer<typeof manualFixtureSchema>;

export const adminSettleSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("result"), fixtureId: z.string().min(1), homeScore: z.number().int().min(0).max(500), awayScore: z.number().int().min(0).max(500) }),
  z.object({ action: z.literal("live"), fixtureId: z.string().min(1), homeScore: z.number().int().min(0).max(500), awayScore: z.number().int().min(0).max(500) }),
  z.object({ action: z.literal("void"), fixtureId: z.string().min(1) }),
]);

/** Admin moves a manual/generated game's kick-off. Any time up to 60 days out (past = start now). */
export const rescheduleFixtureSchema = z
  .object({ fixtureId: z.string().min(1), startsAt: z.string().datetime({ offset: true, message: "Enter a valid kick-off time" }) })
  .refine((f) => new Date(f.startsAt).getTime() < Date.now() + MAX_AHEAD_MS, { message: "Kick-off must be within 60 days", path: ["startsAt"] });

/** Money in pesewas as a digit string, so no float rounding on the way in. */
const pesewas = z.string().regex(/^\d{1,13}$/, "Invalid amount").transform((s) => BigInt(s));
export const cashoutSchema = z.object({
  expectedPesewas: pesewas,
  amountPesewas: pesewas.optional(), // partial cash out
  idempotencyKey: z.string().min(8).max(100),
});
export const autoCashoutSchema = z.object({ targetPesewas: pesewas });
