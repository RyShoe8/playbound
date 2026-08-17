import { describe, expect, it } from "vitest";
import {
  slugifyClassification,
  INITIAL_TAXONOMY_SEED,
} from "./modClassifications";

describe("modClassifications utility functions", () => {
  it("generates correct kebab-case slugs", () => {
    expect(slugifyClassification("Vehicle")).toBe("vehicle");
    expect(slugifyClassification("Gameplay Overhaul")).toBe("gameplay-overhaul");
    expect(slugifyClassification("Quality of Life")).toBe("quality-of-life");
    expect(slugifyClassification("Special & Characters! 123")).toBe("special-characters-123");
  });

  it("contains complete taxonomy seed structure", () => {
    const rootNames = INITIAL_TAXONOMY_SEED.map((s) => s.name);
    expect(rootNames).toContain("Content");
    expect(rootNames).toContain("Gameplay");
    expect(rootNames).toContain("Vehicle");
    expect(rootNames).toContain("Character");
    expect(rootNames).toContain("Weapon");
    expect(rootNames).toContain("Map");
    expect(rootNames).toContain("Graphics");
    expect(rootNames).toContain("Audio");
    expect(rootNames).toContain("UI");
    expect(rootNames).toContain("Campaign");
    expect(rootNames).toContain("Multiplayer");
    expect(rootNames).toContain("Quality of Life");
    expect(rootNames).toContain("Performance");
    expect(rootNames).toContain("Accessibility");
    expect(rootNames).toContain("Tools");
    expect(rootNames).toContain("Framework");
    expect(rootNames).toContain("Localization");

    const vehicle = INITIAL_TAXONOMY_SEED.find((s) => s.name === "Vehicle");
    expect(vehicle?.children?.map((c) => c.name)).toEqual(
      expect.arrayContaining(["Aircraft", "Car", "Motorcycle", "Tank", "Ship", "Boat", "Train"])
    );

    const aircraft = vehicle?.children?.find((c) => c.name === "Aircraft");
    expect(aircraft?.children?.map((c) => c.name)).toEqual(
      expect.arrayContaining(["Fighter", "Bomber", "Helicopter", "Transport"])
    );
  });
});
