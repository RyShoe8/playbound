import { describe, expect, it } from "vitest";
import {
  dungeonKeeperGoldHardwareRequirements,
  dungeonKeeperGoldSystemRequirements,
} from "./data/dungeonKeeperGoldSpecs";
import {
  isUsableSystemRequirements,
  pickHardwareRequirements,
  pickSystemRequirements,
} from "./catalogRequirements";

describe("catalog requirement overlay", () => {
  it("treats the emptyGameDraft placeholder as unused", () => {
    expect(
      isUsableSystemRequirements({
        min: "See official site",
        recommended: "See official site",
      })
    ).toBe(false);
  });

  it("lets Dungeon Keeper Gold specs replace Mongo placeholders", () => {
    expect(
      pickSystemRequirements(
        { min: "See official site", recommended: "See official site" },
        undefined,
        dungeonKeeperGoldSystemRequirements
      )
    ).toEqual(dungeonKeeperGoldSystemRequirements);

    expect(
      pickSystemRequirements(
        { min: "Modern web browser", recommended: "Modern web browser" },
        undefined,
        dungeonKeeperGoldSystemRequirements
      )
    ).toEqual(dungeonKeeperGoldSystemRequirements);

    expect(
      pickHardwareRequirements(
        { provenance: { source: "unverified" } },
        undefined,
        dungeonKeeperGoldHardwareRequirements
      )
    ).toEqual(dungeonKeeperGoldHardwareRequirements);
  });

  it("keeps a browser-game default when there is no overlay", () => {
    const stored = { min: "Modern web browser", recommended: "Modern web browser" };
    expect(pickSystemRequirements(stored)).toEqual(stored);
  });

  it("keeps real Mongo specs instead of overlaying them", () => {
    const storedText = { min: "Windows 98", recommended: "Windows XP" };
    expect(pickSystemRequirements(storedText, undefined, dungeonKeeperGoldSystemRequirements)).toEqual(
      storedText
    );

    const storedHw = { min: { ramMB: 1024 } };
    expect(pickHardwareRequirements(storedHw, undefined, dungeonKeeperGoldHardwareRequirements)).toEqual(
      storedHw
    );
  });
});
