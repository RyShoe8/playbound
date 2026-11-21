import { describe, expect, it } from "vitest";
import { filterFor, parseWave } from "../../scripts/insert-catalog-wave";

const draftWave = {
  id: "draft-game-review",
  operations: [{
    kind: "game",
    key: "example-game",
    requireStatus: "draft",
    expected: { tagline: "Old" },
    set: { tagline: "New" },
  }],
};

describe("catalog wave draft guard", () => {
  it("requires the game to remain Draft at both read and write", () => {
    const wave = parseWave(draftWave);
    expect(filterFor(wave.operations[0])).toEqual({ slug: "example-game", status: "draft" });
  });

  it("rejects invalid status constraints", () => {
    expect(() => parseWave({
      ...draftWave,
      operations: [{ ...draftWave.operations[0], requireStatus: "published" }],
    })).toThrow();
  });
});

