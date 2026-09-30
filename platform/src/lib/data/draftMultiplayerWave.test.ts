import { describe, expect, it } from "vitest";
import { ADD_GAME_FEATURES, FILL_MISSING_STEAM_LAUNCH, PATCH_GAME_FIELDS, SKIP_MISSING_PATCH_GAMES, STEAM_CLIENT_EXE_HINTS } from "../../../scripts/insert-catalog-wave.allowlist";
import { correctionsFor } from "./catalogCorrections";
import { FEATURES } from "../gamePayload";

describe("draft multiplayer catalog wave", () => {
  it("has a source for each named field and only adds canonical feature chips", () => {
    const canonical = new Set<string>(FEATURES);
    for (const [slug, features] of Object.entries(ADD_GAME_FEATURES)) {
      expect(PATCH_GAME_FIELDS[slug]).toBeDefined();
      for (const feature of features) expect(canonical.has(feature)).toBe(true);
      const source = correctionsFor(slug);
      for (const field of PATCH_GAME_FIELDS[slug]) {
        // Older patch entries source their fields elsewhere; only the new
        // draft slugs are required to live in the correction overlay.
        if (slug in FILL_MISSING_STEAM_LAUNCH || ["battlefield-1942-the-complete-collection", "vintage-story", "rimworld"].includes(slug)) {
          expect(source?.[field]).not.toBeUndefined();
        }
      }
    }
  });

  it("never gives an unreleased game or DLC a standalone party recipe", () => {
    for (const slug of ["witchbrook", "risk-of-rain-2-alloyed-collective"]) {
      expect(PATCH_GAME_FIELDS[slug]).toBeUndefined();
      expect(ADD_GAME_FEATURES[slug]).toBeUndefined();
      expect(FILL_MISSING_STEAM_LAUNCH[slug]).toBeUndefined();
    }
  });

  it("waits for the base Risk of Rain 2 slug without using the DLC app id", () => {
    expect(SKIP_MISSING_PATCH_GAMES).toEqual(["risk-of-rain-2"]);
    expect(correctionsFor("risk-of-rain-2")?.steamAppId).toBe("632360");
    expect(FILL_MISSING_STEAM_LAUNCH["risk-of-rain-2"]).toBe("632360");
    expect(STEAM_CLIENT_EXE_HINTS["risk-of-rain-2"]).toBe("Risk of Rain 2.exe");
  });
});

