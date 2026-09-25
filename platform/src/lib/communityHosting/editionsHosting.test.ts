import { describe, expect, it } from "vitest";
import { rotationPriority } from "./rotation";

describe("edition rotation priority", () => {
  const now = new Date("2026-09-24T21:00:00Z");

  it("treats base game and edition profiles independently in rotation history", () => {
    const history = [
      { profileKey: "openra:base", onlineSince: new Date("2026-09-24T20:30:00Z") },
      { profileKey: "openra:combined-arms", onlineSince: new Date("2026-09-24T18:00:00Z") },
    ];

    // Combined Arms has been absent longer than the base game, so it gets higher priority
    const basePriority = rotationPriority(now, { key: "openra:base" }, history);
    const editionPriority = rotationPriority(now, { key: "openra:combined-arms" }, history);
    expect(editionPriority).toBeGreaterThan(basePriority);
  });

  it("prioritizes an unserved edition over a recently served base game", () => {
    const history = [
      { profileKey: "openra:base", onlineSince: new Date("2026-09-24T20:00:00Z") },
    ];

    const unservedEditionPriority = rotationPriority(now, { key: "openra:tiberian-dawn-hd" }, history);
    const basePriority = rotationPriority(now, { key: "openra:base" }, history);
    expect(unservedEditionPriority).toBeGreaterThan(basePriority);
  });
});
