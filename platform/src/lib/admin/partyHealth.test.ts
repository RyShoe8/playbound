import { describe, it, expect } from "vitest";
import { buildPartyHealth, emptyPartyHealth, type PartyEventRow } from "./partyHealth";

/**
 * The Ops party-failure stat.
 *
 * The party system emitted two failure events out of every way it can break;
 * everything else was a `console.warn` nobody would ever read. These assert the
 * shape Ops renders, including the two things easiest to get wrong: an empty
 * window must not read as 0% (that claims health nobody measured), and the area
 * breakdown has to survive being summed across windows.
 */

const row = (
  event: string,
  area: string | null,
  counts: { d1?: number; d7?: number; d30?: number }
): PartyEventRow => ({
  _id: { event, area },
  d1: counts.d1 ?? 0,
  d7: counts.d7 ?? 0,
  d30: counts.d30 ?? 0,
});

describe("rate", () => {
  it("is null when nothing happened, not zero", () => {
    // 0% would claim a health nobody measured.
    const h = buildPartyHealth([]);
    expect(h.d1.overall.rate).toBeNull();
    expect(h.d1.overall.failed).toBe(0);
  });

  it("counts failures against successes", () => {
    const h = buildPartyHealth([
      row("party_failed", "discord", { d1: 1, d7: 1, d30: 1 }),
      row("party_ok", null, { d1: 3, d7: 3, d30: 3 }),
    ]);
    expect(h.d1.overall.failed).toBe(1);
    expect(h.d1.overall.completed).toBe(3);
    expect(h.d1.overall.rate).toBe(25);
  });

  it("treats every non-failure event as a success", () => {
    // party_hosted_ready and party_lan_ready are outcomes worth counting.
    const h = buildPartyHealth([
      row("party_hosted_ready", null, { d1: 2, d30: 2 }),
      row("party_lan_ready", null, { d1: 2, d30: 2 }),
      row("party_failed", "lan", { d1: 0, d30: 4 }),
    ]);
    expect(h.d1.overall.completed).toBe(4);
    expect(h.d1.overall.rate).toBe(0);
    expect(h.d30.overall.rate).toBe(50);
  });

  it("reads 100% when everything failed", () => {
    const h = buildPartyHealth([row("party_failed", "sync", { d1: 5, d30: 5 })]);
    expect(h.d1.overall.rate).toBe(100);
  });
});

describe("area breakdown", () => {
  it("says what is failing, largest first", () => {
    // "12 failures" is noise; "12, all Discord" points at the bot.
    const h = buildPartyHealth([
      row("party_failed", "discord", { d1: 7, d30: 7 }),
      row("party_failed", "sync", { d1: 2, d30: 2 }),
      row("party_failed", "lan", { d1: 3, d30: 3 }),
    ]);
    expect(h.d1.byArea).toEqual([
      { area: "discord", failed: 7 },
      { area: "lan", failed: 3 },
      { area: "sync", failed: 2 },
    ]);
    expect(h.d1.overall.failed).toBe(12);
  });

  it("buckets a missing area rather than dropping it", () => {
    const h = buildPartyHealth([row("party_failed", null, { d1: 2, d30: 2 })]);
    expect(h.d1.byArea).toEqual([{ area: "unknown", failed: 2 }]);
  });

  it("is empty when nothing failed", () => {
    const h = buildPartyHealth([row("party_ok", null, { d1: 4, d30: 4 })]);
    expect(h.d1.byArea).toEqual([]);
  });

  it("keeps windows independent", () => {
    // A failure 20 days ago must not show in the 24h breakdown.
    const h = buildPartyHealth([row("party_failed", "discord", { d1: 0, d7: 0, d30: 6 })]);
    expect(h.d1.byArea).toEqual([]);
    expect(h.d30.byArea).toEqual([{ area: "discord", failed: 6 }]);
  });
});

describe("empty shape", () => {
  it("has every window so the card never indexes undefined", () => {
    const h = emptyPartyHealth();
    for (const w of ["d1", "d7", "d30"] as const) {
      expect(h[w].overall.rate).toBeNull();
      expect(h[w].byArea).toEqual([]);
    }
  });
});
