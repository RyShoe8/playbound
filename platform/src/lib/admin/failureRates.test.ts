import { describe, it, expect } from "vitest";
import {
  buildFailureRates,
  emptyFailureRates,
  FAILURE_RATE_EVENTS,
} from "./failureRates";

/**
 * The risk in this card is not the layout, it is counting the wrong events and
 * quietly reporting a healthier number than reality. These lock the arithmetic
 * and the event choices in place.
 */

function rows(
  counts: Partial<Record<string, { d1?: number; d7?: number; d30?: number }>>
) {
  return Object.entries(counts).map(([event, c]) => ({
    _id: event,
    d1: c?.d1 ?? 0,
    d7: c?.d7 ?? 0,
    d30: c?.d30 ?? 0,
  }));
}

describe("failure rate windows", () => {
  it("computes failures over failures plus completions", () => {
    const rates = buildFailureRates(
      rows({
        [FAILURE_RATE_EVENTS.installFailed]: { d1: 1, d7: 5, d30: 10 },
        [FAILURE_RATE_EVENTS.installCompleted]: { d1: 9, d7: 45, d30: 90 },
      })
    );
    expect(rates.d1.installs.rate).toBeCloseTo(10);
    expect(rates.d7.installs.rate).toBeCloseTo(10);
    expect(rates.d30.installs.rate).toBeCloseTo(10);
    expect(rates.d1.installs.failed).toBe(1);
    expect(rates.d1.installs.completed).toBe(9);
  });

  it("keeps installs and launches separate, and sums them for overall", () => {
    const rates = buildFailureRates(
      rows({
        [FAILURE_RATE_EVENTS.installFailed]: { d1: 2 },
        [FAILURE_RATE_EVENTS.installCompleted]: { d1: 8 },
        [FAILURE_RATE_EVENTS.launchFailed]: { d1: 1 },
        [FAILURE_RATE_EVENTS.launchCompleted]: { d1: 9 },
      })
    );
    expect(rates.d1.installs.rate).toBeCloseTo(20);
    expect(rates.d1.launches.rate).toBeCloseTo(10);
    // 3 failures out of 20 finished attempts.
    expect(rates.d1.overall.rate).toBeCloseTo(15);
    expect(rates.d1.overall.failed).toBe(3);
    expect(rates.d1.overall.completed).toBe(17);
  });

  it("reports no rate rather than 0% when nothing finished", () => {
    const rates = buildFailureRates([]);
    expect(rates.d1.overall.rate).toBeNull();
    expect(rates.d30.installs.rate).toBeNull();
  });

  it("reports 100% when everything failed", () => {
    const rates = buildFailureRates(
      rows({ [FAILURE_RATE_EVENTS.launchFailed]: { d1: 4 } })
    );
    expect(rates.d1.launches.rate).toBe(100);
    expect(rates.d1.launches.completed).toBe(0);
  });

  it("ignores events that are not part of the definition", () => {
    // game_installed and mod_installed come from library sync, and
    // launch_attempted / session_started would double-count a launch. None of
    // them may move the number.
    const rates = buildFailureRates(
      rows({
        game_installed: { d1: 100 },
        mod_installed: { d1: 100 },
        launch_attempted: { d1: 100 },
        session_started: { d1: 100 },
        [FAILURE_RATE_EVENTS.installFailed]: { d1: 1 },
        [FAILURE_RATE_EVENTS.installCompleted]: { d1: 1 },
      })
    );
    expect(rates.d1.overall.rate).toBe(50);
    expect(rates.d1.overall.completed).toBe(1);
  });

  it("counts each window independently, with 30d containing the others", () => {
    const rates = buildFailureRates(
      rows({
        [FAILURE_RATE_EVENTS.launchFailed]: { d1: 5, d7: 5, d30: 5 },
        [FAILURE_RATE_EVENTS.launchCompleted]: { d1: 5, d7: 95, d30: 995 },
      })
    );
    expect(rates.d1.launches.rate).toBeCloseTo(50);
    expect(rates.d7.launches.rate).toBeCloseTo(5);
    expect(rates.d30.launches.rate).toBeCloseTo(0.5);
  });

  it("counts party operations as their own row", () => {
    const rates = buildFailureRates(
      rows({
        [FAILURE_RATE_EVENTS.partyFailed]: { d1: 3, d7: 3, d30: 3 },
        [FAILURE_RATE_EVENTS.partyCompleted]: { d1: 9, d7: 9, d30: 9 },
      })
    );
    expect(rates.d1.party.failed).toBe(3);
    expect(rates.d1.party.completed).toBe(9);
    expect(rates.d1.party.rate).toBeCloseTo(25);
  });

  it("rolls party failures into overall", () => {
    // Overall is the top-line number; a party outage has to move it or the
    // card says everything is fine while parties are broken.
    const rates = buildFailureRates(
      rows({
        [FAILURE_RATE_EVENTS.installCompleted]: { d1: 10, d7: 10, d30: 10 },
        [FAILURE_RATE_EVENTS.partyFailed]: { d1: 10, d7: 10, d30: 10 },
      })
    );
    expect(rates.d1.installs.rate).toBe(0);
    expect(rates.d1.overall.failed).toBe(10);
    expect(rates.d1.overall.rate).toBeCloseTo(50);
  });

  it("leaves party null when no party events exist", () => {
    // Nothing recorded is not the same as nothing failing.
    const rates = buildFailureRates(
      rows({ [FAILURE_RATE_EVENTS.launchCompleted]: { d1: 4, d7: 4, d30: 4 } })
    );
    expect(rates.d1.party.rate).toBeNull();
    expect(rates.d1.overall.rate).toBe(0);
  });

  it("starts empty", () => {
    const empty = emptyFailureRates();
    for (const w of ["d1", "d7", "d30"] as const) {
      expect(empty[w].overall.failed).toBe(0);
      expect(empty[w].overall.rate).toBeNull();
    }
  });

  it("breaks down rates by platform while preserving aggregate numbers", () => {
    const rates = buildFailureRates([
      {
        _id: { event: FAILURE_RATE_EVENTS.installCompleted, platform: "win32" },
        d1: 9,
        d7: 18,
        d30: 27,
      },
      {
        _id: { event: FAILURE_RATE_EVENTS.installFailed, platform: "win32" },
        d1: 1,
        d7: 2,
        d30: 3,
      },
      {
        _id: { event: FAILURE_RATE_EVENTS.installCompleted, platform: "darwin" },
        d1: 5,
        d7: 10,
        d30: 15,
      },
      {
        _id: { event: FAILURE_RATE_EVENTS.installFailed, platform: "darwin" },
        d1: 5,
        d7: 10,
        d30: 15,
      },
    ]);

    // Global aggregates: 1 + 5 = 6 failed, 9 + 5 = 14 completed -> 6 / 20 = 30%
    expect(rates.d1.installs.rate).toBeCloseTo(30);
    expect(rates.d1.installs.failed).toBe(6);
    expect(rates.d1.installs.completed).toBe(14);

    // Platforms identified & sorted
    expect(rates.platforms).toEqual(["Windows", "macOS"]);

    // Windows: 1 failed, 9 completed -> 10%
    expect(rates.d1.byPlatform["Windows"].installs.rate).toBeCloseTo(10);
    expect(rates.d1.byPlatform["Windows"].installs.failed).toBe(1);
    expect(rates.d1.byPlatform["Windows"].installs.completed).toBe(9);

    // macOS: 5 failed, 5 completed -> 50%
    expect(rates.d1.byPlatform["macOS"].installs.rate).toBeCloseTo(50);
    expect(rates.d1.byPlatform["macOS"].installs.failed).toBe(5);
    expect(rates.d1.byPlatform["macOS"].installs.completed).toBe(5);
  });
});
