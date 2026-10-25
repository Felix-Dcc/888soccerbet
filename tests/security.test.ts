import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, hmacHex, safeEqualHex } from "../src/lib/auth";
import { SandboxMomoProvider, signSandboxEvent } from "../src/lib/providers/payments/sandboxMomo";
import { clientIpFromHeaders } from "../src/lib/rateLimit";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const h = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
  it("produces a unique salt each time", () => {
    expect(hashPassword("samepass1")).not.toBe(hashPassword("samepass1"));
  });
  it("rejects short passwords", () => {
    expect(() => hashPassword("short")).toThrow();
  });
});

describe("webhook signature verification", () => {
  const provider = new SandboxMomoProvider();
  it("accepts a correctly signed event", () => {
    const { body, signature } = signSandboxEvent({ id: "e1", ref: "DEP-ABC", status: "SUCCEEDED", amountPesewas: "5000" });
    const ev = provider.verifyWebhook(body, signature);
    expect(ev).not.toBeNull();
    expect(ev!.ourRef).toBe("DEP-ABC");
    expect(ev!.amountPesewas).toBe(5000n);
  });
  it("rejects a tampered body", () => {
    const { body, signature } = signSandboxEvent({ id: "e2", ref: "DEP-ABC", status: "SUCCEEDED", amountPesewas: "5000" });
    const tampered = body.replace("5000", "500000");
    expect(provider.verifyWebhook(tampered, signature)).toBeNull();
  });
  it("rejects a missing signature", () => {
    const { body } = signSandboxEvent({ id: "e3", ref: "DEP-ABC", status: "SUCCEEDED", amountPesewas: "5000" });
    expect(provider.verifyWebhook(body, null)).toBeNull();
  });
});

describe("hmac helpers", () => {
  it("safeEqualHex is true only for equal digests", () => {
    const a = hmacHex("s", "x");
    expect(safeEqualHex(a, a)).toBe(true);
    expect(safeEqualHex(a, hmacHex("s", "y"))).toBe(false);
  });
});

describe("client IP for rate limits", () => {
  it("uses the address the proxy appended, not one the client made up", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 41.66.7.8" }))).toBe("41.66.7.8");
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "41.66.7.8" }))).toBe("41.66.7.8");
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": " " }))).toBeUndefined();
    expect(clientIpFromHeaders(new Headers())).toBeUndefined();
  });
});
