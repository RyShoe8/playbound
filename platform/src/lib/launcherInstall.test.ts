import { describe, it, expect } from "vitest";
import { toLauncherCatalogEntry, LAUNCHER_INSTALL_KINDS } from "./launcherInstall";
import { launcherInstallBySlug } from "./data/launcherInstall";

const base = {
  slug: "x",
  title: "X",
  tagline: "t",
  sizeMB: 100,
  art: { from: "#000", to: "#fff" },
};

describe("owner-supplied installs", () => {
  it("tells the launcher to ask for an existing copy", () => {
    // Without requiresBaseDir reaching the launcher, an owner-supplied game
    // falls through to a normal install and fails with nothing to download.
    const entry = toLauncherCatalogEntry({
      ...base,
      launcherInstall: {
        enabled: true,
        kind: "locate-then-zip",
        requiresBaseDir: true,
        exeHint: "Freelancer",
      },
    });
    expect(entry.requiresBaseDir).toBe(true);
    expect(entry.kind).toBe("locate-then-zip");
  });

  it("omits the flag for ordinary downloads", () => {
    const entry = toLauncherCatalogEntry({
      ...base,
      launcherInstall: { enabled: true, kind: "direct-zip", url: "https://x.test/a.zip" },
    });
    expect(entry.requiresBaseDir).toBeUndefined();
  });

  it("recognises locate-then-zip as a valid kind", () => {
    expect(LAUNCHER_INSTALL_KINDS).toContain("locate-then-zip");
  });
});

describe("commercial base games are never distributed", () => {
  // Freelancer is still Microsoft's copyright. PlayBound lists it for the
  // community mods built on it, so the recipe must locate a copy the player
  // already owns rather than download one.
  it("Freelancer asks for the player's own copy and downloads nothing", () => {
    const recipe = launcherInstallBySlug["freelancer"];
    expect(recipe).toBeDefined();
    expect(recipe.kind).toBe("locate-then-zip");
    expect(recipe.requiresBaseDir).toBe(true);
    expect(recipe.url ?? null).toBeNull();
  });

  it("Freelancer's recipe never points at an archive of the retail disc", () => {
    const recipe = launcherInstallBySlug["freelancer"];
    const serialised = JSON.stringify(recipe);
    expect(serialised).not.toMatch(/archive\.org/i);
    expect(serialised).not.toMatch(/Freelancer\.zip/i);
  });
});
