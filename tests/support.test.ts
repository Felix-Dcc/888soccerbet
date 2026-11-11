import { describe, it, expect } from "vitest";
import { telegramSupport } from "../src/lib/support";

describe("telegramSupport", () => {
  it("turns a handle or t.me link into a link players can open", () => {
    const want = { url: "https://t.me/BetZoneCare", label: "@BetZoneCare" };
    for (const s of ["@BetZoneCare", "BetZoneCare", " BetZoneCare ", "t.me/BetZoneCare", "https://t.me/BetZoneCare/", "http://telegram.me/BetZoneCare"])
      expect(telegramSupport(s)).toEqual(want);
    expect(telegramSupport("https://t.me/+AbC12_x")).toEqual({ url: "https://t.me/+AbC12_x", label: "Telegram" });
  });

  it("hides the link when the setting is empty or not a Telegram handle", () => {
    for (const s of ["", null, undefined, "@abc", "1BetZone", "bet zone", "https://evil.example/BetZoneCare", "t.me/BetZone/extra", "javascript:alert(1)"])
      expect(telegramSupport(s)).toBeNull();
  });
});
