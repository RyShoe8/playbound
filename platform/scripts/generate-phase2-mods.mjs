/**
 * One-shot generator for phase2 mod wave TypeScript files.
 * Run: node scripts/generate-phase2-mods.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../src/lib/data");

const HELPERS = `import { ghMod, type ModSeed } from "./modSeedHelpers";

type Def = {
  slug: string;
  title: string;
  tagline: string;
  desc: string;
  base: string;
  baseTitle: string;
  path: string;
  website: string;
  repo?: string;
  kind?: "github-zip" | "direct-zip" | "external";
  pattern?: string;
  size?: number;
  year?: number;
  changes: string;
  summary: string;
  hint?: string;
};

function m(d: Def): ModSeed {
  const kind = d.kind ?? (d.repo ? "github-zip" : "external");
  return ghMod({
    slug: d.slug,
    title: d.title,
    tagline: d.tagline,
    description: d.desc,
    baseGameSlug: d.base,
    baseTitle: d.baseTitle,
    developerSlug: "indie-web",
    license: "Community / External hub",
    releaseYear: d.year ?? 2024,
    sizeMB: d.size ?? 40,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: kind === "github-zip" ? d.pattern ?? "\\\\.zip$" : null,
    installRelativePath: d.path,
    art: { from: "#1e293b", to: "#64748b", icon: "Package" },
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
  });
}

`;

function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** @param {[string,string,string,string,string?,string?][]} items */
function packLines(base, baseTitle, folder, items) {
  return items
    .map(([id, title, website, summary, changes, repo]) => {
      const ch = esc(changes || summary);
      const su = esc(summary);
      const ti = esc(title);
      const tg = esc(summary.slice(0, 58));
      const repoPart = repo ? `, repo: '${esc(repo)}'` : `, kind: 'external'`;
      return `  m({ slug: '${base}-${id}', title: '${ti}', tagline: '${tg}', desc: '${su}', base: '${base}', baseTitle: '${esc(baseTitle)}', path: '${esc(folder)}', website: '${esc(website)}'${repoPart}, changes: '${ch}', summary: '${su}' }),`;
    })
    .join("\n");
}

function writeWave(fileName, exportName, headerComment, packs) {
  const names = [];
  let body = `/**\n * ${headerComment}\n */\n${HELPERS}`;
  for (const [name, base, baseTitle, folder, items] of packs) {
    names.push(name);
    body += `const ${name}: ModSeed[] = [\n${packLines(base, baseTitle, folder, items)}\n];\n\n`;
  }
  body += `export const ${exportName}: ModSeed[] = [\n  ${names.join(",\n  ")}\n].flat();\n`;
  fs.writeFileSync(path.join(outDir, fileName), body);
  console.log("wrote", fileName, "mods≈", packs.reduce((n, p) => n + p[4].length, 0));
}

const hub = (n) => n; // identity helper for readability

writeWave(
  "phase2ModsRemasters.ts",
  "phase2ModsRemasters",
  "Phase 2 remaster / FOSS catch-up mods (~16–18 per base).",
  [
    [
      "openrct2Mods",
      "openrct2",
      "OpenRCT2",
      "mods",
      [
        ["openmusic", "OpenMusic", "https://github.com/OpenRCT2/OpenMusic", "Open replacement music pack.", "Adds open music assets.", "OpenRCT2/OpenMusic"],
        ["opensfx", "OpenSFX", "https://github.com/OpenRCT2/OpenSoundEffects", "Open replacement sound effects.", "Adds open SFX.", "OpenRCT2/OpenSoundEffects"],
        ["title-sequences", "Title Sequences", "https://github.com/OpenRCT2/title-sequences", "Custom title sequences.", "Title screen packs.", "OpenRCT2/title-sequences"],
        ["objects", "Official Objects", "https://github.com/OpenRCT2/objects", "Official object definitions.", "Park objects.", "OpenRCT2/objects"],
        ["modding-discord", "OpenRCT2 Discord", "https://discord.gg/openrct2", "Community modding hub.", "Find rides and scenarios."],
        ["scenario-pack", "Scenario downloads", "https://openrct2.org/downloads", "Scenarios and saved parks.", "Community scenarios."],
        ["cheats-menu", "Cheats docs", "https://docs.openrct2.io/en/latest/features/cheats.html", "Built-in cheat features guide.", "Debug tooling docs."],
        ["ride-vehicles", "NEDesigns rides", "https://www.nedesigns.com/", "Custom ride and scenery catalog.", "Custom ride objects."],
        ["multiplayer", "Multiplayer guide", "https://docs.openrct2.io/en/latest/playing/multiplayer.html", "Host and join parks online.", "Server hosting docs."],
        ["localisation", "Localisation", "https://github.com/OpenRCT2/Localisation", "Translation packs.", "UI languages.", "OpenRCT2/Localisation"],
        ["custom-scenery", "Custom scenery", "https://www.nedesigns.com/search/?c=scenery", "Scenery object packs.", "Detailed scenery."],
        ["rct-data", "RCT data install", "https://docs.openrct2.io/en/latest/installing/installing.html", "Using original RCT data legally.", "Legal data guide."],
        ["master-server", "Server list", "https://servers.openrct2.io/", "Public multiplayer servers.", "Browse live parks."],
        ["plugins", "Plugin API", "https://docs.openrct2.io/en/latest/for-developers/javascript-api.html", "JS plugin development.", "Custom plugins."],
        ["twitch", "Twitch notes", "https://docs.openrct2.io/", "Viewer integration notes.", "Streaming plugins."],
        ["linux-ports", "Platform builds", "https://openrct2.org/downloads", "Extra platform builds.", "Alt install channels."],
        ["replays", "Replay tools", "https://docs.openrct2.io/", "Park replay features.", "Debugging parks."],
        ["upstream", "OpenRCT2 source", "https://github.com/OpenRCT2/OpenRCT2", "Upstream repository.", "Build from source.", "OpenRCT2/OpenRCT2"],
      ],
    ],
    [
      "freecivMods",
      "freeciv",
      "Freeciv",
      "data",
      [
        ["modpack", "Modpack hub", "https://www.freeciv.org/wiki/Modpacks", "Official modpack documentation.", "Rulesets and tilesets."],
        ["classic", "Classic ruleset", "https://www.freeciv.org/", "Default classic civilization rules.", "Baseline multiplayer."],
        ["civ2civ3", "Civ2Civ3 ruleset", "https://www.freeciv.org/wiki/Civ2Civ3", "Hybrid Civ2/Civ3 style rules.", "Familiar Civ pacing."],
        ["hex2t", "Hex2t tileset", "https://www.freeciv.org/wiki/Tilesets", "Popular hex tileset.", "Clearer battle maps."],
        ["amplio2", "Amplio2 tileset", "https://www.freeciv.org/wiki/Tilesets", "Amplio2 graphics pack.", "Modernised units."],
        ["toonhex", "ToonHex tileset", "https://www.freeciv.org/wiki/Tilesets", "Cartoon hex tiles.", "Readable FOW."],
        ["web", "Freeciv-web", "https://www.fciv.net/", "Browser Freeciv multiplayer.", "Play without install."],
        ["longturn", "Longturn", "https://www.longturn.net/", "Asynchronous multiplayer.", "One turn per day."],
        ["wiki-mods", "Wiki mods index", "https://www.freeciv.org/wiki/Modpacks", "Community rulesets list.", "Browse rulesets."],
        ["music", "Music packs", "https://www.freeciv.org/wiki/Audio", "Replacement audio packs.", "Ambient music."],
        ["nations", "Extra nations", "https://www.freeciv.org/wiki/Nations", "Expanded nation lists.", "More leaders."],
        ["scenarios", "Scenarios", "https://www.freeciv.org/wiki/Scenarios", "Historical map packs.", "Scripted starts."],
        ["servers", "Public servers", "https://www.freeciv.org/wiki/Online_games", "Public game listings.", "Find multiplayer."],
        ["clients", "Client themes", "https://www.freeciv.org/wiki/Clients", "Alternate clients and UI.", "GTK and Qt clients."],
        ["ruledit", "Ruleset editor", "https://www.freeciv.org/wiki/Ruleset", "Create custom rules.", "Modding toolkit."],
        ["fciv-net", "fciv.net hub", "https://www.fciv.net/", "Active web multiplayer.", "Long-running games."],
        ["gameplay", "Gameplay wiki", "https://www.freeciv.org/wiki/Gameplay", "Strategy guides.", "Learning curve."],
        ["alien", "Alien World", "https://www.freeciv.org/wiki/Modpacks", "Sci-fi scenario content.", "Alien themed play."],
      ],
    ],
    [
      "flightgearMods",
      "flightgear",
      "FlightGear",
      "Aircraft",
      [
        ["official-aircraft", "Official aircraft", "https://www.flightgear.org/download/", "Catalog aircraft downloads.", "Fleet expansions."],
        ["terrasync", "TerraSync", "https://wiki.flightgear.org/TerraSync", "Streaming scenery system.", "World scenery on demand."],
        ["fgaddon", "FGAddon", "https://sourceforge.net/p/flightgear/fgaddon/", "Aircraft and scenery SVN.", "Community fleet."],
        ["fguk", "FGUK hangar", "https://www.fguk.eu/", "UK hangar packages.", "High-detail aircraft."],
        ["airports", "Custom airports", "https://wiki.flightgear.org/Airports", "Airport scenery packs.", "Detailed terminals."],
        ["yasim", "YASim aircraft", "https://wiki.flightgear.org/YASim", "YASim FDM aircraft.", "Alternate flight models."],
        ["jsbsim", "JSBSim aircraft", "https://wiki.flightgear.org/JSBSim", "JSBSim FDM fleet.", "Engineering-grade FDM."],
        ["weather", "Advanced weather", "https://wiki.flightgear.org/Weather", "Weather systems docs.", "METAR-driven skies."],
        ["multiplayer", "Multiplayer map", "https://mpmap02.flightgear.org/", "Live pilot map.", "Find other pilots."],
        ["fgcom", "FGCom radio", "https://wiki.flightgear.org/FGCom", "Voice ATC radio.", "In-sim voice."],
        ["launcher", "Qt launcher", "https://wiki.flightgear.org/FlightGear_Qt_launcher", "Add-ons UI launcher.", "Install aircraft in GUI."],
        ["c172p", "Cessna 172P", "https://github.com/c172p-team/c172p", "Detailed C172 training aircraft.", "Training workhorse.", "c172p-team/c172p"],
        ["airliners", "Airliners hub", "https://wiki.flightgear.org/Aircraft", "Airliner aircraft list.", "Heavy metal."],
        ["helis", "Helicopters", "https://wiki.flightgear.org/Aircraft", "Rotorcraft catalog.", "Heli flying."],
        ["space", "Space flight", "https://wiki.flightgear.org/Orbital_and_spaceflight", "Orbital and space planes.", "Edge-of-space flying."],
        ["wiki", "Developer wiki", "https://wiki.flightgear.org/Portal:Developer", "Aircraft development portal.", "Build your own."],
        ["phi", "Phi web UI", "https://wiki.flightgear.org/Phi", "Browser cockpit tools.", "Remote instruments."],
        ["scenery", "World scenery", "https://wiki.flightgear.org/World_Scenery", "World scenery layers.", "Landclass detail."],
      ],
    ],
    [
      "freedoomMods",
      "freedoom",
      "Freedoom",
      "mods",
      [
        ["dsda", "DSDA-Doom", "https://github.com/kraflab/dsda-doom", "Recommended source port.", "Play Freedoom WADs.", "kraflab/dsda-doom"],
        ["gzdoom", "GZDoom", "https://github.com/ZDoom/gzdoom", "Feature-rich Doom port.", "Hardware renderer.", "ZDoom/gzdoom"],
        ["chocolate", "Chocolate Doom", "https://www.chocolate-doom.org/", "Vanilla-accurate port.", "Classic feel."],
        ["brutal", "Brutal Doom hub", "https://www.moddb.com/mods/brutal-doom", "Popular gameplay overhaul (external).", "Action overhaul."],
        ["moddb", "Freedoom ModDB", "https://www.moddb.com/games/freedoom/mods", "ModDB catalog for Freedoom.", "Browse PWAD mods."],
        ["idgames", "idgames archive", "https://www.doomworld.com/idgames/", "Classic PWAD archive.", "Thousands of maps."],
        ["doomworld", "Doomworld", "https://www.doomworld.com/forum/", "Mapping community forums.", "WAD releases."],
        ["obaddon", "ObAddon", "https://github.com/dashodanger/ObAddon", "Procedural map addons.", "Endless layouts.", "dashodanger/ObAddon"],
        ["textures", "Texture packs", "https://doomwiki.org/wiki/Texture_packs", "Texture pack index.", "Visual upgrades."],
        ["music", "Music packs", "https://doomwiki.org/wiki/Music", "Replacement soundtracks.", "MIDI packs."],
        ["zandronum", "Zandronum", "https://zandronum.com/", "Multiplayer Doom port.", "Online deathmatch."],
        ["hud", "Custom HUDs", "https://forum.zdoom.org/", "HUD addons forum.", "Readable UI."],
        ["gameplay", "Gameplay mods", "https://doomwiki.org/wiki/Gameplay_mod", "Gameplay overhaul index.", "Mode variety."],
        ["lights", "Brightmaps", "https://forum.zdoom.org/", "Lighting packs discussion.", "Dynamic lights."],
        ["controller", "Controller configs", "https://zdoom.org/wiki/", "Gamepad presets.", "Couch play."],
        ["launcher", "Doom Launcher", "https://github.com/nickpasquale89/DoomLauncher", "WAD organizer tool.", "Manage PWAD sets."],
        ["phase", "Recent WADs", "https://www.doomworld.com/", "Recent community mapsets.", "New episodes."],
        ["freedoom-site", "Freedoom site", "https://freedoom.github.io/", "Official IWAD downloads.", "Base assets."],
      ],
    ],
    [
      "lincityMods",
      "lincity-ng",
      "LinCity-NG",
      "data",
      [
        ["github", "Upstream releases", "https://github.com/lincity-ng/lincity-ng", "Official builds and source.", "Latest binaries.", "lincity-ng/lincity-ng"],
        ["wiki", "Game wiki", "https://github.com/lincity-ng/lincity-ng/wiki", "Mechanics documentation.", "Learn systems."],
        ["ubuntu", "Distro packages", "https://packages.ubuntu.com/search?keywords=lincity-ng", "Linux distribution packages.", "Easy Linux install."],
        ["classic", "Classic LinCity", "https://lincity.sourceforge.net/", "Original LinCity project.", "Historical version."],
        ["strategy", "Strategy guides", "https://github.com/lincity-ng/lincity-ng/wiki", "City planning tips.", "Sustainability."],
        ["translations", "Translations", "https://github.com/lincity-ng/lincity-ng", "i18n contribution path.", "Language packs.", "lincity-ng/lincity-ng"],
        ["issues", "Issue tracker", "https://github.com/lincity-ng/lincity-ng/issues", "Bugs and feature ideas.", "Mod ideas."],
        ["discuss", "Discussions", "https://github.com/lincity-ng/lincity-ng/discussions", "Community Q&A.", "Help threads."],
        ["license", "Licensing", "https://github.com/lincity-ng/lincity-ng/blob/master/COPYING", "GPL redistribution terms.", "Legal reuse."],
        ["devtools", "Build from source", "https://github.com/lincity-ng/lincity-ng", "Contributor setup docs.", "Dev tooling."],
        ["audio", "Audio credits", "https://github.com/lincity-ng/lincity-ng", "Sound asset notes.", "SFX packs."],
        ["graphics", "Graphics notes", "https://github.com/lincity-ng/lincity-ng", "Art contribution notes.", "Visual variants."],
        ["compare", "Background", "https://en.wikipedia.org/wiki/LinCity", "Project history reading.", "Context."],
        ["saves", "Shared cities", "https://github.com/lincity-ng/lincity-ng/issues", "Community save discussions.", "Example cities."],
        ["flatpak", "Package hubs", "https://flathub.org/", "Containerized packaging if listed.", "Sandbox installs."],
        ["screens", "Media", "https://github.com/lincity-ng/lincity-ng", "Screenshots for guides.", "Promo art."],
      ],
    ],
    [
      "tesArenaMods",
      "tes-arena",
      "The Elder Scrolls: Arena",
      "mods",
      [
        ["openarena", "OpenArena path", "https://openarena.ws", "Free arena multiplayer edition.", "Install via PlayBound edition."],
        ["oa-maps", "OpenArena maps", "https://www.moddb.com/games/openarena/addons", "Map packs for OpenArena.", "Extra arenas."],
        ["oa-moddb", "OpenArena mods", "https://www.moddb.com/games/openarena/mods", "OA total conversions.", "Community content."],
        ["arena-freeware", "Arena freeware", "https://elderscrolls.bethesda.net/en/arena", "Official freeware download.", "Legal Arena data."],
        ["dosbox", "DOSBox Staging", "https://github.com/dosbox-staging/dosbox-staging", "Run classic Arena in DOSBox.", "DOS emulator.", "dosbox-staging/dosbox-staging"],
        ["nexus", "Arena Nexus", "https://www.nexusmods.com/elderscrollsarena", "Community installers and fixes.", "Verify files carefully."],
        ["uesp", "UESP Arena", "https://en.uesp.net/wiki/Arena:Arena", "Lore and walkthrough wiki.", "Classic tips."],
        ["oa-wiki", "OA wiki", "https://openarena.fandom.com/", "Console and server guides.", "Server cvars."],
        ["oa-source", "OA engine", "https://github.com/OpenArena/engine", "OpenArena engine source.", "Compile custom.", "OpenArena/engine"],
        ["textures-oa", "OA textures", "https://www.moddb.com/games/openarena", "Visual upgrades for OA.", "HD texture packs."],
        ["bots", "OA bots", "https://openarena.ws", "Offline practice bots.", "Training."],
        ["midi", "MIDI packs", "https://www.nexusmods.com/elderscrollsarena", "Music replacements for Arena.", "Soundtrack."],
        ["controls", "Controls guide", "https://en.uesp.net/wiki/Arena:Controls", "Keyboard layouts.", "QoL references."],
        ["ioq3", "ioquake3", "https://ioquake3.org/", "Related id Tech engine work.", "Engine cousins."],
        ["remasters", "Fan projects", "https://www.moddb.com/games/the-elder-scrolls-arena", "Fan remaster index.", "Browse carefully."],
        ["ctf", "OA CTF packs", "https://openarena.ws", "Capture the flag maps.", "Objective modes."],
        ["legal", "Freeware FAQ", "https://elderscrolls.bethesda.net/en/arena", "Bethesda freeware terms.", "Stay legal."],
        ["moddb-arena", "Arena ModDB", "https://www.moddb.com/games/the-elder-scrolls-arena", "ModDB game page.", "Community posts."],
      ],
    ],
    [
      "daggerfallMods",
      "daggerfall",
      "Daggerfall",
      "Mods",
      [
        ["dfu", "Daggerfall Unity", "https://www.dfworkshop.net", "Default remaster edition.", "Modern DFU client."],
        ["dfworkshop", "DF Workshop mods", "https://www.dfworkshop.net/projects/daggerfall-unity/modding", "Official modding portal.", "Quest and world mods."],
        ["nexus", "Nexus DFU", "https://www.nexusmods.com/daggerfallunity", "Nexus DFU catalog.", "Popular mods."],
        ["sky", "Enhanced sky", "https://www.nexusmods.com/daggerfallunity", "Sky and weather packs.", "Atmospherics."],
        ["travel", "Travel options", "https://www.nexusmods.com/daggerfallunity", "Fast travel QoL mods.", "Journey UX."],
        ["ui", "UI overhauls", "https://www.nexusmods.com/daggerfallunity", "Interface overhaul mods.", "Readable UI."],
        ["combat", "Combat gameplay", "https://www.nexusmods.com/daggerfallunity", "Combat rebalance packs.", "Fight feel."],
        ["quests", "Quest packs", "https://www.dfworkshop.net", "Community quest content.", "New stories."],
        ["graphics", "Graphics packs", "https://www.nexusmods.com/daggerfallunity", "Texture upgrades.", "Visual fidelity."],
        ["audio", "Audio overhaul", "https://www.nexusmods.com/daggerfallunity", "SFX and music packs.", "Immersion."],
        ["gog", "Classic on GOG", "https://www.gog.com/game/the_elder_scrolls_chapter_ii_daggerfall", "Legal classic data source.", "Own the data."],
        ["uesp", "UESP Daggerfall", "https://en.uesp.net/wiki/Daggerfall:Daggerfall", "Wiki guides and maps.", "Quest help."],
        ["forums", "DF Workshop forums", "https://forums.dfworkshop.net/", "Modding support forums.", "Help threads."],
        ["github", "GitHub topic", "https://github.com/topics/daggerfall-unity", "Open DFU mods on GitHub.", "Source mods."],
        ["controller", "Controller notes", "https://www.dfworkshop.net", "Gamepad support notes.", "Couch RPG."],
        ["performance", "Performance tips", "https://forums.dfworkshop.net/", "Optimization threads.", "Large cities."],
        ["character", "Character templates", "https://www.nexusmods.com/daggerfallunity", "Starts and class packs.", "Builds."],
        ["world", "World enhancements", "https://www.nexusmods.com/daggerfallunity", "Worldgen and exploration tweaks.", "Bigger world feel."],
      ],
    ],
  ]
);

/** Live-service / classics external hubs — ~16–18 each */
function livePack(base, baseTitle, folder, hubs) {
  return [
    `${base.replace(/-/g, "")}Mods`,
    base,
    baseTitle,
    folder,
    hubs.map(([id, title, website, summary]) => [id, title, website, summary, summary]),
  ];
}

const livePacks = [
  livePack("everquest", "EverQuest", "external", [
    ["project-quarm", "Project Quarm", "https://www.projectquarm.com/", "Community Quarm era homepage."],
    ["project-99", "Project 1999", "https://www.project1999.com/", "Classic P99 community homepage."],
    ["p99-wiki", "P99 Wiki", "https://wiki.project1999.com/", "Guides, maps, and spawns."],
    ["quarm-wiki", "Quarm Wiki", "https://wiki.projectquarm.com/", "Quarm documentation hub."],
    ["alliakhazam", "Allakhazam EQ", "https://everquest.allakhazam.com/", "Database and guides."],
    ["eqresource", "EQ Resource", "https://www.eqresource.com/", "Modern EQ resources."],
    ["lucy", "Lucy item DB", "https://lucy.allakhazam.com/", "Item search database."],
    ["mapfiend", "Map resources", "https://www.eqmaps.info/", "Map packs and overlays."],
    ["takp", "TAKP notes", "https://www.takproject.net/", "Other classic era projects."],
    ["official", "Official EQ", "https://www.everquest.com", "Daybreak EverQuest site."],
    ["forums-p99", "P99 forums", "https://www.project1999.com/forums/", "Community discussion."],
    ["quarm-discord", "Quarm Discord", "https://discord.gg/projectquarm", "Quarm community Discord."],
    ["ui", "UI packs hub", "https://www.eqinterface.com/", "Interface customizations."],
    ["raid", "Raid strategies", "https://wiki.project1999.com/", "Raid writeups on wiki."],
    [" bargains", "Economy tools", "https://wiki.project1999.com/index.php/Tradeskill", "Tradeskill references."],
    ["spell", "Spell lists", "https://wiki.project1999.com/", "Class spell references."],
    ["zones", "Zone connections", "https://wiki.project1999.com/", "Zone connection maps."],
    ["install", "Install checklist", "https://www.project1999.com/", "Client install checklist."],
  ]),
  livePack("star-wars-galaxies", "Star Wars Galaxies", "external", [
    ["infinity", "SWG Infinity", "https://www.swginfinity.com/", "Infinity launcher and servers."],
    ["legends", "SWG Legends", "https://www.swglegends.com/", "NGE-focused community."],
    ["beyond", "SWG Beyond", "https://www.swgbeyond.com/", "Beyond community edition."],
    ["swgemu", "SWGEmu", "https://www.swgemu.com/", "SWGEmu project portal."],
    ["swgemu-wiki", "SWGEmu Wiki", "https://wiki.swgemu.com/", "Emulator documentation."],
    ["restoration", "Restoration notes", "https://www.swgemu.com/", "Pre-CU restoration focus."],
    ["basilisk", "Basilisk history", "https://www.swgemu.com/", "Historic public test galaxy."],
    ["craft", "Crafting guides", "https://wiki.swgemu.com/", "Profession crafting."],
    ["cities", "Player cities", "https://wiki.swgemu.com/", "City planning guides."],
    ["combat", "Combat trees", "https://wiki.swgemu.com/", "Combat professions."],
    ["jedi", "Force sensitive", "https://wiki.swgemu.com/", "FS unlock guides."],
    ["vehicles", "Vehicles", "https://wiki.swgemu.com/", "Vehicle and mount lists."],
    ["discord-inf", "Infinity Discord", "https://discord.gg/swginfinity", "Infinity community Discord."],
    ["macros", "Macro guides", "https://wiki.swgemu.com/", "UI macro how-tos."],
    ["entertainment", "Entertainer", "https://wiki.swgemu.com/", "Buff and idle professions."],
    ["space", "JTL space", "https://wiki.swgemu.com/", "Jump to Lightspeed notes."],
    ["housing", "Housing décor", "https://wiki.swgemu.com/", "Decoration guides."],
    ["legal", "Client sources", "https://www.swgemu.com/", "Approved client download paths."],
  ]),
];

// Fix accidental space in everquest id
livePacks[0][4] = livePacks[0][4].map((row) => {
  if (row[0].includes(" ")) return [row[0].trim().replace(/\s+/g, "-"), ...row.slice(1)];
  return row;
});

const moreLive = [
  ["starcraft", "StarCraft", "maps", [
    ["battle-net", "Battle.net", "https://starcraft.com", "Official Remastered free client."],
    ["liquipedia", "Liquipedia SC", "https://liquipedia.net/starcraft", "Esports and build encyclopedia."],
    ["tl", "TeamLiquid", "https://tl.net/", "Competitive news and forums."],
    ["scmscx", "SCMScx maps", "https://www.scmscx.com/", "Map and campaign archive."],
    ["iccup", "iCCup", "https://iccup.com/", "Legacy ladder community."],
    ["scr-maps", "Remastered maps", "https://starcraft.com", "Official map features."],
    ["campaigns", "Custom campaigns", "https://www.scmscx.com/", "Story campaign packs."],
    ["observer", "Observer UIs", "https://tl.net/", "Casting UI discussions."],
    ["bw-api", "BWAPI", "https://github.com/bwapi/bwapi", "AI research API (advanced).", "bwapi/bwapi"],
    ["openbw", "OpenBW", "https://github.com/OpenBW/openbw", "Open replays research.", "OpenBW/openbw"],
    ["macros", "Build order tools", "https://lotv.spawningtool.com/", "Related spawning tools ecosystem."],
    ["freezer", "Freeze & training", "https://tl.net/", "Training map discussions."],
    ["ums", "UMS maps", "https://www.scmscx.com/", "Use Map Settings maps."],
    ["voice", "Community Discord lists", "https://tl.net/", "Find training partners."],
    ["wiki", "Strategy wiki", "https://liquipedia.net/starcraft/Strategy", "Race strategy primers."],
    ["replays", "Replay packs", "https://tl.net/", "Pro replay archives."],
    [" Brood", "Brood War classic", "https://starcraft.com", "Classic BW via Remastered."],
    ["legal", "Official downloads", "https://starcraft.com", "Stay on Battle.net."],
  ]],
  ["diablo-2", "Diablo II", "external", [
    ["d2r", "Diablo II Resurrected", "https://diablo2.blizzard.com", "Official D2R product page."],
    ["maxroll", "Maxroll D2", "https://maxroll.gg/d2", "Build planners and guides."],
    ["d2wiki", "D2 wiki", "https://diablo2.io/", "Community trade and tools."],
    ["d2i", "diablo2.io", "https://diablo2.io/", "Economy and drop tools."],
    ["pd2", "Project Diablo 2", "https://www.projectdiablo2.com/", "Popular season mod (external)."],
    ["pod", "Path of Diablo", "https://pathofdiablo.com/", "Community season mod hub."],
    ["filter", "Loot filter hubs", "https://github.com/ThoughtfulDev/LootFilter", "Filter discussions and packs."],
    ["runewords", "Runewords", "https://diablo2.diablowiki.net/Runewords", "Runeword reference."],
    ["bosses", "Boss guides", "https://maxroll.gg/d2", "Farming routes."],
    ["ladder", "Ladder tracker", "https://diablo2.io/", "Ladder economy."],
    ["classic", "Classic D2 notes", "https://diablo2.blizzard.com", "Legacy classic clients."],
    ["controller", "Controller tips", "https://diablo2.blizzard.com", "Console/PC controller."],
    ["trades", "Trade sites", "https://diablo2.io/", "Trading platforms."],
    ["armory", "Character tools", "https://d2.maxroll.gg/", "Planner ecosystem."],
    ["sunder", "Sunder charms", "https://maxroll.gg/d2", "D2R season mechanics."],
    ["terror", "Terror Zones", "https://maxroll.gg/d2", "TZ farming guides."],
    ["mercenary", "Mercenary setups", "https://maxroll.gg/d2", "Merc gearing."],
    ["legal", "Battle.net only", "https://diablo2.blizzard.com", "Official install path."],
  ]],
  ["wolfenstein", "Wolfenstein", "mods", [
    ["ecwolf", "ECWolf", "https://maniacsvault.net/ecwolf/", "Modern Wolf3D source port."],
    ["ecwolf-gh", "ECWolf GitHub", "https://github.com/EscapeLag/ECWolf", "Source and releases.", "EscapeLag/ECWolf"],
    ["shareware", "Wolf3D shareware", "https://www.3drealms.com/", "Legal shareware data roots."],
    ["moddb", "Wolf ModDB", "https://www.moddb.com/games/wolfenstein-3d", "Mods and TC index."],
    ["spear", "Spear of Destiny", "https://maniacsvault.net/ecwolf/", "Spear support notes."],
    ["super-3d", "Super 3D Noah notes", "https://maniacsvault.net/ecwolf/", "Related engine games."],
    ["maps", "Map packs", "https://www.moddb.com/games/wolfenstein-3d/addons", "Custom missions."],
    ["hd", "HD texture projects", "https://www.moddb.com/games/wolfenstein-3d", "Visual upgrades."],
    ["sdl", "Wolf4SDL", "https://github.com/LinuxDoom/Wolf4SDL", "Alternate port lineage."],
    ["dosbox", "DOSBox path", "https://www.dosbox.com/", "Run original DOS builds."],
    ["bsp", "Editor tools", "https://maniacsvault.net/ecwolf/", "Mapping tool notes."],
    ["audio", "Audio packs", "https://www.moddb.com/games/wolfenstein-3d", "Music replacements."],
    ["controller", "Controller", "https://maniacsvault.net/ecwolf/", "Gamepad configs."],
    ["wiki", "Wolfenstein wiki", "https://wolfenstein.fandom.com/", "Lore and history."],
    ["rtcW", "Return to Castle", "https://www.moddb.com/games/return-to-castle-wolfenstein", "Related franchise mods."],
    ["et", "Enemy Territory", "https://www.etlegacy.com/", "Free multiplayer cousin."],
    ["legacy", "ET: Legacy", "https://www.etlegacy.com/", "Open multiplayer port."],
    ["legal", "Legal data", "https://maniacsvault.net/ecwolf/", "Shareware and owned data only."],
  ]],
];

function normalizeLiveRow(row) {
  // allow optional 5th repo
  const [id, title, website, summary, repo] = row;
  const cleanId = String(id).trim().replace(/\s+/g, "-").toLowerCase();
  return repo
    ? [cleanId, title, website, summary, summary, repo]
    : [cleanId, title, website, summary, summary];
}

for (const [base, baseTitle, folder, hubs] of moreLive) {
  livePacks.push([
    `${base.replace(/-/g, "")}Mods`,
    base,
    baseTitle,
    folder,
    hubs.map(normalizeLiveRow),
  ]);
}

const f2pMore = [
  ["war-thunder", "War Thunder", [
    ["store", "Steam page", "https://store.steampowered.com/app/236390", "Official Steam install."],
    ["gaijin", "Gaijin launcher", "https://warthunder.com", "Official site downloads."],
    ["wiki", "WT wiki", "https://wiki.warthunder.com/", "Vehicle encyclopedia."],
    ["skins", "Live.WarThunder skins", "https://live.warthunder.com/", "User skins marketplace."],
    ["missions", "User missions", "https://live.warthunder.com/", "Custom missions."],
    ["cdk", "CDK tools", "https://wiki.warthunder.com/Customisation_kit", "Content development kit."],
    ["thunder", "Thunder Skill", "https://thunderskill.com/", "Stats and ratings."],
    ["wtlive", "WT Live localization", "https://live.warthunder.com/", "Localization packs."],
    ["maps", "Map knowledge", "https://wiki.warthunder.com/", "Map callouts."],
    ["squad", "Squadrons", "https://warthunder.com", "Clan tools."],
    ["economy", "Economy guides", "https://wiki.warthunder.com/", "SL and RP farming."],
    ["replays", "Replay analysis", "https://warthunder.com", "Replay tools."],
    ["controller", "Hotas setups", "https://forum.warthunder.com/", "Control profiles."],
    ["forum", "Official forums", "https://forum.warthunder.com/", "Community support."],
    ["youtube", "Creator tools", "https://live.warthunder.com/", "Cameras and skins."],
    ["vr", "VR notes", "https://wiki.warthunder.com/", "VR support info."],
    ["nations", "Tech trees", "https://wiki.warthunder.com/", "Nation lineups."],
    ["legal", "ToS content rules", "https://warthunder.com", "Approved customisation only."],
  ]],
  ["world-of-tanks", "World of Tanks", [
    ["official", "Wargaming", "https://worldoftanks.com", "Official Game Center."],
    ["modhub", "Mods Hub", "https://wgmods.net/", "Official-friendly mod portal."],
    ["tomato", "Tomato.gg", "https://tomato.gg/", "Stats and replays."],
    ["skills", "Skill4ltu", "https://skill4ltu.eu/", "Tank guides."],
    ["kb", "KB website", "https://koreanrandom.com/", "Modding community."],
    ["xvm", "XVM ecosystem", "https://modxvm.com/", "Popular stats mod ecosystem."],
    ["maps", "Map callouts", "https://worldoftanks.com", "Map guides."],
    ["clan", "Clan tools", "https://worldoftanks.com", "Stronghold tools."],
    ["replays", "Wotreplays", "https://wotreplays.eu/", "Replay sharing."],
    ["tanks", "TankCompare", "https://tanks.gg/", "Tank stat compare."],
    ["crew", "Crew guides", "https://worldoftanks.com", "Crew training."],
    ["equipment", "Equipment 2.0", "https://worldoftanks.com", "Loadouts."],
    ["ranked", "Ranked battles", "https://worldoftanks.com", "Mode guides."],
    ["console", "Console WoT", "https://console.worldoftanks.com/", "Console edition."],
    ["blitz", "WoT Blitz", "https://wotblitz.com/", "Blitz cousin title."],
    ["forum", "Forums", "https://forum.worldoftanks.com/", "Official forums."],
    ["legal", "Mod rules", "https://wgmods.net/", "Approved mods only."],
    ["installer", "Game Center", "https://worldoftanks.com", "Official installer."],
  ]],
  ["apex-legends", "Apex Legends", [
    ["steam", "Steam", "https://store.steampowered.com/app/1172470", "Steam install."],
    ["ea", "EA App", "https://www.ea.com/games/apex-legends", "EA launcher."],
    ["tracker", "Tracker.gg", "https://apex.tracker.gg/", "Stats tracker."],
    ["overtrail", "Overtrail", "https://overtrail.app/", "Legend meta tools."],
    ["map", "Mapstrategy", "https://apexlegendsstatus.com/", "Server and map status."],
    ["status", "Apex Status", "https://apexlegendsstatus.com/", "Platform status."],
    ["wiki", "Apex wiki", "https://apexlegends.fandom.com/", "Legend encyclopedia."],
    ["discord", "LFP Discords", "https://www.ea.com/games/apex-legends", "Find teammates legally."],
    ["controller", "Aim guides", "https://www.ea.com/games/apex-legends", "Input tips."],
    ["rank", "Ranked guides", "https://apexlegendsstatus.com/", "Ranked map rotations."],
    ["crafting", "Crafting rotation", "https://apexlegendsstatus.com/", "Store rotations."],
    ["settings", "Config tips", "https://www.ea.com/games/apex-legends", "Video settings."],
    ["creative", "No custom clients", "https://www.ea.com/games/apex-legends", "EAC — external hubs only."],
    ["legends", "Legend kits", "https://apexlegends.fandom.com/", "Ability reference."],
    ["weapons", "Weapon meta", "https://apexlegendsstatus.com/", "Weapon stats."],
    ["events", "Events calendar", "https://www.ea.com/games/apex-legends", "Limited modes."],
    ["crossplay", "Crossplay", "https://www.ea.com/games/apex-legends", "Platform parties."],
    ["legal", "ToS", "https://www.ea.com/legal", "Anti-cheat ToS."],
  ]],
  ["hearthstone", "Hearthstone", [
    ["bnet", "Battle.net", "https://hearthstone.blizzard.com", "Official install."],
    ["hsreplay", "HSReplay", "https://hsreplay.net/", "Deck winrates."],
    ["firestone", "Firestone", "https://github.com/Zero-to-Heroes/firestone", "Overlay tracker (policy check).", "Zero-to-Heroes/firestone"],
    ["vicious", "Vicious Syndicate", "https://www.vicioussyndicate.com/", "Meta reports."],
    ["hsmeta", "Hearthstone Top Decks", "https://www.hearthstonetopdecks.com/", "Decklists."],
    ["wiki", "Gamepedia/Fandom", "https://hearthstone.fandom.com/", "Card encyclopedia."],
    ["duels", "Duels tools", "https://hsreplay.net/", "Duels analytics."],
    ["bg", "Battlegrounds", "https://hsreplay.net/battlegrounds/", "BG comps."],
    ["mercenaries", "Mercenaries", "https://hearthstone.fandom.com/", "Merc guides."],
    ["collection", "Collection helpers", "https://hsreplay.net/", "Dust calculators."],
    ["arena", "Arena pick helpers", "https://hsreplay.net/", "Draft tools."],
    ["ports", "Standard rotation", "https://hearthstone.blizzard.com", "Year of rotations."],
    ["esports", "Esports", "https://hearthstone.blizzard.com/esports", "Official tournaments."],
    ["forum", "Blizzard forums", "https://us.forums.blizzard.com/en/hearthstone/", "Support forums."],
    ["mobile", "Mobile clients", "https://hearthstone.blizzard.com", "iOS/Android."],
    ["creators", "Creator kit", "https://hearthstone.blizzard.com", "Press assets."],
    ["legal", "Third-party policy", "https://hearthstone.blizzard.com", "Allowed tools only."],
    ["deckbuilder", "In-game decks", "https://hearthstone.blizzard.com", "Official deck codes."],
  ]],
  ["team-fortress-2", "Team Fortress 2", [
    ["steam", "Steam", "https://store.steampowered.com/app/440", "Free Steam install."],
    ["workshop", "Workshop", "https://steamcommunity.com/app/440/workshop/", "Official Workshop."],
    ["cfg", "mastercoms cfg", "https://github.com/mastercoms/mastercomfig", "Popular FPS configs.", "mastercoms/mastercomfig"],
    ["backpack", "Backpack.tf", "https://backpack.tf/", "Item economy."],
    ["scrap", "Scrap.tf", "https://scrap.tf/", "Item trading bots."],
    ["marketplace", "Marketplace.tf", "https://marketplace.tf/", "Cash trades."],
    ["comp", "RGL.gg", "https://rgl.gg/", "Competitive leagues."],
    ["etf2l", "ETF2L", "https://etf2l.org/", "EU competition."],
    ["trvhud", "ToonHUD", "https://toonhud.com/", "Custom HUDs."],
    ["hud", "TF2 HUDs", "https://huds.tf/", "HUD catalog."],
    ["maps", "Custom maps", "https://steamcommunity.com/app/440/workshop/", "Workshop maps."],
    ["sourcemod", "Server plugins", "https://www.sourcemod.net/", "Server-side plugins."],
    ["tv", "STV demos", "https://demos.tf/", "Demo downloads."],
    ["wiki", "Official wiki", "https://wiki.teamfortress.com/", "Mechanic encyclopedia."],
    ["loadout", "Loadout.tf", "https://loadout.tf/", "Cosmetic preview."],
    ["quake", "Hitsound packs", "https://gamebanana.com/games/297", "Community hitsounds."],
    ["scripting", "Scripting wiki", "https://wiki.teamfortress.com/wiki/Scripting", "Alias scripts."],
    ["legal", "VAC safe", "https://store.steampowered.com/app/440", "No cheats — Workshop only."],
  ]],
];

for (const [base, baseTitle, hubs] of f2pMore) {
  livePacks.push([
    `${base.replace(/-/g, "")}Mods`,
    base,
    baseTitle,
    "external",
    hubs.map(normalizeLiveRow),
  ]);
}

const finalF2p = [
  ["genshin-impact", "Genshin Impact", [
    ["official", "Hoyoverse", "https://genshin.hoyoverse.com", "Official launcher."],
    ["map", "Interactive map", "https://act.hoyolab.com/ys/app/interactive-map/index.html", "Official HoYo map."],
    ["paimon", "Paimon.moe", "https://paimon.moe/", "Wish and collection tools."],
    ["enka", "Enka.Network", "https://enka.network/", "Showcase cards."],
    ["keqing", "KQM", "https://keqingmains.com/", "Theorycrafting guides."],
    ["gcsim", "gcsim", "https://gcsim.app/", "Combat simulator."],
    ["honey", "Honey Impact", "https://genshin.honeyhunterworld.com/", "Database."],
    ["wikia", "Fandom wiki", "https://genshin-impact.fandom.com/", "Lore and items."],
    ["hoyolab", "HoYoLAB", "https://www.hoyolab.com/", "Official community."],
    ["builds", "Build cards", "https://keqingmains.com/", "Character builds."],
    ["spiral", "Spiral Abyss", "https://keqingmains.com/", "Abyss guides."],
    ["events", "Event trackers", "https://paimon.moe/", "Event calendars."],
    ["teambuilder", "Team builder", "https://gcsim.app/", "Team DPS sims."],
    ["voice", "Voiceover", "https://genshin.hoyoverse.com", "Language packs via client."],
    ["controller", "Controller", "https://genshin.hoyoverse.com", "Gamepad support."],
    ["ps", "PlayStation", "https://www.playstation.com/", "Console edition."],
    ["legal", "ToS", "https://genshin.hoyoverse.com", "No unofficial clients."],
    ["map-community", "Community maps", "https://genshin-impact.fandom.com/", "Supplement maps."],
  ]],
  ["dota-2", "Dota 2", [
    ["steam", "Steam", "https://store.steampowered.com/app/570", "Free Steam install."],
    ["workshop", "Workshop", "https://steamcommunity.com/app/570/workshop/", "Custom games workshop."],
    ["dotabuff", "Dotabuff", "https://www.dotabuff.com/", "Stats and trends."],
    ["stratz", "STRATZ", "https://stratz.com/", "Advanced analytics."],
    ["opendota", "OpenDota", "https://www.opendota.com/", "Open API stats."],
    ["liquipedia", "Liquipedia", "https://liquipedia.net/dota2", "Esports wiki."],
    ["aghs", "Aghanim labs", "https://www.dota2.com/", "Custom game modes."],
    ["overwolf", "Overlays policy", "https://www.dota2.com/", "Use allowed overlays only."],
    ["guides", "In-game guides", "https://www.dota2.com/", "Built-in guide browser."],
    ["items", "Item builds", "https://www.dotabuff.com/", "Itemization trends."],
    ["heroes", "Hero grid tools", "https://www.opendota.com/", "Hero stats."],
    ["replay", "Replay analysis", "https://www.opendota.com/", "Parse replays."],
    ["fantasy", "Fantasy Dota", "https://www.dota2.com/", "Official fantasy."],
    ["plus", "Dota Plus", "https://www.dota2.com/plus", "Official subscription tools."],
    ["custom", "Arcade games", "https://steamcommunity.com/app/570/workshop/", "Custom arcade."],
    ["voice", "Chat wheels", "https://www.dota2.com/", "Cosmetic voice lines."],
    ["config", "Launch options", "https://www.dota2.com/", "Known safe options."],
    ["legal", "VAC", "https://store.steampowered.com/app/570", "No cheats."],
  ]],
  ["league-of-legends", "League of Legends", [
    ["riot", "Riot Client", "https://www.leagueoflegends.com", "Official install only."],
    ["opgg", "OP.GG", "https://www.op.gg/", "Profiles and builds."],
    ["uigg", "U.GG", "https://u.gg/", "Build aggregators."],
    ["blitz", "Blitz.gg", "https://blitz.gg/", "Overlay (policy check)."],
    ["porofessor", "Porofessor", "https://porofessor.gg/", "Live game overlay hub."],
    ["wiki", "League wiki", "https://wiki.leagueoflegends.com/", "Champion encyclopedia."],
    ["universe", "Universe", "https://universe.leagueoflegends.com/", "Lore hub."],
    ["esports", "LoL Esports", "https://lolesports.com/", "Pro scene."],
    ["tft", "TFT companion", "https://teamfighttactics.leagueoflegends.com/", "Auto-battler cousin."],
    ["wildrift", "Wild Rift", "https://wildrift.leagueoflegends.com/", "Mobile cousin."],
    ["runes", "Rune pages", "https://u.gg/", "Rune recommendations."],
    ["skills", "Skill order", "https://www.op.gg/", "Leveling orders."],
    ["aram", "ARAM tools", "https://u.gg/", "ARAM builds."],
    ["clash", "Clash", "https://www.leagueoflegends.com", "Amateur tournaments."],
    ["dev", "Developer portal", "https://developer.riotgames.com/", "Riot API apps."],
    ["support", "Support", "https://support-leagueoflegends.riotgames.com/", "Account help."],
    ["legal", "Third-party policy", "https://www.riotgames.com/en/legal", "Allowed software only."],
    ["client", "No injectors", "https://www.leagueoflegends.com", "External hubs only."],
  ]],
  ["valorant", "VALORANT", [
    ["riot", "Riot Client", "https://playvalorant.com", "Official install + Vanguard."],
    ["tracker", "Tracker.gg", "https://tracker.gg/valorant", "Stats tracker."],
    ["blitz", "Blitz Valorant", "https://blitz.gg/valorant", "Lineups and overlays."],
    ["nightbot", "Lineup sites", "https://lineupsvalorant.com/", "Agent lineups."],
    ["wiki", "Fandom wiki", "https://valorant.fandom.com/", "Agent encyclopedia."],
    ["map", "Map callouts", "https://playvalorant.com", "Official map notes."],
    ["esports", "VCT", "https://valorantesports.com/", "Esports hub."],
    ["specs", "Settings DB", "https://prosettings.net/games/valorant/", "Pro settings."],
    ["crosshair", "Crosshair copy", "https://www.vcrimson.com/", "Crosshair strings."],
    ["vod", "VOD review", "https://tracker.gg/valorant", "Match history."],
    ["agents", "Agent comps", "https://tracker.gg/valorant", "Meta agents."],
    ["range", "Range routines", "https://playvalorant.com", "Practice range."],
    ["voice", "Voice lines", "https://valorant.fandom.com/", "Cosmetics lore."],
    ["console", "Console edition", "https://playvalorant.com", "Console notes."],
    ["support", "Support", "https://support-valorant.riotgames.com/", "Ticket help."],
    ["api", "Riot API", "https://developer.riotgames.com/", "Legit apps."],
    ["legal", "Vanguard ToS", "https://playvalorant.com", "No file drops."],
    ["lineups", "Community lineups", "https://lineupsvalorant.com/", "Utility lineups."],
  ]],
  ["counter-strike-2", "Counter-Strike 2", [
    ["steam", "Steam", "https://store.steampowered.com/app/730", "Free CS2 install."],
    ["workshop", "Workshop maps", "https://steamcommunity.com/app/730/workshop/", "Aim and execute maps."],
    ["leetify", "Leetify", "https://leetify.com/", "Demo analytics."],
    ["scope", "SCOPE.gg", "https://scope.gg/", "VOD tools."],
    ["hltv", "HLTV", "https://www.hltv.org/", "Pro scene news."],
    ["liquipedia", "Liquipedia CS", "https://liquipedia.net/counterstrike", "Team encyclopedia."],
    ["cfg", "CFG repositories", "https://github.com/cfggroundzero", "Shared configs (review!)."],
    ["nades", "Nade king", "https://nadeking.com/", "Utility lineups."],
    ["csgo", "Dust2.us", "https://dust2.us/", "NA community news."],
    ["faceit", "FACEIT", "https://www.faceit.com/", "Third-party matchmaking."],
    ["popflash", "Popflash", "https://popflash.site/", "Pug platforms."],
    ["skins", "Steam Market", "https://steamcommunity.com/market/", "Cosmetic market."],
    ["servers", "Community servers", "https://developer.valvesoftware.com/", "Server hosting docs."],
    ["maps", "Yprac maps", "https://steamcommunity.com/app/730/workshop/", "Practice Workshop maps."],
    ["radar", "Radar tools", "https://www.hltv.org/", "Watch radar tools."],
    ["launch", "Launch options", "https://www.counter-strike.net", "Known safe options."],
    ["vac", "VAC policy", "https://store.steampowered.com/app/730", "No cheats."],
    ["legal", "Workshop only", "https://steamcommunity.com/app/730/workshop/", "Prefer Workshop content."],
  ]],
  ["quake-champions", "Quake Champions", [
    ["steam", "Steam", "https://store.steampowered.com/app/611500", "Steam install."],
    ["bethesda", "Bethesda.net", "https://quake.bethesda.net", "Official portal."],
    ["liquipedia", "Liquipedia QC", "https://liquipedia.net/quake", "Esports wiki."],
    ["qlranks-style", "Stats communities", "https://quake.bethesda.net", "Leaderboards hub."],
    ["settings", "Pro settings", "https://prosettings.net/games/quake-champions/", "Sensitivity databases."],
    ["champs", "Champion kits", "https://quake.bethesda.net", "Ability reference."],
    ["maps", "Map callouts", "https://quake.fandom.com/", "Map guides."],
    ["duel", "Duel guides", "https://liquipedia.net/quake", "Duel fundamentals."],
    ["tdm", "TDM tips", "https://quake.bethesda.net", "Team modes."],
    ["input", "Input lag tips", "https://quake.bethesda.net", "PC optimization."],
    ["crosshair", "Crosshairs", "https://quake.bethesda.net", "In-game options."],
    ["roster", "Balance patches", "https://quake.bethesda.net", "Patch notes."],
    ["discord", "Community Discords", "https://quake.bethesda.net", "Find matches."],
    ["classic", "Quake Live cousin", "https://store.steampowered.com/app/282440/Quake_Live/", "Related arena title."],
    ["qc-wiki", "Fandom wiki", "https://quake.fandom.com/", "Franchise wiki."],
    ["support", "Bethesda support", "https://help.bethesda.net/", "Account help."],
    ["legal", "ToS", "https://quake.bethesda.net", "Official clients only."],
    ["training", "Training modes", "https://quake.bethesda.net", "Practice ranges."],
  ]],
  ["pixreveal", "Pixreveal", [
    ["site", "Official site", "https://pixreveal.com", "Play in browser."],
    ["share", "Share links", "https://pixreveal.com", "Send to friends."],
    ["mobile", "Mobile browsers", "https://pixreveal.com", "Touch play notes."],
    ["feedback", "Feedback", "https://pixreveal.com", "Contact the creators."],
    ["similar", "Similar puzzles", "https://playbound.club", "More free browser puzzles."],
  ]],
  ["gamebuddies-io", "GameBuddies.io", [
    ["site", "Official site", "https://gamebuddies.io", "Host party rooms."],
    ["rooms", "Create room", "https://gamebuddies.io", "Share invite links."],
    ["party", "Party tips", "https://gamebuddies.io", "Best group sizes."],
    ["browser", "Browser support", "https://gamebuddies.io", "Modern Chromium recommended."],
    ["similar", "More party games", "https://playbound.club", "Other free multiplayer."],
  ]],
];

for (const [base, baseTitle, hubs] of finalF2p) {
  livePacks.push([
    `${base.replace(/-/g, "")}Mods`,
    base,
    baseTitle,
    "external",
    hubs.map(normalizeLiveRow),
  ]);
}

writeWave(
  "phase2ModsLive.ts",
  "phase2ModsLive",
  "Phase 2 live-service / classic / community hubs (~16–18 each; mostly external).",
  livePacks
);

console.log("done");
