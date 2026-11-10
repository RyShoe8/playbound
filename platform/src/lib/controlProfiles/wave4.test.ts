import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { testingControlProfilesWave4 } from "../../../scripts/control-profiles/wave-4";
import { controlProfileSchema } from "./schema";

const controls = new Map<string, { schemes: Array<{ scheme: string; supported: boolean }> }>();
for (let i = 1; i <= 7; i++) {
  const batch = JSON.parse(readFileSync(join(process.cwd(), `scripts/control-batches/batch-${i}.json`), "utf8"));
  for (const [slug, record] of Object.entries(batch)) controls.set(slug, record as { schemes: Array<{ scheme: string; supported: boolean }> });
}

describe("PlayBound Controls preview wave 4", () => {
  it("contains only catalog-documented games without native controller support", () => {
    expect(testingControlProfilesWave4).toHaveLength(10);
    for (const profile of testingControlProfilesWave4) {
      const record = controls.get(profile.gameSlug);
      expect(record, profile.gameSlug).toBeDefined();
      expect(record?.schemes.some((scheme) => scheme.scheme === "keyboard" && scheme.supported), profile.gameSlug).toBe(true);
      expect(record?.schemes.some((scheme) => scheme.scheme === "controller" && scheme.supported), profile.gameSlug).toBe(false);
    }
  });

  it("keeps every unplayed recipe in testing while binding only real inputs and outputs", () => {
    for (const profile of testingControlProfilesWave4) {
      expect(controlProfileSchema.safeParse(profile).success, profile.gameSlug).toBe(true);
      expect(profile.status).toBe("testing");
      expect(profile.testedControllers).toEqual([]);
      expect(new Set(profile.bindings.map((binding) => binding.physicalInput)).size, profile.gameSlug).toBe(profile.bindings.length);
    }
  });

  it("does not repeat a game already covered by waves 1-3", async () => {
    const { testingControlProfiles } = await import("../../../scripts/control-profiles/wave-1");
    const { testingControlProfilesWave2 } = await import("../../../scripts/control-profiles/wave-2");
    const { testingControlProfilesWave3 } = await import("../../../scripts/control-profiles/wave-3");
    const earlier = new Set([...testingControlProfiles, ...testingControlProfilesWave2, ...testingControlProfilesWave3].map((p) => p.gameSlug));
    const overlap = testingControlProfilesWave4.filter((p) => earlier.has(p.gameSlug));
    expect(overlap.map((p) => p.gameSlug)).toEqual([]);
  });

  it("every action id used in bindings is declared, and every declared action is bound", () => {
    for (const profile of testingControlProfilesWave4) {
      const actionIds = new Set(profile.actions.map((a) => a.id));
      const boundIds = new Set(profile.bindings.map((b) => b.actionId));
      for (const b of profile.bindings) expect(actionIds.has(b.actionId), `${profile.gameSlug}: ${b.actionId}`).toBe(true);
      for (const id of actionIds) expect(boundIds.has(id), `${profile.gameSlug}: ${id} unbound`).toBe(true);
    }
  });
});
