import { describe, it, expect } from "vitest";
import { toLauncherCatalogEntry, LAUNCHER_INSTALL_KINDS } from "./launcherInstall";
import { launcherInstallBySlug } from "./data/launcherInstall";
import { ARENA_GAMEFILES_URL } from "./data/tesArenaAssets";

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

describe("TES Arena freeware vs OpenTESArena", () => {
  it("installs extracted Bethesda 1.06 files, not the OpenTESArena engine", () => {
    const recipe = launcherInstallBySlug["tes-arena"];
    expect(recipe.kind).toBe("direct-zip");
    expect(recipe.exeHint).toBe("A.EXE");
    expect(recipe.needsDosBox).toBe(true);
    expect(recipe.fileName).toBe("Arena-1.06-GameFiles.zip");
    expect(recipe.url).toContain("Arena-1.06-GameFiles.zip");
    expect(recipe.kind).not.toBe("github-zip");
  });

  it("passes overlay dest through to the launcher catalog", () => {
    const entry = toLauncherCatalogEntry({
      ...base,
      slug: "tes-arena",
      launcherInstall: {
        enabled: true,
        kind: "github-zip",
        repo: "afritz1/OpenTESArena",
        assetPattern: "windows_x86-64\\.zip$",
        exeHint: "otesa.exe",
        unwrapSingleRoot: true,
        overlayUrl: ARENA_GAMEFILES_URL,
        overlayFileName: "Arena-1.06-GameFiles.zip",
        overlayDest: "data",
      },
    });
    expect(entry.unwrapSingleRoot).toBe(true);
    expect(entry.overlayDest).toBe("data");
    expect(entry.exeHint).toBe("otesa.exe");
  });

  it("passes needsDosBox through to the launcher catalog", () => {
    const entry = toLauncherCatalogEntry({
      ...base,
      launcherInstall: {
        enabled: true,
        kind: "direct-zip",
        url: "https://x.test/a.zip",
        needsDosBox: true,
      },
    });
    expect(entry.needsDosBox).toBe(true);
  });
});

describe("first-party MMO launcher installs", () => {
  const expectedHosts: Record<string, RegExp> = {
    "albion-online": /(^|\.)albiononline\.com$/,
    "lord-of-the-rings-online": /(^|\.)lotro\.com$/,
    "guild-wars-2": /(^|\.)guildwars2\.com$/,
    "dc-universe-online": /(^|\.)daybreakgames\.com$/,
  };

  for (const [slug, officialHost] of Object.entries(expectedHosts)) {
    it(`${slug} downloads its publisher launcher without Steam`, () => {
      const recipe = launcherInstallBySlug[slug];
      expect(recipe).toBeDefined();
      expect(recipe.enabled).toBe(true);
      expect(recipe.kind).toBe("direct-installer");
      expect(recipe.url).toBeTruthy();
      expect(recipe.url).not.toMatch(/steam/i);
      expect(new URL(recipe.url!).hostname).toMatch(officialHost);
      expect(recipe.fileName).toMatch(/\.exe$/i);
      expect(recipe.knownExePaths?.length).toBeGreaterThan(0);
    });
  }
});

describe("multiplayer testing-wave installers", () => {
  const slugs = [
    "volleyball-legends",
    "c-dogs-retrarch",
    "sven-co-op",
    "teeworlds",
    "assaultcube",
    "bzflag",
    "openclonk",
    "red-eclipse",
    "widelands",
    "warfork",
    "slapshot-rebound",
  ];

  it.each(slugs)("%s has an enabled Windows install path", (slug) => {
    const recipe = launcherInstallBySlug[slug];
    expect(recipe).toBeDefined();
    expect(recipe.enabled).toBe(true);
    expect(recipe.kind).toBeTruthy();
    expect(recipe.url || recipe.repo).toBeTruthy();
  });

  it("uses official store handoffs for account-managed games", () => {
    expect(launcherInstallBySlug["volleyball-legends"].url).toMatch(/^https:\/\/www\.roblox\.com\/games\//);
    expect(launcherInstallBySlug["sven-co-op"].url).toBe("steam://run/225840");
    expect(launcherInstallBySlug.warfork.url).toBe("steam://run/671610");
    expect(launcherInstallBySlug["slapshot-rebound"].url).toBe("steam://run/1173370");
  });
});
