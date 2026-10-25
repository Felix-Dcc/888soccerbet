import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "../src/lib/turnstile";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("verifyTurnstile", () => {
  it("is off without a secret key", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyTurnstile(undefined, null)).toBe(true);
  });

  it("refuses a missing token without calling Cloudflare", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "s");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await verifyTurnstile("", "1.2.3.4")).toBe(false);
    expect(await verifyTurnstile(42, "1.2.3.4")).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("follows Cloudflare's verdict and fails closed when unreachable", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "s");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }))));
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false }))));
    expect(await verifyTurnstile("tok", null)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await verifyTurnstile("tok", null)).toBe(false);
  });
});
