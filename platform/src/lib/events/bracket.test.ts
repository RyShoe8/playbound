import { describe, expect, it } from "vitest";
import { nextPowerOfTwoForTest } from "@/lib/events/bracketHelpers";

// Lightweight pure helpers extracted for testing advancement math.
describe("bracket helpers", () => {
  it("next power of two", () => {
    expect(nextPowerOfTwoForTest(1)).toBe(1);
    expect(nextPowerOfTwoForTest(2)).toBe(2);
    expect(nextPowerOfTwoForTest(3)).toBe(4);
    expect(nextPowerOfTwoForTest(5)).toBe(8);
  });
});
