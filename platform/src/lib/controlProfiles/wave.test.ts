import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { testingControlProfiles } from "../../../scripts/control-profiles/wave-1";
import { controlProfileSchema } from "./schema";

const controls = new Map<string, { schemes: Array<{ scheme: string; supported: boolean }> }>();
for (let i = 1; i <= 6; i++) {
  const batch = JSON.parse(readFileSync(join(process.cwd(), `scripts/control-batches/batch-${i}.json`), "utf8"));
  for (const [slug, record] of Object.entries(batch)) controls.set(slug, record as { schemes: Array<{ scheme: string; supported: boolean }> });
}

describe("PlayBound Controls preview wave", () => {
  it("contains only catalog-documented games without native controller support", () => {
    expect(testingControlProfiles).toHaveLength(16);
    for (const profile of testingControlProfiles) {
      const record = controls.get(profile.gameSlug);
      expect(record, profile.gameSlug).toBeDefined();
      expect(record?.schemes.some((scheme) => scheme.scheme === "keyboard" && scheme.supported), profile.gameSlug).toBe(true);
      expect(record?.schemes.some((scheme) => scheme.scheme === "controller" && scheme.supported), profile.gameSlug).toBe(false);
    }
  });

  it("keeps every unplayed recipe in testing while binding only real inputs and outputs", () => {
    for (const profile of testingControlProfiles) {
      expect(controlProfileSchema.safeParse(profile).success, profile.gameSlug).toBe(true);
      expect(profile.status).toBe("testing");
      expect(profile.testedControllers).toEqual([]);
      expect(new Set(profile.bindings.map((binding) => binding.physicalInput)).size, profile.gameSlug).toBe(profile.bindings.length);
    }
  });
});
