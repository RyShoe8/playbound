// Builds batch-7.json: default controls for games that had none documented.
// Run: node scripts/control-batches/build-batch-7.mjs
import { writeFileSync } from "node:fs";

const M = "Movement", C = "Camera", Cb = "Combat", I = "Interaction", Inv = "Inventory", U = "Interface", Mp = "Multiplayer", V = "Vehicle", F = "Flight", B = "Building", O = "Other";
const kb = (rows, src, label, notes) => ({ scheme: "keyboard", supported: true, bindings: rows.map(([action, input, group]) => ({ action, input, group })), sourceUrl: src, sourceLabel: label, ...(notes ? { notes } : {}) });
const pad = (rows, src, label, notes) => ({ ...kb(rows, src, label, notes), scheme: "controller" });
const touch = (rows, src, label, notes) => ({ ...kb(rows, src, label, notes), scheme: "touch" });
const REBIND = "Every key is rebindable in the game's options.";

const g = {};

g["albion-online"] = { schemes: [kb([
  ["Move / attack / interact", "Left Mouse", M], ["Weapon abilities", "Q, W, E", Cb], ["Armor abilities", "R, D, F", Cb],
  ["Open inventory", "I", Inv], ["Open map", "M", U], ["Open chat", "Enter", U],
], "https://wiki.albiononline.com/", "Albion Online Wiki", "Albion is click-to-move; abilities are bound to the key row above and can be changed under Settings → Controls.")], notes: REBIND };

g["asphalt-legends"] = { schemes: [kb([
  ["Steer", "A / D or ← / →", V], ["Brake / reverse", "S or ↓", V], ["Nitro", "Space", V], ["Drift", "Left Shift", V],
], "https://www.gameloft.com/en/game/asphalt-9-legends", "Gameloft — Asphalt 9: Legends", "Windows keyboard layout; the game also supports a gamepad and touch/tilt steering on mobile.")] };

g["barotrauma"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Sprint", "Left Shift", M], ["Interact", "E", I], ["Use item / attack", "Left Mouse", Cb],
  ["Aim / grab", "Right Mouse", Cb], ["Health interface", "H", U], ["Crew list / command", "C", U], ["Chat", "Tab", Mp], ["Radio chat", "R", Mp],
], "https://barotraumagame.com/wiki/", "Barotrauma Wiki", REBIND)] };

g["baseball-stars-2"] = { schemes: [kb([
  ["Move / aim", "Arrow keys", M], ["Swing / pitch", "A", Cb], ["Throw / bunt", "S", Cb], ["Start / pause", "Enter", U],
], "https://www.snkplaymore.co.jp/", "SNK", "Typical keyboard mapping for the Neo Geo build; confirm and remap in the emulator's input menu.")] };

g["battlefield-1942-anthology"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Fire", "Left Mouse", Cb], ["Alt-fire / zoom", "Right Mouse", Cb], ["Jump", "Space", M], ["Crouch", "Left Ctrl", M],
  ["Enter / exit vehicle", "E", V], ["Change seat", "F1–F4", V], ["Reload", "R", Cb], ["Spawn / team menu", "Esc", U],
], "https://battlefield.fandom.com/wiki/Battlefield_1942", "Battlefield Wiki", REBIND)] };

g["castlevania-revamped"] = { schemes: [kb([
  ["Move", "Arrow keys", M], ["Jump", "Z", M], ["Whip", "X", Cb], ["Sub-weapon", "Up + X", Cb], ["Pause", "Enter", U],
], "https://www.castlevaniaadventure.com/", "Castlevania community", "Defaults for the Revamped build; open Options to remap keys or add a pad.")] };

g["citadel-remonstered"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Look", "Mouse", C], ["Fire weapon", "Left Mouse", Cb], ["Use / interact", "E", I], ["Inventory", "Tab", Inv],
  ["Jump", "Space", M], ["Crouch", "C", M], ["Map", "M", U],
], "https://www.nightdivestudios.com/games/system-shock-remastered", "Nightdive Studios", "Standard first-person defaults; bindings are editable under Options.")] };

g["counter-strike-2"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Jump", "Space", M], ["Crouch", "Left Ctrl", M], ["Walk", "Left Shift", M], ["Fire", "Left Mouse", Cb],
  ["Aim down sights / scope", "Right Mouse", Cb], ["Reload", "R", Cb], ["Use / defuse / pick up", "E", I], ["Buy menu", "B", U], ["Scoreboard", "Tab", U],
  ["Drop weapon", "G", Inv], ["Inspect weapon", "F", Inv], ["Team chat", "U", Mp], ["Voice", "K", Mp],
], "https://counterstrike.fandom.com/wiki/Counter-Strike_2", "Counter-Strike Wiki", REBIND)] };

g["counter-strike-source"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Jump", "Space", M], ["Crouch", "Left Ctrl", M], ["Walk", "Left Shift", M], ["Fire", "Left Mouse", Cb],
  ["Secondary fire / zoom", "Right Mouse", Cb], ["Reload", "R", Cb], ["Use / defuse", "E", I], ["Buy menu", "B", U], ["Scoreboard", "Tab", U],
], "https://developer.valvesoftware.com/wiki/Counter-Strike:_Source", "Valve Developer Community", REBIND)] };

g["dc-universe-online"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Jump / fly up", "Space", M], ["Light attack", "Left Mouse", Cb], ["Heavy attack", "Right Mouse", Cb],
  ["Block", "Q", Cb], ["Interact", "F", I], ["Powers", "1–4", Cb], ["Map", "M", U], ["Inventory", "I", Inv],
], "https://www.dcuniverseonline.com/", "DC Universe Online", "Defaults can vary by role and control style (Standard or Legacy); check Options → Controls.")] };

g["dont-starve-together"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Primary action / attack", "Left Mouse", Cb], ["Inspect / secondary action", "Right Mouse", I], ["Rotate camera", "Q / E", C],
  ["Map", "Tab", U], ["Crafting menu", "Left Alt (hold)", Inv], ["Open chat", "Enter", Mp], ["Pause (singleplayer)", "P", U],
], "https://dontstarve.wiki.gg/wiki/Controls", "Don't Starve Wiki", REBIND)] };

g["dota-2"] = { schemes: [kb([
  ["Move / attack-target", "Right Mouse", M], ["Select", "Left Mouse", I], ["Abilities", "Q, W, E, R, D, F", Cb], ["Items", "Z, X, C, V, B, N", Inv],
  ["Attack-move", "A + Click", Cb], ["Stop", "S", Cb], ["Hold position", "H", Cb], ["Shop", "F4", U], ["Scoreboard", "Tab", U], ["Center on hero", "F1", C],
], "https://dota2.fandom.com/wiki/Hotkeys", "Dota 2 Wiki — Hotkeys", "Default grid-less layout; Grid hotkeys are an optional preset.")] };

g["enlisted"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Sprint", "Left Shift", M], ["Fire", "Left Mouse", Cb], ["Aim", "Right Mouse", Cb], ["Reload", "R", Cb],
  ["Squad commands menu", "Hold Q", Cb], ["Switch soldier", "Tab / T", Cb], ["Use / enter vehicle", "F", V], ["Map", "M", U],
], "https://enlisted.net/en/", "Enlisted official site", "Defaults can differ between infantry and vehicle modes; open Options → Controls to review.")] };

g["everquest"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Autorun", "Num Lock / R", M], ["Jump", "Space", M], ["Target nearest", "F8", Cb], ["Attack on/off", "A", Cb],
  ["Hotbar", "1–0", Cb], ["Inventory", "I", Inv], ["Spellbook", "B", Inv], ["Map", "M", U],
], "https://everquest.allakhazam.com/", "EverQuest community", "Defaults depend on the control style chosen in Options → Keys.")] };

g["factorio"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Mine / shoot", "Left Mouse", I], ["Build / interact", "Right Mouse", B], ["Open inventory", "E", Inv],
  ["Pipette", "Q", B], ["Rotate item", "R", B], ["Pick up item", "F", I],
  ["Map", "M", U], ["Zoom", "Mouse Wheel", C], ["Technology", "T", U],
], "https://wiki.factorio.com/Key_bindings", "Factorio Wiki — Key bindings", REBIND)] };

g["freedoom"] = { schemes: [kb([
  ["Move", "W, A, S, D or Arrow keys", M], ["Fire", "Left Ctrl or Left Mouse", Cb], ["Use / open", "Space or E", I], ["Run", "Left Shift", M],
  ["Strafe", "Alt + ← / →", M], ["Automap", "Tab", U], ["Weapon select", "1–7", Cb], ["Menu", "Esc", U],
], "https://freedoom.github.io/", "Freedoom project", "Standard Doom controls; the source port sets the exact keys under Options → Setup → Key Bindings.")] };

g["gamebuddies-io"] = { schemes: [kb([
  ["Navigate lobbies", "Mouse", I], ["Select / confirm", "Left Mouse", I], ["Chat", "Enter", Mp],
], "https://gamebuddies.io/", "GameBuddies", "Each mini-game on GameBuddies ships its own controls; most use mouse and arrow keys.")] };

g["genshin-impact"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Jump", "Space", M], ["Sprint", "Left Shift / Right Mouse", M], ["Normal attack", "Left Mouse", Cb], ["Elemental skill", "E", Cb],
  ["Elemental burst", "Q", Cb], ["Interact / pick up", "F", I], ["Switch party member", "1–4", Cb], ["Open map", "M", U], ["Inventory", "B", Inv], ["Character menu", "C", U],
], "https://genshin-impact.fandom.com/wiki/Controls", "Genshin Impact Wiki — Controls", REBIND),
  pad([
  ["Move", "Left stick", M], ["Camera", "Right stick", C], ["Jump", "A / Cross", M], ["Normal attack", "X / Square", Cb], ["Elemental skill", "LT / L2", Cb],
  ["Elemental burst", "RT / R2", Cb], ["Switch party member", "D-pad", Cb], ["Interact", "Y / Triangle", I],
], "https://genshin-impact.fandom.com/wiki/Controls", "Genshin Impact Wiki — Controls")] };

g["guild-wars-2"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Jump", "Space", M], ["Dodge", "V", Cb], ["Weapon skills", "1–5", Cb], ["Heal / utility / elite", "6, 7, 8, 9, 0", Cb],
  ["Interact", "F", I], ["Swap weapons", "~ (tilde)", Cb], ["Inventory", "I", Inv], ["Hero panel", "H", U], ["World map", "M", U],
], "https://wiki.guildwars2.com/wiki/Key_bindings", "Guild Wars 2 Wiki — Key bindings", REBIND)] };

g["hawken-hawkening"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Boost / dodge", "Left Shift", M], ["Jump jets", "Space", M], ["Fire primary", "Left Mouse", Cb], ["Fire secondary", "Right Mouse", Cb],
  ["Reload", "R", Cb], ["Scoreboard", "Tab", U],
], "https://hawken.fandom.com/wiki/Hawken", "HAWKEN Wiki", REBIND)] };

g["holocure"] = { schemes: [kb([
  ["Move", "W, A, S, D or Arrow keys", M], ["Confirm", "Enter / Z", U], ["Back", "Esc / X", U], ["Special attack", "Space", Cb],
], "https://holocure.fandom.com/wiki/HoloCure_Wiki", "HoloCure Wiki", "Attacks fire automatically; movement and special are the only combat inputs. Menus are mouse-driven in mod builds.")] };

g["league-of-legends"] = { schemes: [kb([
  ["Move / attack", "Right Mouse", M], ["Select", "Left Mouse", I], ["Abilities", "Q, W, E, R", Cb], ["Summoner spells", "D, F", Cb], ["Items", "1–6", Inv],
  ["Attack-move", "A + Click", Cb], ["Stop", "S", Cb], ["Recall", "B", M], ["Shop", "P", U], ["Level up ability", "Ctrl + Q/W/E/R", Cb], ["Ping menu", "Alt + Click", Mp],
], "https://leagueoflegends.fandom.com/wiki/Hotkeys", "League of Legends Wiki — Hotkeys", REBIND)] };

g["necesse"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Attack / use", "Left Mouse", Cb], ["Interact / place", "Right Mouse", I], ["Inventory", "E", Inv], ["Sprint", "Left Shift", M],
  ["Quick-stack / loot", "Left Ctrl + Click", Inv], ["Hotbar", "1–0", Inv], ["Map", "M", U],
], "https://necessewiki.com/", "Necesse Wiki", REBIND)] };

g["once-human"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Sprint", "Left Shift", M], ["Jump", "Space", M], ["Fire", "Left Mouse", Cb], ["Aim", "Right Mouse", Cb], ["Reload", "R", Cb],
  ["Interact", "F", I], ["Backpack", "Tab", Inv], ["Map", "M", U], ["Weapon wheel", "Q", Inv],
], "https://once-human.fandom.com/wiki/Once_Human", "Once Human Wiki", REBIND)] };

g["openarena"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Jump", "Space", M], ["Crouch", "C", M], ["Fire", "Left Mouse", Cb], ["Next / previous weapon", "Mouse Wheel", Cb],
  ["Scoreboard", "Tab", U], ["Talk (all)", "T", Mp], ["Team talk", "Y", Mp], ["Console", "~ (tilde)", U],
], "https://openarena.ws/", "OpenArena", "Quake III-style defaults; change them in Setup → Controls.")] };

g["opents"] = { schemes: [kb([
  ["Pan map", "Arrow keys / Mouse edge", C], ["Select", "Left Mouse", I], ["Order / action", "Right Mouse", I], ["Zoom", "Mouse Wheel", C], ["Pause", "Space", U],
], "https://www.openttd.org/", "OpenTTD", "OpenTS is built on OpenTTD's interface; the in-game Help lists every shortcut.")] };

g["outrun"] = { schemes: [kb([
  ["Steer", "← / →", V], ["Accelerate", "Up Arrow or Z", V], ["Brake", "Down Arrow or X", V], ["Shift gear", "Space", V], ["Start / select", "Enter", U],
], "https://github.com/djyt/cannonball", "Cannonball project", "Default Cannonball bindings; remap in the config screen. A gamepad works automatically.")] };

g["palia"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Jump", "Space", M], ["Sprint", "Left Shift", M], ["Interact / use tool", "Left Mouse", I], ["Open inventory", "Tab / I", Inv],
  ["Hotbar", "1–0", Inv], ["Journal", "J", U], ["Map", "M", U], ["Emote wheel", "B", O],
], "https://palia.wiki.gg/", "Palia Wiki", REBIND)] };

g["pixreveal"] = { schemes: [kb([
  ["Select tile / pixel", "Left Mouse", I], ["Zoom", "Mouse Wheel", C], ["Pan", "Right Mouse drag", C],
], "https://pixreveal.com/", "PixReveal", "A mouse-driven puzzle game; no keyboard shortcuts are required.")] };

g["pokemon-blaze-online"] = { schemes: [kb([
  ["Move", "Arrow keys", M], ["Interact / confirm", "Z / Enter", I], ["Cancel / run", "X / Shift", M], ["Open menu", "Enter / Esc", U], ["Chat", "T", Mp],
], "https://pokemonblazeonline.com/", "Pokémon Blaze Online", "Browser-based; keys can be changed in the in-game settings panel.")] };

g["quake-champions"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Jump", "Space", M], ["Crouch / slide", "Left Ctrl", M], ["Fire", "Left Mouse", Cb], ["Alt-fire / zoom", "Right Mouse", Cb],
  ["Champion ability", "Q, E, F", Cb], ["Weapons", "1–9", Cb], ["Scoreboard", "Tab", U],
], "https://quake.fandom.com/wiki/Quake_Champions", "Quake Wiki", REBIND)] };

g["quake-ii-enhanced"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Jump", "Space", M], ["Crouch", "C", M], ["Fire", "Left Mouse", Cb], ["Next weapon", "Mouse Wheel", Cb], ["Use item", "Enter", Inv],
  ["Inventory", "Tab", Inv], ["Quick save / load", "F6 / F9", U],
], "https://quake.fandom.com/wiki/Quake_II", "Quake Wiki — Quake II", REBIND)] };

g["rainbow-six-siege"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Fire", "Left Mouse", Cb], ["Aim down sights", "Right Mouse", Cb], ["Reload", "R", Cb], ["Lean", "Q / E", M],
  ["Crouch / prone", "C / Z", M], ["Gadget", "G", Cb], ["Ping", "Middle Mouse", Mp], ["Drone view", "Left Ctrl", Cb],
], "https://rainbowsix.fandom.com/wiki/Tom_Clancy%27s_Rainbow_Six_Siege", "Rainbow Six Wiki", REBIND)] };

g["relic-hunters-zero-remix"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Aim", "Mouse", C], ["Fire", "Left Mouse", Cb], ["Reload", "R", Cb], ["Dash", "Space", M], ["Swap weapon", "Q", Cb], ["Interact", "E", I],
], "https://store.steampowered.com/app/588650/Relic_Hunters_Zero/", "Steam — Relic Hunters Zero", "Mouse-and-keyboard defaults; Relic Hunters Zero is also designed around twin-stick pad play.")] };

g["soccer-brawl"] = { schemes: [kb([
  ["Move", "Arrow keys or W, A, S, D", M], ["Pass / tackle", "Z", Cb], ["Shoot / slide", "X", Cb], ["Pause", "Enter", U],
], "https://www.snkplaymore.co.jp/", "SNK", "Typical keyboard mapping for the Neo Geo build; confirm and remap in the emulator's input menu.")] };

g["srb2kart"] = { schemes: [kb([
  ["Steer", "← / →", V], ["Accelerate", "A", V], ["Brake", "S", V], ["Drift", "Left Shift", V], ["Use item", "Left Ctrl", V],
  ["Look behind", "Space", V], ["Respawn", "R", V], ["Scoreboard", "Tab", U],
], "https://wiki.srb2.org/wiki/SRB2Kart", "SRB2 Wiki — SRB2Kart", REBIND)] };

g["shadow-warrior-classic-complete"] = { schemes: [kb([
  ["Move", "W, A, S, D or Arrow keys", M], ["Fire", "Left Ctrl or Left Mouse", Cb], ["Use / open", "Space or E", I], ["Run", "Left Shift", M],
  ["Jump", "A", M], ["Crouch", "Z", M], ["Weapons", "1–0", Cb], ["Automap", "Tab", U],
], "https://shadow-warrior.fandom.com/wiki/Shadow_Warrior_(1997)", "Shadow Warrior Wiki", REBIND)] };

g["star-trek-online"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Autorun", "R", M], ["Fire / use", "Left Mouse", Cb], ["Target nearest", "T", Cb], ["Hotbar abilities", "1–0", Cb],
  ["Interact", "F", I], ["Map", "M", U], ["Inventory", "I", Inv],
], "https://sto.fandom.com/wiki/Key_bindings", "Star Trek Online Wiki — Key bindings", "Space and ground use different default layouts; check Options → Keybinds.")] };

g["star-wars-galaxies"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Autorun", "Num Lock", M], ["Attack / interact", "Left Mouse", Cb], ["Target nearest", "Tab", Cb],
  ["Open inventory", "Ctrl + I", Inv], ["Chat", "Enter", Mp], ["Map", "Ctrl + M", U], ["Toolbar slots", "F1–F12", Cb],
], "https://swg-source.com/", "SWG community server", "Default layout of the community-run SWG servers; rebindable in Options.")] };

g["star-wars-galactic-battlegrounds-saga"] = { schemes: [kb([
  ["Select units", "Left Mouse", I], ["Move / attack", "Right Mouse", M], ["Scroll map", "Arrow keys / Mouse edge", C], ["Create group", "Ctrl + 1–9", I],
  ["Select group", "1–9", I], ["Pause", "F3", U], ["Stop", "S", Cb],
], "https://swgb.fandom.com/wiki/Star_Wars:_Galactic_Battlegrounds", "SWGB Wiki", "Age of Empires II-style RTS defaults.")] };

g["star-wars-the-old-republic"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Autorun", "Num Lock", M], ["Jump", "Space", M], ["Abilities", "1–0, Ctrl+1–0, Alt+1–0", Cb], ["Interact / loot", "F", I],
  ["Target nearest enemy", "Tab", Cb], ["Character sheet", "C", U], ["Inventory", "I", Inv], ["Map", "M", U], ["Quest log", "L", U],
], "https://swtor.fandom.com/wiki/Key_bindings", "SWTOR Wiki — Key bindings", REBIND)] };

g["starcraft"] = { schemes: [kb([
  ["Select", "Left Mouse", I], ["Move / attack / rally", "Right Mouse", M], ["Attack-move", "A + Click", Cb], ["Stop", "S", Cb], ["Hold position", "H", Cb],
  ["Patrol", "P", Cb], ["Control groups", "Ctrl + 1–0 / 1–0", I], ["Scroll map", "Arrow keys / Mouse edge", C], ["Chat", "Enter", Mp],
], "https://liquipedia.net/starcraft/Hotkeys", "Liquipedia — Hotkeys", "StarCraft: Remastered uses these defaults; building and unit hotkeys follow the on-screen letters.")] };

g["stardew-valley"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Use tool", "Left Mouse", I], ["Action / talk / open", "Right Mouse", I], ["Open inventory", "E / Esc", Inv], ["Journal", "F", U],
  ["Tools / items", "1–0, Mouse Wheel", Inv], ["Map", "M", U], ["Run toggle", "Left Shift", M], ["Chat", "T", Mp],
], "https://stardewvalleywiki.com/Controls", "Stardew Valley Wiki — Controls", REBIND),
  pad([
  ["Move", "Left stick", M], ["Use tool", "X", I], ["Action", "A", I], ["Menu", "Y", U], ["Cycle toolbar", "LB / RB", Inv], ["Journal", "Back/View", U], ["Run", "Left stick (hold B)", M],
], "https://stardewvalleywiki.com/Controls", "Stardew Valley Wiki — Controls", "Xbox layout shown; PlayStation equivalents are used automatically.")] };

g["super-sidekicks"] = { schemes: [kb([
  ["Move", "Arrow keys", M], ["Pass / tackle", "A", Cb], ["Shoot / slide", "S", Cb], ["Start / pause", "Enter", U],
], "https://www.snkplaymore.co.jp/", "SNK", "Typical keyboard mapping for the Neo Geo build; confirm and remap in the emulator's input menu.")] };

g["team-fortress-2"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Jump", "Space", M], ["Crouch", "Left Ctrl", M], ["Fire", "Left Mouse", Cb], ["Alt-fire", "Right Mouse", Cb], ["Reload", "R", Cb],
  ["Weapon slots", "1–3", Cb], ["Voice menu", "E / Z / X", Mp], ["Scoreboard", "Tab", U], ["Taunt", "G", O],
], "https://wiki.teamfortress.com/wiki/Controls", "Official TF2 Wiki — Controls", REBIND)] };

g["tmnt-rescue-palooza"] = { schemes: [kb([
  ["Move", "Arrow keys", M], ["Attack", "A", Cb], ["Jump", "S", M], ["Special", "D", Cb], ["Start / pause", "Enter", U],
], "https://openbor.fandom.com/wiki/OpenBOR", "OpenBOR Wiki", "OpenBOR defaults; each pad's buttons map to attack, jump and special. Remap in the Controls menu.")] };

g["daggerfall"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Look", "Mouse", C], ["Attack", "Left Mouse", Cb], ["Use / activate", "Right Mouse", I], ["Jump", "Space", M],
  ["Run toggle", "Left Shift", M], ["Inventory", "I", Inv], ["Automap", "Tab", U], ["Rest", "R", U], ["Spellbook", "B", Inv],
], "https://en.uesp.net/wiki/Daggerfall:Controls", "UESP — Daggerfall controls", "Defaults for Daggerfall Unity; every input is editable in Controls.")] };

g["tes-arena"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Attack", "Left Mouse", Cb], ["Activate", "Right Mouse", I], ["Run", "Left Shift", M], ["Inventory", "Tab", Inv], ["Map", "M", U],
], "https://en.uesp.net/wiki/Arena:Controls", "UESP — Arena controls", "Controls for the OpenTESArena port; change them in the options menu.")] };

g["lord-of-the-rings-online"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Autorun", "Num Lock", M], ["Jump", "Space", M], ["Skills", "1–0", Cb], ["Target nearest", "Tab", Cb], ["Use / loot", "R", I],
  ["Inventory", "B", Inv], ["Map", "M", U], ["Quest log", "J", U], ["Character", "C", U],
], "https://lotro-wiki.com/index.php/Key_bindings", "LOTRO-Wiki — Key bindings", REBIND)] };

g["valorant"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Walk", "Left Shift", M], ["Crouch", "Left Ctrl", M], ["Jump", "Space", M], ["Fire", "Left Mouse", Cb],
  ["Aim / alt-fire", "Right Mouse", Cb], ["Abilities", "C, Q, E, X", Cb], ["Reload", "R", Cb], ["Buy menu", "B", U], ["Spike plant / defuse", "4 / hold 4", I],
], "https://valorant.fandom.com/wiki/Controls", "Valorant Wiki — Controls", REBIND)] };

g["war-thunder"] = { schemes: [kb([
  ["Throttle up / down", "W / S", F], ["Roll / steer", "A / D", F], ["Fire primary", "Left Mouse", Cb], ["Fire secondary", "Space", Cb],
  ["Free look", "Hold Right Mouse", C], ["Landing gear", "G", F], ["Flaps", "F", F], ["Map", "M", U],
], "https://wiki.warthunder.com/Controls", "War Thunder Wiki — Controls", "Aircraft layout shown; ground and naval vehicles use WASD to drive. Review Controls → Presets.")] };

g["where-winds-meet"] = { schemes: [kb([
  ["Move", "W, A, S, D", M], ["Jump", "Space", M], ["Light attack", "Left Mouse", Cb], ["Heavy attack", "Right Mouse", Cb], ["Dodge", "Left Shift", Cb],
  ["Interact", "F", I], ["Martial arts", "1–4", Cb], ["Map", "M", U], ["Backpack", "B", Inv],
], "https://www.wherewindsmeet.com/", "Where Winds Meet", REBIND)] };

g["world-of-sea-battle"] = { schemes: [kb([
  ["Steer", "A / D", V], ["Speed up / down", "W / S", V], ["Fire cannons", "Left Mouse / Space", Cb], ["Aim", "Mouse", C], ["Camera zoom", "Mouse Wheel", C], ["Map", "M", U],
], "https://worldofseabattle.com/", "World of Sea Battle", "Default sailing controls; ship cameras and minimap are toggled from the HUD.")] };

g["x-men-arcade-remake"] = { schemes: [kb([
  ["Move", "Arrow keys", M], ["Attack", "A", Cb], ["Jump", "S", M], ["Mutant power", "D", Cb], ["Start / pause", "Enter", U],
], "https://openbor.fandom.com/wiki/OpenBOR", "OpenBOR Wiki", "OpenBOR defaults; a pad maps the same three buttons. Remap in the Controls menu.")] };

// Held back: defaults I could not state with confidence. Add them once someone has checked the game.
for (const slug of ["asphalt-legends","gamebuddies-io","castlevania-revamped","outrun","hawken-hawkening","enlisted","everquest","baseball-stars-2","super-sidekicks","soccer-brawl"]) delete g[slug];
const drop = (slug, action) => { for (const s of g[slug].schemes) s.bindings = s.bindings.filter((b) => b.action !== action); };
drop("albion-online", "Armor abilities"); drop("dont-starve-together", "Crafting menu"); drop("opents", "Pause");
g["holocure"].schemes[0].notes = "Attacks fire automatically, so movement and the special are the only combat inputs.";
// Everything outside this list is held back until someone has checked the defaults in-game.
const KEEP = new Set(["barotrauma","counter-strike-2","counter-strike-source","dont-starve-together","dota-2","factorio","freedoom","genshin-impact","guild-wars-2","holocure","league-of-legends","necesse","openarena","quake-champions","quake-ii-enhanced","rainbow-six-siege","shadow-warrior-classic-complete","star-wars-the-old-republic","starcraft","stardew-valley","team-fortress-2","daggerfall","lord-of-the-rings-online","valorant"]);
for (const slug of Object.keys(g)) if (!KEEP.has(slug)) delete g[slug];
writeFileSync(new URL("./batch-7.json", import.meta.url), JSON.stringify(g, null, 1));
console.log(Object.keys(g).length, "games");
