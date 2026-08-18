import { describe, expect, it } from "vitest";
import {
  ARENA_FREEWARE_SETUP_URL,
  ARENA_GAMEFILES_FILE,
  ARENA_GAMEFILES_URL,
  OPENTESARENA_EXE_HINT,
  OPENTESARENA_OVERLAY_DEST,
  TES_ARENA_EXE_HINT,
} from "./tesArenaAssets";

describe("tesArenaAssets", () => {
  it("points at Bethesda's official freeware zip", () => {
    expect(ARENA_FREEWARE_SETUP_URL).toContain("cdnstatic.bethsoft.com");
    expect(ARENA_FREEWARE_SETUP_URL).toMatch(/Arena106Setup\.zip$/);
  });

  it("hosts extracted game files on PlayBound storage", () => {
    expect(ARENA_GAMEFILES_URL).toContain("tes-arena");
    expect(ARENA_GAMEFILES_URL).toContain(ARENA_GAMEFILES_FILE);
    expect(ARENA_GAMEFILES_URL).toMatch(/vercel-storage\.com|mirror\.playbound\.club/);
  });

  it("matches OpenTESArena's data/ARENA layout and current Windows exe names", () => {
    expect(OPENTESARENA_OVERLAY_DEST).toBe("data");
    expect(TES_ARENA_EXE_HINT).toBe("A.EXE");
    expect(OPENTESARENA_EXE_HINT).toBe("otesa.exe");
  });
});

describe("tes-arena edition recipes", () => {
  it("uses the verified portable OpenTESArena package", async () => {
    const { editions } = await import("./editions");
    const engine = editions.find((e) => e.gameSlug === "tes-arena" && e.slug === "opentesarena");
    const official = editions.find((e) => e.gameSlug === "tes-arena" && e.slug === "official");
    expect(official?.installConfig?.playbound_installer?.exeHint).toBe("A.EXE");
    expect(official?.installConfig?.playbound_installer?.needsDosBox).toBe(true);
    expect(official?.installConfig?.playbound_installer?.url).toBe(ARENA_GAMEFILES_URL);
    expect(engine?.installConfig?.playbound_installer?.exeHint).toBe("otesa.exe");
    expect(engine?.installConfig?.playbound_installer?.kind).toBe("direct-zip");
    expect(engine?.installConfig?.playbound_installer?.fileName).toBe(
      "OpenTESArena-PlayBound-0.18.0.zip"
    );
    expect(engine?.installConfig?.playbound_installer?.overlayUrl).toBeUndefined();
  });
});
