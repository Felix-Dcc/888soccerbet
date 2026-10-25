import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShinobiPayProvider } from "../src/lib/providers/payments/shinobipay";
import { PspError } from "../src/lib/providers/payments/types";

const NOW = 1_800_000_000;
const SECRET = "whsec_test123";
const sp = () => new ShinobiPayProvider("sk_test_abc", SECRET, "https://api.shinobi.test", "https://kingzbet.live", () => NOW);
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function stubFetch(...replies: Response[]) {
  const f = vi.fn(async (..._args: unknown[]) => replies.shift() ?? reply({}, 500));
  vi.stubGlobal("fetch", f);
  return f;
}
const call = (f: ReturnType<typeof stubFetch>, i = 0) => {
  const [url, init] = f.mock.calls[i] as [string, RequestInit];
  const h = init.headers as Record<string, string>;
  return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : undefined, auth: h.authorization, idem: h["idempotency-key"] };
};
const sign = (body: string, t = NOW, secret = SECRET) => new Headers({ "x-akwapay-signature": `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}` });
const event = (type = "payment_intent.succeeded", reference = "DEP-1") =>
  JSON.stringify({ id: "evt_01", type, sequence: 3, data: { intent_id: "pi_01", amount: 999999, currency: "GHS", reference, status: "succeeded" } });

afterEach(() => vi.unstubAllGlobals());

describe("ShinobiPay deposits", () => {
  const dep = { ref: "DEP-1", amountPesewas: 5050n, msisdn: "0201234567", network: "TELECEL" as const, direction: "DEPOSIT" as const, email: "a@b.gh" };

  it("creates a mobile money intent in pesewas, keyed by our reference", async () => {
    const f = stubFetch(reply({ id: "pi_01", status: "requires_action", next_action: { type: "await_prompt", ussd_fallback: "*110#" } }, 201));
    expect(await sp().initiate(dep)).toEqual({ providerRef: "pi_01", status: "PENDING", prompt: { ussdFallback: "*110#" } });
    const c = call(f);
    expect(c.url).toBe("https://api.shinobi.test/v1/payment_intents");
    expect(c.auth).toBe("Bearer sk_test_abc");
    expect(c.idem).toBe("DEP-1");
    expect(c.body).toMatchObject({ amount: 5050, currency: "GHS", method: "mobile_money", network: "TELECEL", reference: "DEP-1", customer: { phone: "0201234567", email: "a@b.gh" } });
  });

  it("sends the player to checkout when there is no phone prompt", async () => {
    stubFetch(reply({ id: "pi_02", status: "requires_action", next_action: { type: "redirect" }, checkout_url: "https://shinobipay.vercel.app/checkout/pi_02" }, 201));
    expect(await sp().initiate(dep)).toMatchObject({ redirectUrl: "https://shinobipay.vercel.app/checkout/pi_02" });
  });

  it("passes a refusal on to the player, and never pretends to pay out", async () => {
    stubFetch(reply({ error: { code: "invalid_number", message: "That number isn't on mobile money" } }, 402));
    await expect(sp().initiate(dep)).rejects.toThrow("That number isn't on mobile money");
    await expect(sp().initiate({ ...dep, direction: "WITHDRAWAL" })).rejects.toThrow(PspError);
    expect(sp().payouts).toBe("manual");
  });
});

describe("ShinobiPay webhooks", () => {
  it("accepts a signed event and takes the amount from the API, not the event", async () => {
    const f = stubFetch(reply({ id: "pi_01", status: "succeeded", amount: 5050, currency: "GHS", reference: "DEP-1" }));
    const body = event();
    expect(await sp().verifyWebhook(body, sign(body))).toEqual({
      ok: true,
      event: { providerEventId: "evt_01", ourRef: "DEP-1", status: "SUCCEEDED", amountPesewas: 5050n, direction: "DEPOSIT" },
    });
    expect(call(f).url).toBe("https://api.shinobi.test/v1/payment_intents/pi_01");
  });

  it("rejects a wrong secret, a tampered body, a missing header and an old timestamp", async () => {
    const f = stubFetch();
    const body = event();
    expect(await sp().verifyWebhook(body, sign(body, NOW, "whsec_other"))).toEqual({ ok: false });
    expect(await sp().verifyWebhook(body.replace("DEP-1", "DEP-2"), sign(body))).toEqual({ ok: false });
    expect(await sp().verifyWebhook(body, new Headers())).toEqual({ ok: false });
    expect(await sp().verifyWebhook(body, sign(body, NOW - 301))).toEqual({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });

  it("applies nothing unless the API agrees, and asks for a retry when it's down", async () => {
    const body = event();
    stubFetch(reply({ status: "processing", amount: 5050, currency: "GHS" }));
    expect(await sp().verifyWebhook(body, sign(body))).toEqual({ ok: true, event: null });
    stubFetch(reply({ status: "succeeded", amount: 5050, currency: "GHS", reference: "DEP-OTHER" }));
    expect(await sp().verifyWebhook(body, sign(body))).toEqual({ ok: true, event: null });
    stubFetch(reply({}, 503));
    await expect(sp().verifyWebhook(body, sign(body))).rejects.toThrow(PspError);
  });

  it("maps failures and acknowledges informational events without calling the API", async () => {
    stubFetch(reply({ status: "failed", amount: 5050, currency: "GHS" }));
    const failed = event("payment_intent.failed");
    expect(await sp().verifyWebhook(failed, sign(failed))).toMatchObject({ ok: true, event: { status: "FAILED", ourRef: "DEP-1" } });
    const f = stubFetch();
    const info = event("payment_intent.processing");
    expect(await sp().verifyWebhook(info, sign(info))).toEqual({ ok: true, event: null });
    expect(f).not.toHaveBeenCalled();
  });
});
