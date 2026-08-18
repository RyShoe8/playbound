import { describe, it, expect } from "vitest";
import {
  dungeonKeeperGoldHardwareRequirements,
  dungeonKeeperGoldSystemRequirements,
} from "./dungeonKeeperGoldSpecs";

describe("dungeonKeeperGoldSpecs", () => {
  it("matches the DOSBox Gold PC figures", () => {
    expect(dungeonKeeperGoldSystemRequirements.min).toContain("Windows 7");
    expect(dungeonKeeperGoldSystemRequirements.recommended).toContain("Windows 10");
    expect(dungeonKeeperGoldHardwareRequirements.min?.ramMB).toBe(256);
    expect(dungeonKeeperGoldHardwareRequirements.min?.storageMB).toBe(500);
    expect(dungeonKeeperGoldHardwareRequirements.min?.cpuText).toBe("1 GHz");
    expect(dungeonKeeperGoldHardwareRequirements.min?.os).toEqual(["windows"]);
    expect(dungeonKeeperGoldHardwareRequirements.recommended?.ramMB).toBe(512);
    expect(dungeonKeeperGoldHardwareRequirements.recommended?.storageMB).toBe(800);
    expect(dungeonKeeperGoldHardwareRequirements.provenance?.source).toBe("developer");
    expect(dungeonKeeperGoldHardwareRequirements.provenance?.sourceUrl).toMatch(/gog\.com/);
  });
});
