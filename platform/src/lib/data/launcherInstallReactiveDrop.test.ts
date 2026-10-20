import { describe, expect, it } from "vitest";
import { launcherInstallBySlug } from "./launcherInstall";

describe("Alien Swarm: Reactive Drop install recipe", () => {
  const recipe = launcherInstallBySlug["alien-swarm-reactive-drop"];

  it("names its own Steam app and shipped executable so detection never falls back to swarm.exe", () => {
    expect(recipe.steamAppId).toBe("563560");
    expect(new RegExp(recipe.exeHint ?? "", "i").test("reactivedrop.exe")).toBe(true);
    expect(recipe.knownExePaths?.some((p) => p.endsWith("\\Alien Swarm Reactive Drop\\reactivedrop.exe"))).toBe(true);
  });
});

describe("Alien Swarm parent entry", () => {
  it("also knows Reactive Drop's executable, since Locate and the scan use the game's entry", () => {
    const parent = launcherInstallBySlug["alien-swarm"];
    expect(parent.knownExePaths?.some((p) => p.endsWith("\\Alien Swarm Reactive Drop\\reactivedrop.exe"))).toBe(true);
    expect(parent.knownExePaths?.some((p) => p.endsWith("\\alien swarm\\swarm.exe"))).toBe(true);
  });
});
