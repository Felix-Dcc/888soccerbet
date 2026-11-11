import { describe, it, expect } from "vitest";
import { RESULT_CHECK_HOURS, resultCheckDue } from "../src/lib/resultChecks";

const MIN = 60_000;
const EVERY = 30 * MIN;

describe("resultCheckDue", () => {
  it("never checks before the first check age", () => {
    expect(resultCheckDue(0, EVERY)).toBe(false);
    expect(resultCheckDue(119 * MIN, EVERY)).toBe(false);
  });

  it("checks once per check age when runs come every 30 minutes", () => {
    // Simulate a run every 30 minutes from an arbitrary offset, over three days.
    for (const offset of [0, 7 * MIN, 29 * MIN]) {
      let checks = 0;
      for (let age = offset; age < 72 * 60 * MIN; age += EVERY) if (resultCheckDue(age, EVERY)) checks++;
      expect(checks).toBe(RESULT_CHECK_HOURS.length);
    }
  });

  it("stops after the last check age", () => {
    expect(resultCheckDue(48 * 60 * MIN + EVERY, EVERY)).toBe(false);
    expect(resultCheckDue(70 * 60 * MIN, EVERY)).toBe(false);
  });
});
