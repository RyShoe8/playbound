/**
 * Additive catalog wave, August 2026.
 *
 * Only new slugs. Existing FOSS stubs (Combined Arms, Romanov's Vengeance,
 * Shattered Paradise the mod, Brutal Doom hub, DREAM, Real Grass, Terra Magna,
 * VoxeLibre, NodeCore, Mesecons, eGRVTS, Invasion from the Unknown, After the
 * Storm, New Horizon, KeeperFX campaigns, ET: Legacy) are not edited here.
 *
 * Checked and not added — no installable project that matches the name:
 *   Endless Sky "Ur-Quan Masters TC"   UQM is already its own PlayBound game.
 *                                      No Endless Sky plugin recreates it.
 *   Endless Sky "High Divergence"      Not in the official plugin index.
 *   Mindustry "Extended Crafting"      Hits the Minecraft mod of that name.
 *                                      No Mindustry project by that title.
 *   0 A.D. "Rise of the East"          Renamed Terra Magna; already seeded
 *                                      as 0ad-terra-magna.
 */
import type { ModSeed } from "./modSeedHelpers";
import { ghMod } from "./modSeedHelpers";

const WESNOTH_INSTALL_HINT =
  "Install from inside the game: main menu → Add-ons → Connect, then pick this add-on from the list. " +
  "Wesnoth's own add-on server serves the build matched to your game version, which a manual download cannot guarantee.";

const OPENTTD_BANANAS_HINT =
  "In OpenTTD (or JGR's Patchpack): Check online content → NewGRF → search this pack's name → Download. " +
  "Enable it in the NewGRF settings for a new game; existing saves keep whatever set they were started with.";

export const catalogWaveAug2026Mods: ModSeed[] = [
  ghMod({
    slug: "freedoom-project-brutality",
    title: "Project Brutality",
    tagline: "GZDoom gameplay overhaul: weapon handling, gore, and movement on Freedoom.",
    description:
      "A collaborative GZDoom overhaul that rebuilds Doom's guns, monsters, and movement. Runs on Freedoom Phase 1+2 or a legal IWAD.",
    baseGameSlug: "freedoom",
    developerSlug: "indie-web",
    baseTitle: "Freedoom",
    license: "Community / Various",
    releaseYear: 2017,
    sizeMB: 180,
    website: "https://github.com/pa1nki113r/Project_Brutality",
    githubRepo: "pa1nki113r/Project_Brutality",
    downloadKind: "external",
    installRelativePath: "mods",
    art: { from: "#7f1d1d", to: "#b91c1c", icon: "Skull" },
    summary:
      "Project Brutality is the still-in-development successor scene to Brutal Doom: magazine-fed weapons, executions, and faster movement authored as a GZDoom PK3. Upstream treats the GitHub default branch as bleeding-edge, not a finished release, and tells you to load it with GZDoom plus Freedoom or a commercial IWAD. PlayBound already lists Brutal Doom as a ModDB hub; this row is the Brutality project itself.",
    changes:
      "Replaces the stock arsenal with reloadable guns, adds executions and enhanced monster behaviour, and retunes player movement. Visual gore and muzzle effects are part of the pack — turn them down in the mod options if you want the gunplay without the excess.",
    installHint:
      "Open the GitHub repo, download the branch zip or a community PK3, and load it in GZDoom with Freedoom Phase 2 (or Doom II). Do not drop it into PlayBound's Brutal Doom hub row — that is a different project.",
    faq: [
      {
        q: "Is this Brutal Doom?",
        a: "No. Brutal Doom is a different project; PlayBound already lists that as a ModDB hub. Project Brutality is the later GZDoom overhaul with its own GitHub tree.",
      },
      {
        q: "Which file should I load?",
        a: "A community PK3 or the current GitHub branch zip. Upstream treats the default branch as bleeding-edge, not a numbered release.",
      },
    ],
  }),
  ghMod({
    slug: "dfu-distant-terrain",
    title: "Distant Terrain",
    tagline: "Pushes the Iliac Bay horizon out with low-poly far terrain and sky blending.",
    description:
      "Nystul's Daggerfall Unity mod extends view distance and draws simplified geometry for land you should see but vanilla DFU culls.",
    baseGameSlug: "daggerfall",
    developerSlug: "dfworkshop",
    baseTitle: "The Elder Scrolls II: Daggerfall",
    license: "Community / Open Source",
    releaseYear: 2019,
    sizeMB: 15,
    website: "https://www.nexusmods.com/daggerfallunity/mods/128",
    downloadKind: "external",
    installRelativePath: "DaggerfallUnity_Data/StreamingAssets/Mods",
    compatibility: "Daggerfall Unity 1.0+",
    summary:
      "Distant Terrain is Nystul-the-Magician's view-distance mod for Daggerfall Unity. Vanilla DFU drops world geometry a short way from the player; this pack keeps generating low-poly terrain out to the horizon and, with Enhanced Sky, blends that mesh into the sky so the coastline does not pop. It ships its own terrain sampler that tries to respect the original height map rather than inventing a new continent.",
    changes:
      "Extends far-clip terrain, adds optional geometry/texture transition into the near mesh, marks distant settlements as brighter spots, and can pick up sea reflections when Realtime Reflections is present. Compatible with Splat Terrain Texturing. World of Daggerfall players should use the separate 'Distant Terrain of the World of Daggerfall' patch instead of this file.",
    installHint:
      "Download the .dfmod from Nexus Mods (login required) and place it in Daggerfall Unity's StreamingAssets/Mods folder, then enable it in the in-game mod list. Pair with Enhanced Sky. Do not confuse this with World of Daggerfall's terrain pack.",
    faq: [
      {
        q: "I play World of Daggerfall. Is this the right file?",
        a: "No. Use the separate Distant Terrain of the World of Daggerfall patch. This row is Nystul's vanilla-map Distant Terrain.",
      },
    ],
  }),
  ghMod({
    slug: "dfu-expanded-textures",
    title: "Daggerfall Expanded Textures",
    tagline: "Shared texture and model archive other DFU mods expect to find.",
    description:
      "Ninelan's DET pack adds extra texture archives and models so environment mods can reference new IDs without shipping duplicate art.",
    baseGameSlug: "daggerfall",
    developerSlug: "dfworkshop",
    baseTitle: "The Elder Scrolls II: Daggerfall",
    license: "Community (asset-use restricted)",
    releaseYear: 2020,
    sizeMB: 6,
    website: "https://www.nexusmods.com/daggerfallunity/mods/307",
    downloadKind: "external",
    installRelativePath: "DaggerfallUnity_Data/StreamingAssets/Mods",
    compatibility: "Daggerfall Unity 1.0+",
    summary:
      "Daggerfall Expanded Textures (DET) is a library, not a visual overhaul you enable for prettier vanilla walls. Ninelan maintains extra archives and models that other DFU mods reference by ID. Without DET, those mods show missing textures or pink meshes. It is not Vanilla Enhanced (the 4x upscale of 1996 art) and it is not D.R.E.A.M.",
    changes:
      "Adds additional texture archives and 3D models into DFU's streaming assets so dependent environment and clutter mods can resolve their extra IDs. macOS players who see pink 3D models need the DET build that includes the full archive set. Do not expect a complete world reskin from this file alone.",
    installHint:
      "Get the current Standard .dfmod from Nexus Mods and drop it in StreamingAssets/Mods. Enable DET before the mods that list it as a requirement. Asset reuse in other packs is restricted by upstream — read the Nexus permissions before shipping a patch.",
    faq: [
      {
        q: "Will this make vanilla Daggerfall look better by itself?",
        a: "No. DET is a shared texture/model library other mods require. For an upscale of 1996 art, look at Vanilla Enhanced; for a full overhaul, D.R.E.A.M.",
      },
    ],
  }),
  ghMod({
    slug: "openttd-cztr-graphics",
    title: "CZTR Graphics",
    tagline: "Czech Trainset visual suite: rails, infrastructure, stations, and matching vehicles.",
    description:
      "CZTR is a coordinated NewGRF suite for Czech and Central European railways — tracks, stations, catenary, and trains that share one art direction.",
    baseGameSlug: "openttd",
    developerSlug: "openttd-team",
    baseTitle: "OpenTTD",
    license: "CC-BY-SA-3.0",
    releaseYear: 2018,
    sizeMB: 40,
    website: "https://bananas.openttd.org/package/newgrf/4d490320",
    downloadKind: "external",
    installRelativePath: "content_download",
    summary:
      "CZTR (Czech Trainset) is a family of NewGRFs, not one file. Infrastructure, rails, stations, ground tiles, and the engine/wagon packs are meant to be used together so Czech electrification, platforms, and rolling stock line up. This catalog row points at CZTR Infrastructure, the visual backbone; BaNaNaS lists the sibling packs (Rails, Station set, Engines, Wagons, Road set) from the same author.",
    changes:
      "Replaces default track, catenary, station, and related infrastructure graphics with the CZTR set, and unlocks the matching Czech locomotive and wagon NewGRFs. Enable the related CZTR packs in NewGRF settings rather than mixing one CZTR file with a conflicting railtype set.",
    installHint: OPENTTD_BANANAS_HINT,
    faq: [
      {
        q: "Is this one NewGRF?",
        a: "No. CZTR is a suite. This row points at CZTR Infrastructure; grab Rails, Station set, Engines, Wagons, and Road set from BaNaNaS to match.",
      },
    ],
  }),
  ghMod({
    slug: "openttd-av8-aircraft",
    title: "av8 Aviators Aircraft Set",
    tagline: "Aeroplanes and helicopters from 1920 through 2050, with take-off sounds.",
    description:
      "Pikka's av8 NewGRF replaces OpenTTD's default aircraft with a full 1920–2050 roster, including helicopters and animated take-off.",
    baseGameSlug: "openttd",
    developerSlug: "openttd-team",
    baseTitle: "OpenTTD",
    license: "Custom",
    releaseYear: 2013,
    sizeMB: 8,
    website: "https://bananas.openttd.org/package/newgrf/44440a01",
    downloadKind: "external",
    installRelativePath: "content_download",
    summary:
      "av8 Aviators Aircraft Set is Pikka's classic aircraft NewGRF: biplanes through jets and helicopters, with take-off and landing sounds. Version 2.21 is the BaNaNaS build still served in-game and needs OpenTTD 1.1.5 or newer (including current trunk and JGRPP). This is not the retired wiki-link stub that used the slug openttd-av8.",
    changes:
      "Replaces the default aircraft roster with av8's 1920–2050 planes and helicopters, including animation and engine sounds. If you also run World Airliners Set, use the separate 'av8 Minimal Supp WAS' NewGRF to strip overlapping airframes.",
    installHint: OPENTTD_BANANAS_HINT,
    faq: [
      {
        q: "Why is this not named openttd-av8?",
        a: "That slug was a retired wiki stub. This row is the live BaNaNaS package (44440a01), av8 Aviators Aircraft Set 2.21.",
      },
    ],
  }),
  ghMod({
    slug: "wesnoth-era-of-magic",
    title: "Era of Magic",
    tagline: "Multi-faction era: runic dwarves, barbarian tribes, and anti-magic Destroyers.",
    description:
      "A Battle for Wesnoth add-on era with original unit lines and art, played from the in-game Add-ons manager rather than a GitHub zip.",
    baseGameSlug: "battle-for-wesnoth",
    developerSlug: "wesnoth-project",
    baseTitle: "The Battle for Wesnoth",
    license: "GPL-2.0-or-later",
    releaseYear: 2008,
    sizeMB: 0,
    website: "https://github.com/inferno8/wesnoth-Era_of_Magic",
    githubRepo: "inferno8/wesnoth-Era_of_Magic",
    downloadKind: "external",
    installRelativePath: "data/add-ons",
    summary:
      "Era of Magic (EoMa) is a user-made Wesnoth era: extra factions with their own unit trees and portraits, including Runemasters (runic dwarves and steam machines), Barbarians (goblin/orc/cyclops/troll tribes), the Dark Blood Alliance, and the anti-magic Destroyers. Source lives on GitHub; the playable add-on is the version-matched build from Wesnoth's add-on server, same reason Invasion from the Unknown is not a github-zip.",
    changes:
      "Adds a full alternate era with new factions, unit lines, and artwork for multiplayer and era-compatible campaigns. It does not replace the default era unless you select it in game setup.",
    installHint: WESNOTH_INSTALL_HINT,
    faq: [
      {
        q: "Can I install from the GitHub zip?",
        a: "Use Wesnoth's Add-ons server instead. The GitHub tree is source; the in-game download is the build matched to your Wesnoth version.",
      },
    ],
  }),
];
