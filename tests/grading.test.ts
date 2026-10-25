import { describe, it, expect } from "vitest";
import { grade } from "../src/lib/settlement";

describe("market grading", () => {
  it("grades 1X2", () => {
    expect(grade("MATCH_RESULT", "1", null, 2, 1)).toBe("WON");
    expect(grade("MATCH_RESULT", "X", null, 1, 1)).toBe("WON");
    expect(grade("MATCH_RESULT", "2", null, 0, 3)).toBe("WON");
    expect(grade("MATCH_RESULT", "1", null, 0, 0)).toBe("LOST");
  });
  it("grades double chance", () => {
    expect(grade("DOUBLE_CHANCE", "1X", null, 1, 1)).toBe("WON");
    expect(grade("DOUBLE_CHANCE", "1X", null, 0, 2)).toBe("LOST");
    expect(grade("DOUBLE_CHANCE", "12", null, 1, 1)).toBe("LOST");
    expect(grade("DOUBLE_CHANCE", "X2", null, 2, 3)).toBe("WON");
  });
  it("grades over/under with .5 lines (no push)", () => {
    expect(grade("OVER_UNDER", "OVER", 2.5, 2, 1)).toBe("WON");
    expect(grade("OVER_UNDER", "OVER", 2.5, 1, 1)).toBe("LOST");
    expect(grade("OVER_UNDER", "UNDER", 2.5, 1, 1)).toBe("WON");
  });
  it("pushes (VOID) on an integer total line", () => {
    expect(grade("OVER_UNDER", "OVER", 3, 2, 1)).toBe("VOID");
  });
  it("grades BTTS", () => {
    expect(grade("BTTS", "BTTS_YES", null, 1, 2)).toBe("WON");
    expect(grade("BTTS", "BTTS_YES", null, 0, 2)).toBe("LOST");
    expect(grade("BTTS", "BTTS_NO", null, 0, 2)).toBe("WON");
  });
  it("voids a drawn moneyline", () => {
    expect(grade("MONEYLINE", "1", null, 90, 90)).toBe("VOID");
    expect(grade("MONEYLINE", "1", null, 99, 90)).toBe("WON");
  });
});

describe("handicap grading (line = home handicap)", () => {
  it("half lines never push", () => {
    expect(grade("HANDICAP", "1", 0.5, 1, 1)).toBe("WON"); // home +0.5, draw -> home covers
    expect(grade("HANDICAP", "2", 0.5, 1, 1)).toBe("LOST");
    expect(grade("HANDICAP", "1", -1.5, 2, 1)).toBe("LOST"); // home -1.5 wins by 1 -> fails
    expect(grade("HANDICAP", "2", -1.5, 2, 1)).toBe("WON");
    expect(grade("HANDICAP", "1", -1.5, 3, 1)).toBe("WON");
  });
  it("whole lines push (VOID) when the adjusted score is level", () => {
    expect(grade("HANDICAP", "1", -1, 2, 1)).toBe("VOID");
    expect(grade("HANDICAP", "2", -1, 2, 1)).toBe("VOID");
    expect(grade("HANDICAP", "1", 0, 0, 0)).toBe("VOID"); // level handicap on a draw
  });
  it("works for basketball point spreads", () => {
    expect(grade("HANDICAP", "1", -5.5, 110, 104)).toBe("WON");
    expect(grade("HANDICAP", "2", -5.5, 110, 105)).toBe("WON");
  });
});

describe("draw no bet grading", () => {
  it("refunds on a draw, otherwise straight winner", () => {
    expect(grade("DRAW_NO_BET", "1", null, 1, 1)).toBe("VOID");
    expect(grade("DRAW_NO_BET", "2", null, 1, 1)).toBe("VOID");
    expect(grade("DRAW_NO_BET", "1", null, 2, 1)).toBe("WON");
    expect(grade("DRAW_NO_BET", "2", null, 2, 1)).toBe("LOST");
  });

  it("grades extra over/under lines like the main one, including pushes", () => {
    expect(grade("ALT_TOTAL", "OVER", 1.5, 1, 1)).toBe("WON");
    expect(grade("ALT_TOTAL", "UNDER", 4.5, 2, 1)).toBe("WON");
    expect(grade("ALT_TOTAL", "OVER", 2, 1, 1)).toBe("VOID");
  });
  it("grades team totals on that team's goals only", () => {
    expect(grade("HOME_TOTAL", "OVER", 1.5, 2, 0)).toBe("WON");
    expect(grade("HOME_TOTAL", "OVER", 1.5, 1, 5)).toBe("LOST"); // away goals don't count
    expect(grade("AWAY_TOTAL", "UNDER", 0.5, 3, 0)).toBe("WON");
    expect(grade("AWAY_TOTAL", "OVER", 1, 0, 1)).toBe("VOID"); // whole line push
  });
  it("grades extra handicap lines with the home team's line", () => {
    expect(grade("ALT_HANDICAP", "1", -1.5, 3, 1)).toBe("WON");
    expect(grade("ALT_HANDICAP", "2", -1.5, 2, 1)).toBe("WON");
    expect(grade("ALT_HANDICAP", "1", 1, 0, 1)).toBe("VOID");
  });
  it("grades correct score on the exact final score", () => {
    expect(grade("CORRECT_SCORE", "2-1", null, 2, 1)).toBe("WON");
    expect(grade("CORRECT_SCORE", "1-2", null, 2, 1)).toBe("LOST");
    expect(grade("CORRECT_SCORE", "10-0", null, 10, 0)).toBe("WON");
    expect(grade("CORRECT_SCORE", "junk", null, 1, 1)).toBe("VOID");
  });
  it("grades odd/even total goals (0 is even)", () => {
    expect(grade("ODD_EVEN", "ODD", null, 2, 1)).toBe("WON");
    expect(grade("ODD_EVEN", "EVEN", null, 0, 0)).toBe("WON");
    expect(grade("ODD_EVEN", "EVEN", null, 1, 0)).toBe("LOST");
  });
  it("grades correct score 'Other': any side above 4 goals", () => {
    expect(grade("CORRECT_SCORE", "OTHER", null, 5, 0)).toBe("WON");
    expect(grade("CORRECT_SCORE", "OTHER", null, 2, 6)).toBe("WON");
    expect(grade("CORRECT_SCORE", "OTHER", null, 4, 4)).toBe("LOST");
    expect(grade("CORRECT_SCORE", "4-4", null, 4, 4)).toBe("WON");
  });
});
