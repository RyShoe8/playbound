import { describe, expect, it } from "vitest";
import {
  buildLibraryUnionEntries,
  isCrossPlatformGame,
  gameCompatibleWithLibraryPlatform,
  type LibraryUnionGame,
} from "@/lib/libraryUnion";

const vh: LibraryUnionGame = {
  slug: "villagers-and-heroes",
  platforms: ["Windows", "Android", "iOS"],
  androidStoreUrl: "https://play.google.com/store/apps/details?id=com.madotter.vhmmo",
  iosStoreUrl: "https://apps.apple.com/app/id123",
  steamAppId: "263540",
};

const pcOnly: LibraryUnionGame = {
  slug: "openra",
  platforms: ["Windows", "macOS", "Linux"],
  launcherInstall: { enabled: true, kind: "github" },
};

const androidOnly: LibraryUnionGame = {
  slug: "mobile-only",
  platforms: ["Android"],
  androidStoreUrl: "https://play.google.com/store/apps/details?id=x",
};

describe("isCrossPlatformGame", () => {
  it("detects desktop + mobile catalog titles", () => {
    expect(isCrossPlatformGame(vh)).toBe(true);
    expect(isCrossPlatformGame(pcOnly)).toBe(false);
    expect(isCrossPlatformGame(androidOnly)).toBe(false);
  });
});

describe("gameCompatibleWithLibraryPlatform", () => {
  it("matches store URLs and platforms", () => {
    expect(gameCompatibleWithLibraryPlatform(vh, "android")).toBe(true);
    expect(gameCompatibleWithLibraryPlatform(vh, "desktop")).toBe(true);
    expect(gameCompatibleWithLibraryPlatform(pcOnly, "android")).toBe(false);
    expect(gameCompatibleWithLibraryPlatform(androidOnly, "desktop")).toBe(false);
  });
});

describe("buildLibraryUnionEntries", () => {
  const map = new Map<string, LibraryUnionGame>([
    [vh.slug, vh],
    [pcOnly.slug, pcOnly],
  ]);

  it("includes local installs", () => {
    const { entries, hiddenElsewhereCount } = buildLibraryUnionEntries(
      [{ gameSlug: "openra", platform: "desktop", installed: true }],
      map,
      "desktop"
    );
    expect(entries).toEqual([
      {
        gameSlug: "openra",
        installed: true,
        saved: false,
        ownedElsewhere: false,
      },
    ]);
    expect(hiddenElsewhereCount).toBe(0);
  });

  it("surfaces cross-platform titles owned on another device", () => {
    const { entries, hiddenElsewhereCount } = buildLibraryUnionEntries(
      [{ gameSlug: "villagers-and-heroes", platform: "desktop", installed: true }],
      map,
      "android"
    );
    expect(entries).toEqual([
      {
        gameSlug: "villagers-and-heroes",
        installed: false,
        saved: false,
        ownedElsewhere: true,
      },
    ]);
    expect(hiddenElsewhereCount).toBe(0);
  });

  it("hides PC-only titles from mobile instead of unioning them", () => {
    const { entries, hiddenElsewhereCount } = buildLibraryUnionEntries(
      [{ gameSlug: "openra", platform: "desktop", installed: true }],
      map,
      "android"
    );
    expect(entries).toEqual([]);
    expect(hiddenElsewhereCount).toBe(1);
  });

  it("prefers local install over elsewhere for the same slug", () => {
    const { entries } = buildLibraryUnionEntries(
      [
        { gameSlug: "villagers-and-heroes", platform: "desktop", installed: true },
        { gameSlug: "villagers-and-heroes", platform: "android", installed: true },
      ],
      map,
      "android"
    );
    expect(entries).toEqual([
      {
        gameSlug: "villagers-and-heroes",
        installed: true,
        saved: false,
        ownedElsewhere: false,
      },
    ]);
  });
});
