import { afterEach, describe, expect, it, vi } from "vitest";
import { emails, resetLink, sendEmail } from "../src/lib/email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("emails", () => {
  it("puts the code in the subject and body", () => {
    const m = emails.verifyCode("a@b.gh", "042917");
    expect(m.subject).toBe("042917 is your Bet Zone code");
    expect(m.html).toContain("042917");
    expect(m.text).toContain("042917");
  });

  it("escapes values inside the HTML", () => {
    const m = emails.win("a@b.gh", 2_000n, "<script>x</script>");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.subject).toBe("You won GHS 20.00 on Bet Zone");
  });

  it("builds reset links on the live domain", () => {
    vi.stubEnv("APP_URL", "https://888soccerbet.com/");
    expect(resetLink("tok")).toBe("https://888soccerbet.com/account/setup/tok");
  });
});

describe("sendEmail", () => {
  it("does nothing without an API key", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await sendEmail(emails.verifyCode("a@b.gh", "123456"))).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("posts to Brevo and never throws on failure", async () => {
    vi.stubEnv("BREVO_API_KEY", "k");
    const f = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", f);
    expect(await sendEmail(emails.verifyCode("a@b.gh", "123456"))).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(JSON.parse(init.body as string)).toMatchObject({ sender: { email: "no-reply@betzone.com.co" }, to: [{ email: "a@b.gh" }] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await sendEmail(emails.verifyCode("a@b.gh", "123456"))).toBe(false);
  });
});

describe("money notices for Nigerian players", () => {
  it("state amounts in Naira and say the withdrawal went to their bank", () => {
    const ngn = { code: "NGN" as const, rate: 130 };
    expect(emails.win("a@b.ng", 10_000n, "R1", ngn).subject).toBe("You won ₦13,000.00 on Bet Zone");
    expect(emails.deposit("a@b.ng", 5_000n, "R2", ngn).subject).toBe("Deposit received: ₦6,500.00");
    const w = emails.withdrawal("a@b.ng", 200_000n, "R3", ngn);
    expect(w.subject).toBe("Withdrawal paid: ₦260,000.00");
    expect(w.text).toContain("to your bank account");
    expect(emails.withdrawal("a@b.gh", 200_000n, "R4").text).toContain("GHS 2,000.00 to your mobile money account");
  });
});
