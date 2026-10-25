import { afterEach, describe, expect, it, vi } from "vitest";
import { FlutterwaveError, FlutterwaveProvider } from "../src/lib/providers/payments/flutterwave";
import { guessNetwork } from "../src/lib/providers/payments/types";

const fw = () => new FlutterwaveProvider("FLWSECK_TEST-abc", "hash-123", "https://kingzbet.live");
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
/** Stub fetch with one reply per call, recording what was sent. */
function stubFetch(...replies: Response[]) {
  const f = vi.fn(async (..._args: unknown[]) => replies.shift() ?? reply({}, 500));
  vi.stubGlobal("fetch", f);
  return f;
}
const sent = (f: ReturnType<typeof stubFetch>, i = 0) => {
  const [url, init] = f.mock.calls[i] as [string, RequestInit];
  return { url, body: init.body ? JSON.parse(init.body as string) : undefined, auth: (init.headers as Record<string, string>).authorization };
};
const hook = (hash: string | null) => new Headers(hash ? { "verif-hash": hash } : {});

afterEach(() => vi.unstubAllGlobals());

describe("Flutterwave deposits", () => {
  it("charges Ghana mobile money and returns the approval page", async () => {
    const f = stubFetch(reply({ status: "success", meta: { authorization: { mode: "redirect", redirect: "https://checkout.flutterwave.com/x" } } }));
    const r = await fw().initiate({ ref: "DEP-1", amountPesewas: 5050n, msisdn: "0201234567", network: "TELECEL", direction: "DEPOSIT", email: "a@b.gh", name: "Ama" });
    expect(r).toMatchObject({ status: "PENDING", redirectUrl: "https://checkout.flutterwave.com/x" });
    const s = sent(f);
    expect(s.url).toBe("https://api.flutterwave.com/v3/charges?type=mobile_money_ghana");
    expect(s.auth).toBe("Bearer FLWSECK_TEST-abc");
    expect(s.body).toMatchObject({ tx_ref: "DEP-1", amount: 50.5, currency: "GHS", phone_number: "0201234567", network: "VODAFONE", email: "a@b.gh", fullname: "Ama" });
  });

  it("surfaces a refused charge as an error (nothing was taken)", async () => {
    stubFetch(reply({ status: "error", message: "Invalid phone number" }, 400));
    await expect(fw().initiate({ ref: "DEP-2", amountPesewas: 5000n, msisdn: "0241234567", network: "MTN", direction: "DEPOSIT", email: "a@b.gh" })).rejects.toThrow(FlutterwaveError);
  });
});

describe("Flutterwave withdrawals", () => {
  const req = { ref: "WDR-1", amountPesewas: 10000n, msisdn: "0261234567", network: "AIRTELTIGO" as const, direction: "WITHDRAWAL" as const, email: "a@b.gh", name: "Kofi" };

  it("pays out to the number with the country code and our reference", async () => {
    const f = stubFetch(reply({ status: "success", data: { id: 991, status: "NEW" } }));
    expect(await fw().initiate(req)).toEqual({ providerRef: "991", status: "PENDING" });
    expect(sent(f).url).toBe("https://api.flutterwave.com/v3/transfers");
    expect(sent(f).body).toMatchObject({ account_bank: "AIRTELTIGO", account_number: "233261234567", amount: 100, currency: "GHS", reference: "WDR-1", beneficiary_name: "Kofi" });
  });

  it("reports a clear refusal as FAILED, and an unclear reply by throwing", async () => {
    stubFetch(reply({ status: "error", message: "Insufficient balance" }, 400));
    expect(await fw().initiate(req)).toMatchObject({ status: "FAILED" });
    stubFetch(reply({}, 502));
    await expect(fw().initiate(req)).rejects.toThrow(FlutterwaveError);
  });
});

describe("Flutterwave webhooks", () => {
  const charge = JSON.stringify({ event: "charge.completed", data: { id: 285959875, tx_ref: "DEP-1", status: "successful", amount: 999999, currency: "GHS" } });

  it("rejects a missing or wrong secret hash without calling Flutterwave", async () => {
    const f = stubFetch();
    expect(await fw().verifyWebhook(charge, hook(null))).toEqual({ ok: false });
    expect(await fw().verifyWebhook(charge, hook("nope"))).toEqual({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });

  it("re-reads a charge from Flutterwave and trusts that, not the webhook body", async () => {
    const f = stubFetch(reply({ status: "success", data: { id: 285959875, tx_ref: "DEP-1", status: "successful", amount: 50.5, currency: "GHS" } }));
    const r = await fw().verifyWebhook(charge, hook("hash-123"));
    expect(sent(f).url).toBe("https://api.flutterwave.com/v3/transactions/285959875/verify");
    expect(r).toEqual({ ok: true, event: { providerEventId: "charge:285959875:SUCCEEDED", ourRef: "DEP-1", status: "SUCCEEDED", amountPesewas: 5050n, direction: "DEPOSIT" } });
  });

  it("ignores pending charges and other currencies, and asks for a retry when Flutterwave is down", async () => {
    stubFetch(reply({ data: { id: 1, tx_ref: "DEP-1", status: "pending", amount: 50, currency: "GHS" } }));
    expect(await fw().verifyWebhook(charge, hook("hash-123"))).toEqual({ ok: true, event: null });
    stubFetch(reply({ data: { id: 1, tx_ref: "DEP-1", status: "successful", amount: 50, currency: "NGN" } }));
    expect(await fw().verifyWebhook(charge, hook("hash-123"))).toEqual({ ok: true, event: null });
    stubFetch(reply({}, 503));
    await expect(fw().verifyWebhook(charge, hook("hash-123"))).rejects.toThrow(FlutterwaveError);
  });

  it("confirms a transfer by id and maps its status", async () => {
    const body = JSON.stringify({ event: "transfer.completed", data: { id: 991, reference: "WDR-1", status: "SUCCESSFUL" } });
    const f = stubFetch(reply({ status: "success", data: { id: 991, reference: "WDR-1", status: "FAILED", amount: 100, currency: "GHS" } }));
    const r = await fw().verifyWebhook(body, hook("hash-123"));
    expect(sent(f).url).toBe("https://api.flutterwave.com/v3/transfers/991");
    expect(r).toMatchObject({ ok: true, event: { ourRef: "WDR-1", status: "FAILED", amountPesewas: 10000n, direction: "WITHDRAWAL" } });
  });

  it("acknowledges events it doesn't handle", async () => {
    stubFetch();
    expect(await fw().verifyWebhook(JSON.stringify({ event: "subscription.cancelled", data: { id: 5 } }), hook("hash-123"))).toEqual({ ok: true, event: null });
  });
});

describe("guessNetwork", () => {
  it("defaults from the Ghana number prefix", () => {
    expect(guessNetwork("0241234567")).toBe("MTN");
    expect(guessNetwork("0501234567")).toBe("TELECEL");
    expect(guessNetwork("0571234567")).toBe("AIRTELTIGO");
  });
});
