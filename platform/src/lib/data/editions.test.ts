import { describe, it, expect } from "vitest";
import { editions } from "./editions";

const holocure = editions.filter((e) => e.gameSlug === "holocure");

/**
 * The modded HoloCure edition patches a Steam copy of a game PlayBound does
 * not own. Its folder layout is dictated by upstream (Aurie only loads DLLs
 * from mods/Aurie; the mod only finds emotes at MultiplayerMod/Emotes with no
 * folder in between), so these are upstream facts rather than preferences —
 * a tidy-looking edit to any of them silently produces an install that
 * downloads correctly and then does nothing.
 */
describe("HoloCure editions", () => {
  it("defaults to the unmodded game, not the experimental mod", () => {
    const defaults = holocure.filter((e) => e.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].slug).toBe("official");
  });

  it("labels the modded edition as experimental and does not hide the risk", () => {
    const modded = holocure.find((e) => e.slug === "playbound");
    expect(modded).toBeDefined();
    expect(modded!.name).toMatch(/experimental/i);
    // The mod's author warns about crashes; players should meet that warning
    // before installing, not after.
    expect(modded!.description).toMatch(/crash/i);
  });

  it("places every mod-loader file where the loader actually looks", () => {
    const cfg = holocure.find((e) => e.slug === "playbound")!.installConfig!
      .playbound_installer!;
    const loader = cfg.modLoader!;
    expect(loader.kind).toBe("aurie");

    const at = (name: string) => loader.files.find((f) => f.fileName === name);
    expect(at("AurieCore.dll")?.dest).toBe("mods/Native");
    expect(at("AuriePatcher.exe")?.dest).toBe("mods");
    for (const dll of [
      "HolocureMultiplayerMod.dll",
      "HoloCureMenuMod.dll",
      "CallbackManagerMod.dll",
    ]) {
      expect(at(dll)?.dest).toBe("mods/Aurie");
    }

    // Emotes.zip contains a single top-level "Emotes" folder, so extracting
    // into MultiplayerMod yields MultiplayerMod/Emotes — exactly what the mod
    // requires. The marker must match that folder or it re-extracts 26MB on
    // every launch.
    const emotes = at("Emotes.zip")!;
    expect(emotes.dest).toBe("MultiplayerMod");
    expect(emotes.extract).toBe(true);
    expect(emotes.extractedMarker).toBe("Emotes");
  });

  it("points the patcher at the files the recipe actually installs", () => {
    const loader = holocure.find((e) => e.slug === "playbound")!.installConfig!
      .playbound_installer!.modLoader!;
    const placed = loader.files.find(
      (f) => f.fileName === loader.patcherFileName && f.dest === loader.patcherDest
    );
    const core = loader.files.find(
      (f) => f.fileName === loader.nativeDllFileName && f.dest === loader.nativeDllDest
    );
    expect(placed, "patcher must be one of the downloaded files").toBeDefined();
    expect(core, "native DLL must be one of the downloaded files").toBeDefined();
  });

  it("never lets a mod file escape the game folder", () => {
    const loader = holocure.find((e) => e.slug === "playbound")!.installConfig!
      .playbound_installer!.modLoader!;
    for (const f of loader.files) {
      expect(f.dest).not.toMatch(/^([a-z]:|[/\\])/i);
      expect(f.dest.split(/[/\\]/)).not.toContain("..");
    }
  });

  it("pins every mod download to an exact release tag", () => {
    // Floating to "latest" would let an untested upstream release install
    // itself onto players without anyone checking it against HoloCure first.
    const loader = holocure.find((e) => e.slug === "playbound")!.installConfig!
      .playbound_installer!.modLoader!;
    for (const f of loader.files) {
      expect(f.url).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/v[\d.]+\//);
      expect(f.url).not.toMatch(/\/latest\//);
    }
    expect(loader.testedGameVersion).toBeTruthy();
  });
});
