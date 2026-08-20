import { describe, it, expect } from "vitest";
import { buildGameHealth, statusFor } from "./gameOpsHealth";

/**
 * The lights are only as good as the counting behind them. Two things are easy
 * to get wrong and invisible once wrong: counting a failed join twice, because
 * it emits both `launch_attempted` and `launch_failed`, and painting a game red
 * off a single failure nobody else has hit.
 */

type Outcome = "attempt" | "failed" | "failure_only";

function row(slug: string, area: "install" | "party", outcome: Outcome, count: number) {
  return { _id: { slug, area, outcome }, count };
}

describe("health thresholds", () => {
  it("is green whenever nothing failed, at any volume", () => {
    expect(statusFor(0, 0)).toBe("green");
    expect(statusFor(0, 1)).toBe("green");
    expect(statusFor(0, 5000)).toBe("green");
  });

  it("holds back red until there is enough evidence", () => {
    // One failure out of one attempt is 100%, but it is also one data point.
    expect(statusFor(1, 1)).toBe("yellow");
    expect(statusFor(1, 2)).toBe("yellow");
    expect(statusFor(1, 3)).toBe("red");
  });

  it("uses the 2.5% and 10% bands", () => {
    /*
     * Green under 2.5%, amber from 2.5% to 10%, red above 10% — the same bands
     * for install, join and party, so a row reads consistently across columns.
     */
    expect(statusFor(2, 100)).toBe("green"); // 2%
    expect(statusFor(3, 100)).toBe("yellow"); // 3%
    expect(statusFor(10, 100)).toBe("yellow"); // 10% is the top of amber
    expect(statusFor(11, 100)).toBe("red"); // above 10%
  });

  it("puts the boundaries where the labels say", () => {
    expect(statusFor(25, 1000)).toBe("yellow"); // exactly 2.5%
    expect(statusFor(24, 1000)).toBe("green"); // just under
    expect(statusFor(100, 1000)).toBe("yellow"); // exactly 10%
    expect(statusFor(101, 1000)).toBe("red"); // just over
  });
});

describe("health aggregation", () => {
  it("counts a failed join once, not twice", () => {
    // 10 join attempts, 2 of which failed. launch_failed is failure_only
    // precisely because launch_attempted already counted those two.
    const health = buildGameHealth([
      row("openra", "party", "attempt", 10),
      row("openra", "party", "failure_only", 2),
    ]);
    const party = health.get("openra")!.party;
    expect(party.attempts).toBe(10);
    expect(party.failed).toBe(2);
    expect(party.status).toBe("red");
  });

  it("counts a failed install as its own attempt", () => {
    // install_failed and edition_installed are mutually exclusive, so each is
    // one attempt and the failure has to add to both sides.
    const health = buildGameHealth([
      row("openra", "install", "attempt", 8),
      row("openra", "install", "failed", 2),
    ]);
    const install = health.get("openra")!.install;
    expect(install.attempts).toBe(10);
    expect(install.failed).toBe(2);
    expect(install.status).toBe("red");
  });

  it("keeps install and join independent", () => {
    const health = buildGameHealth([
      row("openra", "install", "attempt", 50),
      row("openra", "party", "attempt", 4),
      row("openra", "party", "failure_only", 3),
    ]);
    const game = health.get("openra")!;
    expect(game.install.status).toBe("green");
    expect(game.party.status).toBe("red");
  });

  it("keeps games separate", () => {
    const health = buildGameHealth([
      row("openra", "install", "failed", 5),
      row("openra", "install", "attempt", 5),
      row("openttd", "install", "attempt", 20),
    ]);
    expect(health.get("openra")!.install.status).toBe("red");
    expect(health.get("openttd")!.install.status).toBe("green");
  });

  it("returns nothing for games with no events", () => {
    const health = buildGameHealth([]);
    expect(health.size).toBe(0);
    // The table treats a missing entry as green rather than unknown.
    expect(health.get("openra")).toBeUndefined();
  });

  it("ignores rows with no slug or an unknown area", () => {
    const health = buildGameHealth([
      { _id: { slug: "", area: "install", outcome: "failed" }, count: 9 },
      { _id: { slug: "openra", area: "bogus" as "install", outcome: "failed" }, count: 9 },
    ]);
    expect(health.size).toBe(0);
  });
});
