import { describe, it, expect } from "vitest";
import { editions, formatEditionChipNames } from "./editions";

const holocure = editions.filter((e) => e.gameSlug === "holocure");

describe("Privateer Gemini Gold editions", () => {
  const geminiGold = editions.filter((e) => e.gameSlug === "privateer-gemini-gold");

  it("keeps Windows and Unix builds on their native platforms", () => {
    expect(geminiGold.find((e) => e.slug === "gemini-gold-1-03")?.platforms).toEqual([
      "Windows",
    ]);
    expect(geminiGold.find((e) => e.slug === "gemini-gold-unix")?.platforms).toEqual([
      "Linux",
      "macOS",
    ]);
  });
});

describe("Daggerfall editions", () => {
  const daggerfall = editions.filter((e) => e.gameSlug === "daggerfall");

  it("keeps the Unity package on the Unity edition only", () => {
    const unity = daggerfall.find((e) => e.slug === "daggerfall-unity")!;
    const classic = daggerfall.find((e) => e.slug === "classic-dos")!;
    const playbound = daggerfall.find((e) => e.slug === "playbound-remastered")!;
    expect(unity.installConfig?.playbound_installer?.fileName).toBe(
      "Daggerfall-Unity-PlayBound-v1.1.1.zip"
    );
    expect(classic.installConfig?.playbound_installer?.fileName).toBe("DFInstall.zip");
    expect(playbound.isDefault).toBe(false);
    expect(playbound.installConfig?.playbound_installer?.url).toBe(
      unity.installConfig?.playbound_installer?.url
    );
  });

  it("launches Classic through DOSBox with its generated full-install config", () => {
    const recipe = daggerfall.find((e) => e.slug === "classic-dos")!.installConfig!
      .playbound_installer!;
    expect(recipe.exeHint).toBe("FALL.EXE");
    expect(recipe.needsDosBox).toBe(true);
    expect(recipe.launchArgs).toEqual(["Z.CFG"]);
  });
});

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
    // modLoader is a union now — only the aurie arm has a patcher to check.
    if (loader.kind !== "aurie") throw new Error("expected the aurie mod loader");
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
      // Any explicit tag counts — upstream tags are not all bare semver.
      // YYToolkit's only v5 release is "v5.0.0c", which a [\d.]+ tag pattern
      // rejected even though it is pinned exactly as intended. The rule being
      // enforced is "not floating", so /latest/ below is what actually matters.
      expect(f.url).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\//);
      expect(f.url).not.toMatch(/\/latest\//);
    }
    expect(loader.testedGameVersion).toBeTruthy();
  });
});

const spd = editions.filter((e) => e.gameSlug === "shattered-pixel-dungeon");

describe("Shattered Pixel Dungeon editions", () => {
  it("keeps an explicit official edition so vanilla stays installable", () => {
    // listEditionsForGame() only synthesizes a virtual official edition when a
    // game has ZERO stored editions. The moment the forks below exist, that
    // fallback stops firing — so deleting this entry silently removes vanilla
    // Shattered Pixel Dungeon from the site.
    const official = spd.find((e) => e.slug === "official");
    expect(official, "vanilla SPD must be a stored edition").toBeDefined();
    expect(official!.installConfig?.playbound_installer?.repo).toBe(
      "00-Evan/shattered-pixel-dungeon"
    );
  });

  it("defaults to vanilla, not a fork", () => {
    const defaults = spd.filter((e) => e.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].slug).toBe("official");
  });

  it("anchors fork asset patterns so phones and dev builds can't be picked", () => {
    // Both forks publish .apk files next to the desktop jar, and rkpd2 also
    // publishes an -INDEV work-in-progress build. An unanchored pattern would
    // happily hand a player an Android package or an unfinished build.
    for (const slug of ["rat-king-adventure", "rkpd2"]) {
      const cfg = spd.find((e) => e.slug === slug)!.installConfig!.playbound_installer!;
      expect(cfg.kind).toBe("github-jar");
      const re = new RegExp(cfg.assetPattern!, "i");
      expect(re.test("android-release.apk")).toBe(false);
      expect(re.test("rkpd2-3.0.1-INDEV.jar")).toBe(false);
      expect(cfg.assetPattern).toMatch(/^\^/);
      expect(cfg.assetPattern).toMatch(/\$$/);
    }
  });

  it("matches the desktop jar each fork actually ships", () => {
    const rka = spd.find((e) => e.slug === "rat-king-adventure")!.installConfig!
      .playbound_installer!;
    expect(new RegExp(rka.assetPattern!, "i").test("desktop-2.3.2.jar")).toBe(true);

    const rkpd2 = spd.find((e) => e.slug === "rkpd2")!.installConfig!.playbound_installer!;
    expect(new RegExp(rkpd2.assetPattern!, "i").test("rkpd2-3.0.1.jar")).toBe(true);
  });
});

describe("edition seed integrity", () => {
  it("never gives one game two default editions", () => {
    const byGame = new Map<string, number>();
    for (const e of editions.filter((x) => x.isDefault)) {
      byGame.set(e.gameSlug, (byGame.get(e.gameSlug) ?? 0) + 1);
    }
    expect([...byGame.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });

  it("has no duplicate slug within a game", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const e of editions) {
      const key = `${e.gameSlug}/${e.slug}`;
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });

  it("does not make the new total conversions the default client", () => {
    const added = editions.filter((e) =>
      ["ashes-2063", "pirate-doom", "jgrpp", "truecombat-elite"].includes(e.slug)
    );
    expect(added).toHaveLength(4);
    expect(added.every((e) => e.isDefault === false)).toBe(true);
    expect(editions.some((e) => e.slug === "shattered-paradise")).toBe(false);
    expect(added.find((e) => e.slug === "jgrpp")?.gameSlug).toBe("openttd");
  });

  it("keeps flagship conversions off the default client", () => {
    const ashes = editions.find((e) => e.gameSlug === "freedoom" && e.slug === "ashes-2063")!;
    expect(ashes.installMethod).toBe("playbound_installer");
    expect(ashes.installConfig?.playbound_installer?.kind).toBe("direct-zip");
    expect(ashes.installConfig?.playbound_installer?.fileName).toBe("AshesStandalone_V1_51.zip");
    expect(ashes.isDefault).toBe(false);
    expect(editions.find((e) => e.gameSlug === "freedoom" && e.isDefault)?.slug).toBe("zandronum");

    const ca = editions.find((e) => e.gameSlug === "openra" && e.slug === "combined-arms")!;
    expect(ca.isDefault).toBe(false);
    expect(ca.installConfig?.playbound_installer?.assetPattern).toMatch(/winportable/);
    expect(editions.find((e) => e.gameSlug === "openra" && e.isDefault)?.slug).toBe("official");

    const vl = editions.find((e) => e.gameSlug === "luanti" && e.slug === "voxelibre")!;
    expect(vl.isDefault).toBe(false);
    expect(vl.installConfig?.playbound_installer?.overlayUrl).toContain("content.luanti.org");
    expect(vl.installConfig?.playbound_installer?.overlayDest).toBe("games");
    expect(vl.installConfig?.playbound_installer?.launchArgs).toEqual(["--gameid", "mineclone2"]);
    expect(editions.find((e) => e.gameSlug === "luanti" && e.isDefault)?.slug).toBe("official");
  });

  it("packages ET: Legacy with official 2.60b etmain overlay", () => {
    const etl = editions.find(
      (e) => e.gameSlug === "wolfenstein-enemy-territory" && e.slug === "et-legacy"
    )!;
    const recipe = etl.installConfig?.playbound_installer;
    expect(etl.isDefault).toBe(true);
    expect(recipe?.overlayUrl).toContain("ET-260b-Base-Data.zip");
    expect(recipe?.overlayFileName).toBe("ET-260b-Base-Data.zip");
    expect(recipe?.overlayDest).toBe("etmain");
    expect(recipe?.unwrapSingleRoot).toBe(true);
    expect(recipe?.knownExePaths).toContain("etl.exe");
    expect(recipe?.url).toBe("https://www.etlegacy.com/download/file/734");
  });
});


describe("mr. boom retroarch edition", () => {
  const mrboom = editions.filter((e) => e.gameSlug === "mrboom");
  const recipe = mrboom.find((e) => e.slug === "retroarch")!.installConfig!
    .playbound_installer!;

  it("declares the 7z kind so the recipe is not a mislabelled zip", () => {
    expect(recipe.kind).toBe("direct-7z");
    expect(recipe.url).toMatch(/\.7z$/);
    expect(recipe.fileName).toMatch(/\.7z$/);
  });

  it("places the core inside the folder RetroArch extracts to", () => {
    // installRoot is the archive's single top-level folder; the core has to
    // land under it, not beside it, or -L resolves to nothing.
    const core = recipe.modLoader!.files[0];
    expect(core.dest.startsWith(`${recipe.installRoot}/`)).toBe(true);
    expect(core.dest).toBe("RetroArch-Win64/cores");
  });

  it("launches the core relative to the executable's directory", () => {
    // cwd at launch is dirname(exe) = <gameDir>/RetroArch-Win64, so the -L path
    // is relative to that, NOT to dest which is relative to gameDir.
    const args = recipe.connectArgs!;
    const libretroPath = args[args.indexOf("-L") + 1];
    const core = recipe.modLoader!.files[0];
    const destUnderExe = core.dest.replace(`${recipe.installRoot}/`, "");
    expect(libretroPath).toBe(`${destUnderExe}/${core.extractedMarker}`);
  });

  it("passes only static args, so an ordinary launch keeps them", () => {
    // playGame drops templated entries when there is no server to join.
    for (const a of recipe.connectArgs!) expect(a).not.toContain("{host}");
  });

  it("marks the extracted core so it is not re-downloaded every launch", () => {
    const core = recipe.modLoader!.files[0];
    expect(core.extract).toBe(true);
    expect(core.extractedMarker).toBe("mrboom_libretro.dll");
    expect(core.fileName).toBe("mrboom_libretro.dll.zip");
  });

  it("never lets the core escape the game folder", () => {
    for (const f of recipe.modLoader!.files) {
      expect(f.dest.includes("..")).toBe(false);
      expect(f.dest.startsWith("/")).toBe(false);
    }
  });
});

describe("Morrowind editions", () => {
  const morrowind = editions.filter((e) => e.gameSlug === "morrowind");

  it("matches the Windows client TES3MP actually ships", () => {
    // The recipe asked for `tes3mp-.*-windows.*\.zip$`, which matches nothing
    // in any TES3MP release: upstream names the client with dots and "Win64".
    // Every install of this edition failed on "No matching asset".
    const re = new RegExp(
      morrowind.find((e) => e.slug === "tes3mp")!.installConfig!.playbound_installer!
        .assetPattern!,
      "i"
    );
    expect(re.test("tes3mp.Win64.release.0.8.1.zip")).toBe(true);
    expect(re.test("tes3mp.Win64.release.0.6.0.zip")).toBe(true);
  });

  it("does not pick the VR respin that ships as the newest release", () => {
    // tes3mp-0.8.1-vr is the latest release and carries only a VR client, so
    // the installer walks back to tes3mp-0.8.1 — but only while the pattern
    // refuses the VR archive. Loosen the version to `.*` and it stops there.
    const re = new RegExp(
      morrowind.find((e) => e.slug === "tes3mp")!.installConfig!.playbound_installer!
        .assetPattern!,
      "i"
    );
    expect(re.test("tes3mp.Win64.release.0.8.1.VR.client.zip")).toBe(false);
    expect(re.test("tes3mp-GNU+Linux-x86_64-release-0.8.1-68954091c5-6da3fdea59.tar.gz")).toBe(
      false
    );
  });
});

describe("naming a game's editions together", () => {
  /*
   * The parenthetical is sometimes the only thing telling two editions apart.
   * Dropping it per-name left YSoccer with two library rows both called
   * "YSoccer" — the game's own name, twice, with nothing to choose between.
   */
  it("keeps the part that distinguishes two editions", () => {
    expect(formatEditionChipNames(["YSoccer (Portable)", "YSoccer (Tournament)"])).toEqual([
      "YSoccer (Portable)",
      "YSoccer (Tournament)",
    ]);
  });

  it("still tidies a name that stays unique without it", () => {
    expect(formatEditionChipNames(["Doom (1993)", "Brutal Doom"])).toEqual(["Doom", "Brutal Doom"]);
  });

  it("shortens only the names that collide", () => {
    expect(
      formatEditionChipNames(["YSoccer (Portable)", "YSoccer (Tournament)", "Ancient Beast (2007)"])
    ).toEqual(["YSoccer (Portable)", "YSoccer (Tournament)", "Ancient Beast"]);
  });

  it("handles a single edition and an empty list", () => {
    expect(formatEditionChipNames(["Quake (GOG)"])).toEqual(["Quake"]);
    expect(formatEditionChipNames([])).toEqual([]);
  });

  it("every published game's editions end up distinguishable", () => {
    // The whole point: no game may present two editions under one label.
    const bySlug = new Map<string, string[]>();
    for (const edition of editions) {
      if (edition.visibility === "hidden" || edition.status === "archived") continue;
      const list = bySlug.get(edition.gameSlug) || [];
      list.push(edition.name);
      bySlug.set(edition.gameSlug, list);
    }
    for (const [slug, names] of bySlug) {
      const shown = formatEditionChipNames(names);
      expect(new Set(shown).size, `${slug} shows duplicate edition names: ${shown.join(", ")}`).toBe(
        new Set(names).size
      );
    }
  });
});
