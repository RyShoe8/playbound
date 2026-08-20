import { describe, it, expect } from "vitest";
import {
  groupInstallsBySlug,
  editionsFromRow,
  primaryEditionFromRow,
} from "./installedEditions";
import { libraryHasRequiredEdition, BASE_EDITION_KEY } from "@/lib/playTogether/editionMatch";

/**
 * Multi-edition library rows.
 *
 * The bug: one row per {user, game, platform} carrying a single `editionSlug`,
 * while the launcher sends one entry per installed edition. Each write
 * overwrote the last, so a player with two builds had one silently discarded —
 * and party config-sync then reported them missing an edition on their disk.
 */

describe("grouping the launcher's per-edition entries", () => {
  it("keeps every edition of one game in a single row", () => {
    // Exactly what the launcher sends for two installed builds.
    const grouped = groupInstallsBySlug([
      { slug: "holocure", editionSlug: "holocure-playbound", version: "0.7" },
      { slug: "holocure", editionSlug: "official" },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].installedEditions).toEqual(["holocure-playbound", "official"]);
  });

  it("does not let a later edition overwrite the primary", () => {
    // The regression itself: "official" arriving second used to win outright.
    const grouped = groupInstallsBySlug([
      { slug: "holocure", editionSlug: "holocure-playbound" },
      { slug: "holocure", editionSlug: "official" },
    ]);
    expect(grouped[0].editionSlug).toBe("holocure-playbound");
  });

  it("keeps separate games separate", () => {
    const grouped = groupInstallsBySlug([
      { slug: "holocure", editionSlug: "official" },
      { slug: "0ad", editionSlug: "official" },
    ]);
    expect(grouped.map((g) => g.slug).sort()).toEqual(["0ad", "holocure"]);
  });

  it("handles an unlabelled install", () => {
    const grouped = groupInstallsBySlug([{ slug: "luanti", version: "5.16.1" }]);
    expect(grouped[0]).toMatchObject({
      slug: "luanti",
      editionSlug: null,
      installedEditions: [],
      version: "5.16.1",
    });
  });

  it("dedupes a repeated edition", () => {
    const grouped = groupInstallsBySlug([
      { slug: "holocure", editionSlug: "official" },
      { slug: "holocure", editionSlug: "official" },
    ]);
    expect(grouped[0].installedEditions).toEqual(["official"]);
  });

  it("ignores entries with no slug", () => {
    expect(groupInstallsBySlug([{ slug: "", editionSlug: "official" }])).toEqual([]);
  });
});

describe("reading editions back off a row", () => {
  it("reports every installed edition", () => {
    const set = editionsFromRow({
      installed: true,
      editionSlug: "holocure-playbound",
      installedEditions: ["holocure-playbound", "official"],
    });
    expect(set.has("holocure-playbound")).toBe(true);
    expect(set.has("official")).toBe(true);
  });

  it("counts any install as having the base game", () => {
    // A party that only picked the title needs nothing more specific.
    const set = editionsFromRow({ installed: true, installedEditions: ["official"] });
    expect(set.has(BASE_EDITION_KEY)).toBe(true);
  });

  it("falls back to editionSlug on a legacy row", () => {
    // Rows written before installedEditions existed must not read as empty.
    const set = editionsFromRow({ installed: true, editionSlug: "holocure-playbound" });
    expect(set.has("holocure-playbound")).toBe(true);
  });

  it("reports nothing for a row that is not installed", () => {
    const set = editionsFromRow({
      installed: false,
      editionSlug: "official",
      installedEditions: ["official"],
    });
    expect(set.size).toBe(0);
  });
});

describe("the party question this all exists to answer", () => {
  it("a member with both builds is not told they are missing one", () => {
    // The user-visible bug, end to end: launcher reports two editions, the
    // party wants the PlayBound one, the member has it.
    const [row] = groupInstallsBySlug([
      { slug: "holocure", editionSlug: "holocure-playbound" },
      { slug: "holocure", editionSlug: "official" },
    ]);
    const installed = editionsFromRow({ installed: true, ...row });
    expect(libraryHasRequiredEdition(installed, "holocure-playbound")).toBe(true);
  });

  it("finds an edition that is installed but not the member's default", () => {
    /*
     * The case the array exists for. Asking only about the primary would pass
     * even with the old single-slug row, so this is what actually distinguishes
     * the fix: the party wants the build this member keeps as a secondary.
     */
    const [row] = groupInstallsBySlug([
      { slug: "holocure", editionSlug: "official" },
      { slug: "holocure", editionSlug: "holocure-playbound" },
    ]);
    expect(row.editionSlug).toBe("official");
    const installed = editionsFromRow({ installed: true, ...row });
    expect(libraryHasRequiredEdition(installed, "holocure-playbound")).toBe(true);
  });

  it("still says no when they genuinely lack the edition", () => {
    // The check must keep failing when it should, or it is worthless.
    const installed = editionsFromRow({ installed: true, installedEditions: ["official"] });
    expect(libraryHasRequiredEdition(installed, "holocure-playbound")).toBe(false);
  });
});

describe("which build the party points at", () => {
  it("prefers the row's declared default", () => {
    expect(
      primaryEditionFromRow({
        installed: true,
        editionSlug: "holocure-playbound",
        installedEditions: ["official", "holocure-playbound"],
      })
    ).toBe("holocure-playbound");
  });

  it("falls back to a real edition when the default is an official build", () => {
    expect(
      primaryEditionFromRow({
        installed: true,
        editionSlug: "official",
        installedEditions: ["official", "holocure-playbound"],
      })
    ).toBe("holocure-playbound");
  });

  it("requires no particular edition when only official builds exist", () => {
    expect(
      primaryEditionFromRow({ installed: true, installedEditions: ["official"] })
    ).toBe(BASE_EDITION_KEY);
  });
});
