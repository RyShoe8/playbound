/**
 * Mods verified individually against live upstream sources, August 2026.
 *
 * This wave exists because a much longer candidate list did not survive
 * checking. Every entry below was confirmed to (a) actually exist, (b) not
 * already ship inside the base game, and (c) work against the exact base-game
 * version PlayBound installs. Items that failed any of those are recorded in
 * REJECTED at the bottom of this file so they are not re-proposed.
 *
 * Two shapes are used deliberately:
 *
 *   direct-zip  the launcher downloads and places the files itself.
 *   external    PlayBound lists the mod for discovery but hands install to
 *               the game's own add-on manager. Used where auto-install would
 *               produce a broken result — see the Wesnoth note below.
 *
 * Why the Wesnoth campaigns are external rather than github-zip: none of the
 * three repos publish release assets, so resolveModDownload() would fall back
 * to a default-branch source archive. That extracts as `<repo>-master/`, and
 * Wesnoth derives an add-on's identity from its folder name — the campaign
 * would either not appear or register under a wrong id and break dependency
 * resolution. Invasion from the Unknown and After the Storm additionally ship
 * a Makefile and build their distributable from a shared library (Naia), so
 * the repo tree is source, not a drop-in add-on. Wesnoth's in-game Add-ons
 * manager serves version-matched builds and is the correct install route.
 */
import type { ModSeed } from "./modSeedHelpers";
import { ghMod } from "./modSeedHelpers";

const WESNOTH_INSTALL_HINT =
  "Install from inside the game: main menu → Add-ons → Connect, then pick this campaign from the list. " +
  "Wesnoth's own add-on server serves the build matched to your game version, which a manual download cannot guarantee.";

export const verifiedModsWave: ModSeed[] = [
  /* ── EverQuest ──────────────────────────────────────────────────────── */
  // Held unpublished on purpose. This is the only entry in the wave the
  // launcher downloads itself, and eqmaps.info was not in any shipped
  // launcher's download allowlist as of 0.1.79 — installing it on an older
  // build fails with DOWNLOAD_HOST_BLOCKED. Flip to published once a launcher
  // release carrying that host has gone out. The Wesnoth entries below are
  // link-outs and are safe to publish on any launcher version.
  {
    ...ghMod({
      slug: "everquest-brewall-maps",
      title: "Brewall's EverQuest Maps",
      tagline: "Complete hand-corrected zone maps with named NPCs and quest markers.",
      description:
        "A full replacement map set for every EverQuest zone, colour-coded for named NPCs, merchants, quest givers and tradeskill containers, and updated for each new expansion.",
      baseGameSlug: "everquest",
      developerSlug: "brewall",
      baseTitle: "EverQuest",
      license: "Freeware",
      releaseYear: 2024,
      sizeMB: 21,
      website: "https://www.eqmaps.info/eq-map-files/",
      downloadKind: "direct-zip",
      directUrl: "https://www.eqmaps.info/wp-content/uploads/2024/01/brewall-20240109.zip",
      // NOT plain "maps". EverQuest rewrites roughly 100 zone maps in the root
      // maps folder on every startup, so files placed there are silently lost
      // and labels duplicate. Upstream instructs a named subfolder.
      installRelativePath: "maps/Brewall",
      platforms: ["Windows"],
      summary:
        "Brewall's packs are the de facto standard map set for EverQuest, used on live and emulated servers alike, and are redrawn by hand rather than generated from zone geometry.",
      changes:
        "Replaces the in-game zone maps with corrected geometry and adds consistent colour-coded labels for named NPCs, merchants, quest givers, portals and tradeskill containers.",
      installHint:
        "PlayBound extracts the pack into a Brewall subfolder of your EverQuest maps directory. Do not move the files into the maps root — EverQuest overwrites around 100 default zone maps on startup and your custom geometry would be lost.",
    }),
    published: false,
  },

  /* ── The Battle for Wesnoth ─────────────────────────────────────────── */
  ghMod({
    slug: "wesnoth-invasion-from-the-unknown",
    title: "Invasion from the Unknown",
    tagline: "Story campaign with bespoke units, custom art and its own soundtrack.",
    description:
      "A long-running user-made campaign set generations after the fall of Wesnoth, with custom unit lines, original artwork and a bespoke score.",
    baseGameSlug: "battle-for-wesnoth",
    developerSlug: "project-ethea",
    baseTitle: "The Battle for Wesnoth",
    license: "GPL-2.0-or-later",
    releaseYear: 2006,
    sizeMB: 0,
    website: "https://github.com/project-ethea/Invasion_from_the_Unknown",
    githubRepo: "project-ethea/Invasion_from_the_Unknown",
    downloadKind: "external",
    installRelativePath: "data/add-ons",
    summary:
      "Iris Morelle's campaign is one of the oldest continuously maintained Wesnoth add-ons, and its README currently targets Wesnoth 1.18 and 1.20 — matching the 1.18.x build PlayBound installs.",
    changes:
      "Adds a full multi-chapter campaign with custom unit lines, original portraits and terrain art, and a bespoke soundtrack.",
    installHint: WESNOTH_INSTALL_HINT,
  }),
  ghMod({
    slug: "wesnoth-after-the-storm",
    title: "After the Storm",
    tagline: "Direct sequel to Invasion from the Unknown, in three episodes.",
    description:
      "The continuation of Invasion from the Unknown, spanning three episodes with new factions, characters and an expanded storyline.",
    baseGameSlug: "battle-for-wesnoth",
    developerSlug: "project-ethea",
    baseTitle: "The Battle for Wesnoth",
    license: "GPL-2.0-or-later",
    releaseYear: 2008,
    sizeMB: 0,
    website: "https://github.com/project-ethea/After_the_Storm",
    githubRepo: "project-ethea/After_the_Storm",
    downloadKind: "external",
    installRelativePath: "data/add-ons",
    summary:
      "Picks up directly from Invasion from the Unknown and runs across three episodes. Still actively developed, with its README targeting Wesnoth 1.18 and 1.20.",
    changes:
      "Adds a three-episode sequel campaign with new factions, unit lines and characters built on the shared Naia library.",
    installHint: WESNOTH_INSTALL_HINT,
  }),
  ghMod({
    slug: "wesnoth-legend-of-the-invincibles",
    title: "Legend of the Invincibles",
    tagline: "200-scenario RPG campaign with item drops and skill trees.",
    description:
      "The largest single campaign made for Wesnoth: 200 scenarios across two parts, rebuilt around loot, equipment socketing and character progression.",
    baseGameSlug: "battle-for-wesnoth",
    developerSlug: "dugi",
    baseTitle: "The Battle for Wesnoth",
    license: "GPL-3.0-only",
    releaseYear: 2016,
    sizeMB: 0,
    website: "https://github.com/Dugy/Legend_of_the_Invincibles",
    githubRepo: "Dugy/Legend_of_the_Invincibles",
    downloadKind: "external",
    installRelativePath: "data/add-ons",
    summary:
      "Two hundred scenarios split into two parts of five chapters each, layering item drops, equipment socketing and per-character skill trees over Wesnoth's tactics. Still receiving commits.",
    changes:
      "Adds a 200-scenario campaign plus RPG systems: loot drops, socketed equipment, character skill trees and extra advancement paths.",
    installHint: WESNOTH_INSTALL_HINT,
  }),
];

/**
 * Checked and deliberately excluded. Kept so the same candidates do not get
 * re-proposed from a plausible-looking list.
 *
 *  Already shipped inside the base game (not installable content):
 *    Xonotic Overkill + vehicle mutators   official bundled mutators
 *    Warzone 2100 Ultimate Scavengers      bundled since 4.2.0; upstream repo
 *                                          is archived as "included in the game"
 *    Zero-K Chili UI / tactical widgets    Chili is Zero-K's built-in UI
 *                                          framework; widgets live in the game
 *                                          repo and toggle via Alt+F11
 *    Zero-K PlanetWars                     built-in metagame
 *    Hedgewars Shoppa / Rope Race / Forts  built-in game schemes
 *    SuperTuxKart Gran Paradiso Island     official track since 0.9.1
 *
 *  Real, but incompatible with the version PlayBound installs:
 *    Warzone 2100: Contingency   only release is v0.7.9 from 2013, targeting
 *                                the 3.1 engine. PlayBound installs 4.7.0.
 *    Duxa UI (EverQuest)         distributed as "DuxaUI Titanium" — the 2005
 *                                Titanium client used by P99/Quarm, not the
 *                                Daybreak live client our official edition
 *                                installs. Revisit if a Quarm/P99 edition
 *                                ships, scoped with editionSlug.
 *    Ageless Era (Wesnoth)       maintained, but upstream repo is still
 *                                "Ageless-for-1-14"; 1.18 support unconfirmed.
 *
 *  Cannot work at all:
 *    OpenCiv3 + CivFanatics mods (Rise and Rule, Anno Domini, etc.)
 *                                OpenCiv3 is pre-alpha and its BIQ/SAV loader
 *                                is incomplete — these scenarios do not load.
 *
 *  Verified and wanted, but blocked on a decision rather than on evidence:
 *    mastercomfig (Team Fortress 2)   Real, active and well-licensed — v9.100.1
 *                                     (Jul 2026), 717 stars, MIT,
 *                                     github.com/mastercomfig/mastercomfig.
 *                                     Installs as .vpk files into tf/custom.
 *                                     Not added yet for two reasons: TF2 is
 *                                     still an unpublished "Testing" game, and
 *                                     the release ships 16 assets because users
 *                                     pick a *preset* (low/medium/high/ultra)
 *                                     plus optional addons. A mod entry can
 *                                     only carry one download, so which preset
 *                                     PlayBound ships is a product call, not a
 *                                     research one. Revisit when TF2 publishes.
 *
 *  No evidence the named item exists — do not add without a working URL:
 *    SuperTux "Forest Worlds" / "Yeti's Revenge" / "Castle Worlds"
 *    SuperTuxKart "Subsea Odyssey" / "Canyon Run" / "Volcano Track"
 *    Warzone 2100 "HD Texture Overhaul"
 *    EverQuest "Classic HD Texture & Spell Icon Packs"
 *    Beyond All Reason "widget suite" / "8k-16k map packs"
 *    Xonotic "Esports Tourney Map Packs"
 */
