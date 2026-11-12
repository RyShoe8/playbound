import { describe, expect, it } from "vitest";
import { testingControlProfilesWave6 } from "../../../scripts/control-profiles/wave-6";
import { controlProfileSchema } from "./schema";

/*
 * Wave 6 adds its curated controls to the catalog in the same change, so this
 * checks the recipes' own structure; the sources are named in wave-6.ts.
 */
describe("PlayBound Controls preview wave 6", () => {
  it("keeps every unplayed recipe in testing while binding only real inputs and outputs", () => {
    expect(testingControlProfilesWave6).toHaveLength(2);
    for (const profile of testingControlProfilesWave6) {
      expect(controlProfileSchema.safeParse(profile).success, profile.gameSlug).toBe(true);
      expect(profile.status).toBe("testing");
      expect(profile.testedControllers).toEqual([]);
      expect(new Set(profile.bindings.map((binding) => binding.physicalInput)).size, profile.gameSlug).toBe(profile.bindings.length);
    }
  });

  it("does not repeat a game already covered by waves 1-5", async () => {
    const earlier = new Set<string>();
    const { testingControlProfiles } = await import("../../../scripts/control-profiles/wave-1");
    const { testingControlProfilesWave2 } = await import("../../../scripts/control-profiles/wave-2");
    const { testingControlProfilesWave3 } = await import("../../../scripts/control-profiles/wave-3");
    const { testingControlProfilesWave4 } = await import("../../../scripts/control-profiles/wave-4");
    const { testingControlProfilesWave5 } = await import("../../../scripts/control-profiles/wave-5");
    for (const p of [...testingControlProfiles, ...testingControlProfilesWave2, ...testingControlProfilesWave3, ...testingControlProfilesWave4, ...testingControlProfilesWave5]) earlier.add(p.gameSlug);
    expect(testingControlProfilesWave6.filter((p) => earlier.has(p.gameSlug)).map((p) => p.gameSlug)).toEqual([]);
  });

  it("every action id used in bindings is declared, and every declared action is bound", () => {
    for (const profile of testingControlProfilesWave6) {
      const actionIds = new Set(profile.actions.map((a) => a.id));
      const boundIds = new Set(profile.bindings.map((b) => b.actionId));
      for (const b of profile.bindings) expect(actionIds.has(b.actionId), `${profile.gameSlug}: ${b.actionId}`).toBe(true);
      for (const id of actionIds) expect(boundIds.has(id), `${profile.gameSlug}: ${id} unbound`).toBe(true);
    }
  });
});
