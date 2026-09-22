import { describe, expect, it } from "vitest";
import { parseHorizonPlayerCount } from "./horizonxi";

/**
 * The endpoint returns a bare integer with no JSON envelope, which makes the
 * failure modes unusually easy to get wrong: `Number("")` is 0, and an HTML
 * error page parsed with `parseInt` is NaN. Either one rendering as a player
 * count would tell visitors a server with two thousand people on it is empty.
 */
describe("parseHorizonPlayerCount", () => {
  it("reads a plain integer body", () => {
    expect(parseHorizonPlayerCount("1894")).toBe(1894);
  });

  it("tolerates surrounding whitespace and a trailing newline", () => {
    expect(parseHorizonPlayerCount("  1894\n")).toBe(1894);
  });

  it("accepts a genuine zero", () => {
    // 0 is a real answer here — a server can be down for maintenance — and is
    // distinct from the unknown cases below.
    expect(parseHorizonPlayerCount("0")).toBe(0);
  });

  it("returns null for an empty body rather than zero", () => {
    expect(parseHorizonPlayerCount("")).toBeNull();
    expect(parseHorizonPlayerCount("   ")).toBeNull();
  });

  it("returns null for an error page", () => {
    expect(parseHorizonPlayerCount("<!DOCTYPE html><html>Cannot GET</html>")).toBeNull();
    expect(parseHorizonPlayerCount("Not Found")).toBeNull();
  });

  it("returns null for a JSON envelope it was not expecting", () => {
    // If upstream ever wraps the value, we want a loud unknown, not a 0.
    expect(parseHorizonPlayerCount('{"online":1894}')).toBeNull();
  });

  it("rejects negative and non-integer values", () => {
    expect(parseHorizonPlayerCount("-5")).toBeNull();
    expect(parseHorizonPlayerCount("18.94")).toBeNull();
  });

  it("rejects an implausibly large value", () => {
    // A seven-digit ceiling: Horizon peaks in the low thousands, and a number
    // this size means the endpoint changed meaning, not that it got popular.
    expect(parseHorizonPlayerCount("12345678")).toBeNull();
  });
});
