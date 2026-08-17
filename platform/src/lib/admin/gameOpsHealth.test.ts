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

  it("goes red at or above a fifth of attempts", () => {
    expect(statusFor(2, 10)).toBe("red");
    expect(statusFor(1, 10)).toBe("yellow");
    expect(statusFor(19, 100)).toBe("yellow");
    expect(statusFor(20, 100)).toBe("red");
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
