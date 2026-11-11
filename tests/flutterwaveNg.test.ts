import { afterEach, describe, expect, it, vi } from "vitest";
import { FlutterwaveError } from "../src/lib/providers/payments/flutterwave";
import { FlutterwaveNgProvider } from "../src/lib/providers/payments/flutterwaveNg";
import { formatNaira, normalizeNgPhone, toKobo } from "../src/lib/nigeria";

const fw = () => new FlutterwaveNgProvider("FLWSECK_TEST-abc", "hash-123", "https://betzone.com.co");
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function stubFetch(...replies: Response[]) {
  const f = vi.fn(async (..._args: unknown[]) => replies.shift() ?? reply({}, 500));
  vi.stubGlobal("fetch", f);
  return f;
}
const sent = (f: ReturnType<typeof stubFetch>, i = 0) => {
  const [url, init] = f.mock.calls[i] as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : undefined };
};
const hook = (hash: string | null) => new Headers(hash ? { "verif-hash": hash } : {});
const tx = (over: Record<string, unknown> = {}) => ({ status: "success", data: { id: 77, tx_ref: "DEP-NG1", status: "successful", amount: 13000, currency: "NGN", ...over } });

afterEach(() => vi.unstubAllGlobals());

describe("Nigerian numbers and Naira", () => {
  it("normalises Nigerian mobile numbers and refuses anything else", () => {
    expect(normalizeNgPhone("0803 123 4567")).toBe("+2348031234567");
    expect(normalizeNgPhone("+234 803 123 4567")).toBe("+2348031234567");
    expect(normalizeNgPhone("2349031234567")).toBe("+2349031234567");
    expect(normalizeNgPhone("0241234567")).toBeNull(); // a Ghana number
    expect(normalizeNgPhone("06031234567")).toBeNull();
  });

  it("converts pesewas to kobo exactly at the admin's rate", () => {
    expect(toKobo(10000n, 130)).toBe(1300000n); // GHS 100 at 130 = ₦13,000.00
    expect(toKobo(5050n, 130)).toBe(656500n); // GHS 50.50 = ₦6,565.00
    expect(formatNaira(1300000n)).toBe("₦13,000.00");
    expect(() => toKobo(100n, 0)).toThrow();
  });
});

describe("Flutterwave Naira checkout", () => {
  it("opens a hosted checkout in Naira with our ref and returns its link", async () => {
    const f = stubFetch(reply({ status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/abc" } }));
    const r = await fw().initiate({ ref: "DEP-NG1", amountPesewas: 10000n, ngnKobo: 1300000n, direction: "DEPOSIT", email: "ada@x.ng", name: "Ada" });
    expect(r).toEqual({ providerRef: "DEP-NG1", status: "PENDING", redirectUrl: "https://checkout.flutterwave.com/v3/hosted/pay/abc" });
    const s = sent(f);
    expect(s.url).toBe("https://api.flutterwave.com/v3/payments");
    expect(s.body).toMatchObject({ tx_ref: "DEP-NG1", amount: 13000, currency: "NGN", redirect_url: "https://betzone.com.co/wallet", customer: { email: "ada@x.ng", name: "Ada" } });
  });

  it("refuses withdrawals, a missing Naira amount and a refused checkout", async () => {
    await expect(fw().initiate({ ref: "WDR-1", amountPesewas: 100n, ngnKobo: 13000n, direction: "WITHDRAWAL", email: "a@x.ng" })).rejects.toThrow(FlutterwaveError);
    await expect(fw().initiate({ ref: "DEP-2", amountPesewas: 100n, direction: "DEPOSIT", email: "a@x.ng" })).rejects.toThrow(FlutterwaveError);
    stubFetch(reply({ status: "error", message: "Invalid currency" }, 400));
    await expect(fw().initiate({ ref: "DEP-3", amountPesewas: 100n, ngnKobo: 13000n, direction: "DEPOSIT", email: "a@x.ng" })).rejects.toThrow("Invalid currency");
  });
});

describe("Flutterwave Naira webhooks", () => {
  const body = JSON.stringify({ event: "charge.completed", data: { id: 77, status: "successful", amount: 999999, currency: "NGN" } });

  it("rejects a wrong secret hash without calling Flutterwave", async () => {
    const f = stubFetch();
    expect(await fw().verifyWebhook(body, hook("nope"))).toEqual({ ok: false });
    expect(await fw().verifyWebhook(body, hook(null))).toEqual({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });

  it("trusts only the verified transaction: amount and currency come from Flutterwave's API, not the body", async () => {
    const f = stubFetch(reply(tx()));
    expect(await fw().verifyWebhook(body, hook("hash-123"))).toEqual({
      ok: true,
      event: { providerEventId: "charge:77:SUCCEEDED", ourRef: "DEP-NG1", status: "SUCCEEDED", amountPesewas: 1300000n, currency: "NGN", direction: "DEPOSIT" },
    });
    expect(sent(f).url).toBe("https://api.flutterwave.com/v3/transactions/77/verify");
  });

  it("ignores a failed attempt (the player can retry on the same page) and a non-Naira charge", async () => {
    stubFetch(reply(tx({ status: "failed" })));
    expect(await fw().verifyWebhook(body, hook("hash-123"))).toEqual({ ok: true, event: null });
    stubFetch(reply(tx({ currency: "GHS" })));
    expect(await fw().verifyWebhook(body, hook("hash-123"))).toEqual({ ok: true, event: null });
  });

  it("throws on a Flutterwave outage so the webhook is retried", async () => {
    stubFetch(reply({}, 503));
    await expect(fw().verifyWebhook(body, hook("hash-123"))).rejects.toThrow(FlutterwaveError);
  });
});

describe("Flutterwave Naira status check", () => {
  it("looks a deposit up by our ref and reports only a success for that ref", async () => {
    const f = stubFetch(reply(tx()), reply({ status: "error", message: "No transaction was found" }, 400), reply(tx({ tx_ref: "OTHER" })));
    expect(await fw().checkDeposit("DEP-NG1")).toEqual({ status: "SUCCEEDED", amountPesewas: 1300000n, currency: "NGN" });
    expect(sent(f).url).toBe("https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=DEP-NG1");
    expect(await fw().checkDeposit("DEP-NG1")).toBeNull(); // not paid yet
    expect(await fw().checkDeposit("DEP-NG1")).toBeNull(); // someone else's payment
  });
});
