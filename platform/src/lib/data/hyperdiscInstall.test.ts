import { describe, expect, it } from "vitest";
import { launcherInstallSchema } from "../gamePayload";
import { correctionsFor } from "./catalogCorrections";
import { PATCH_GAME_FIELDS } from "../../../scripts/insert-catalog-wave.allowlist";

describe("HyperDisc Arena one-click desktop recipe", () => {
  it("selects the corresponding official release archive on each platform", () => {
    const correction = correctionsFor("hyperdisc-arena");
    const recipe = launcherInstallSchema.parse(correction?.launcherInstall);
    expect(recipe.kind).toBe("github-zip");
    expect(recipe.repo).toBe("RyShoe8/hyperdisc-arena");
    for (const [pattern, asset] of [
      [recipe.assetPattern, "HyperDiscArena-windows.zip"],
      [recipe.assetPatternMac, "HyperDiscArena-macos.zip"],
      [recipe.assetPatternLinux, "HyperDiscArena-linux.zip"],
    ] as const) {
      expect(new RegExp(pattern || "").test(asset)).toBe(true);
    }
    expect(new RegExp(recipe.assetPatternMac || "").test("HyperDiscArena-windows.zip")).toBe(false);
    expect(correction?.platforms).toEqual(["Windows", "macOS", "Linux", "Web"]);
    expect(correction?.launchMethods).toEqual(["install", "browser"]);
    expect(PATCH_GAME_FIELDS["hyperdisc-arena"]).toEqual(["platforms", "launchMethods", "launcherInstall"]);
  });
});
