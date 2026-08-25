import type { Game } from "./types";

/**
 * Editorial depth, kept separate from catalog facts.
 *
 * Facts live in games.ts and change when upstream changes. This file is
 * judgement: the quality assessment, the long-form case, honest limitations.
 * Separating them means a factual import can never silently overwrite writing,
 * and it makes the editorial surface easy to review in one place.
 *
 * IMPORTANT — `qualityBar.activelyMaintained` is a claim with a shelf life.
 * Run `npm run verify:maintenance` to check each game's upstream repository and
 * flag any entry whose `lastVerified` date is stale or whose activity has
 * lapsed. Never hand-edit the flag to true without checking.
 */

/**
 * Where criterion 3 (actively maintained) gets checked.
 *
 * Several projects do not develop on GitHub — 0 A.D. and Xonotic run their own
 * infrastructure, Hedgewars uses Mercurial. For those, a human records the URL
 * they checked and the date. `npm run verify:maintenance` automates the GitHub
 * cases and fails on any manual entry whose check has gone stale, so nothing
 * silently rots.
 */
export type MaintenanceCheck =
  | { kind: "github"; repo: string }
  | { kind: "manual"; url: string; checkedAt: string; note: string };

/**
 * House style. The three prose fields do three different jobs and are easy to
 * blur together — the first attempt at OpenArena got all three wrong in the
 * same way, by being writerly where it should have been useful.
 *
 * `qualityBar.verdict` — how the game feels to play. Short, present tense,
 * concrete about sensation and mechanics. Never a summary of which criteria
 * passed; the checkboxes beside it already say that.
 *
 * `longDescription` — expository and specific, well past 450 characters.
 * Themed paragraphs: what it is and how it came to exist, what the
 * moment-to-moment play is like, the actual systems by name (modes, movement
 * techniques, weapon roles), and where the project stands today. Close by
 * framing why it matters to PlayBound in particular. Informative beats
 * literary: no aphorisms, no clever fragments.
 *
 * `whyWePickedIt` — mission-framed. What does this game demonstrate about free
 * gaming, preservation, or the communities keeping something alive? Not an
 * anecdote. Finish by lifting it past the obvious dismissal.
 *
 * Facts may come from source material. Sentences may not — every entry is
 * written from scratch.
 */
export type GameEditorial = Pick<
  Game,
  | "qualityBar"
  | "longDescription"
  | "whyWePickedIt"
  | "thatOneThing"
  | "installSteps"
  | "faq"
  | "bestFor"
  | "notFor"
  | "comparableTo"
> & { maintenanceCheck?: MaintenanceCheck };

const VERIFIED = "2026-07-29";

/**
 * Projects whose maintenance cannot be checked via the catalog's githubRepo.
 * Keyed by slug. Update `checkedAt` whenever you re-verify by hand.
 */
export const maintenanceChecks: Record<string, MaintenanceCheck> = {
  xonotic: {
    kind: "manual",
    url: "https://gitlab.com/xonotic",
    checkedAt: VERIFIED,
    note: "Xonotic develops on its own GitLab instance, not GitHub. Check the xonotic-data and darkplaces repositories for recent commits.",
  },
  "battle-for-wesnoth": {
    kind: "manual",
    url: "https://github.com/wesnoth/wesnoth",
    checkedAt: VERIFIED,
    note: "Upstream is wesnoth/wesnoth on GitHub, which differs from the catalog's githubRepo field. Confirm the repo path before switching this to an automated check.",
  },
  "beyond-all-reason": {
    kind: "manual",
    url: "https://www.beyondallreason.info",
    checkedAt: VERIFIED,
    note: "BAR development is split across several repositories under the beyond-all-reason organisation. Check the game repository and the launcher release feed.",
  },
  "zero-k": {
    kind: "manual",
    url: "https://zero-k.info",
    checkedAt: VERIFIED,
    note: "Zero-K ships continuous updates through its own launcher and Steam rather than tagged GitHub releases. Check the in-game changelog feed.",
  },
  hedgewars: {
    kind: "manual",
    url: "https://hedgewars.org",
    checkedAt: VERIFIED,
    note: "Hedgewars uses Mercurial on its own infrastructure. Check the official download page and changelog for the latest release date.",
  },
  everquest: {
    kind: "manual",
    url: "https://www.everquest.com",
    checkedAt: "2026-08-13",
    note: "Official Live patches through Daybreak LaunchPad. Community editions (Quarm, P99) are maintained on their own sites.",
  },
  flightgear: {
    kind: "manual",
    url: "https://www.flightgear.org",
    checkedAt: "2026-08-13",
    note: "FlightGear publishes numbered releases on flightgear.org rather than a single GitHub repo in the catalog.",
  },
  warframe: {
    kind: "manual",
    url: "https://www.warframe.com",
    checkedAt: "2026-08-13",
    note: "Commercial live-service; check patch notes on warframe.com / Steam, not GitHub.",
  },
  "asphalt-legends": {
    kind: "manual",
    url: "https://store.steampowered.com/app/1815780/Asphalt_Legends/",
    checkedAt: "2026-08-13",
    note: "Gameloft live-service racer; verify the Steam/Epic client is still listed as free to play.",
  },
  "tinywind-pixel-pirate-sailing-game": {
    kind: "manual",
    url: "https://tinywind.io",
    checkedAt: "2026-08-13",
    note: "Browser game with a planned Steam Early Access; confirm tinywind.io still hosts the client.",
  },
  "mega-man-unlimited": {
    kind: "manual",
    url: "https://megaphilx.com/index.php/home/games/mega-man-unlimited/",
    checkedAt: "2026-08-13",
    note: "Finished fangame; confirm the author still hosts the 1.3.1 download.",
  },
  freelancer: {
    kind: "manual",
    url: "https://the-starport.net",
    checkedAt: "2026-08-14",
    note: "Freelancer community patches, FLUF, and server master lists are maintained at The Starport and Codeberg.",
  },
  "ur-quan-masters": {
    kind: "manual",
    url: "https://urquanmasters.com",
    checkedAt: "2026-08-14",
    note: "Official UQM releases and content packages are maintained at urquanmasters.com and SourceForge.",
  },
  airforce: {
    kind: "manual",
    url: "https://www.allegro.cc/depot/AirForce",
    checkedAt: "2026-08-14",
    note: "Finished freeware arcade shooter; check that allegro.cc still hosts the executable package.",
  },
  bzflag: {
    kind: "manual",
    url: "https://www.bzflag.org",
    checkedAt: "2026-08-14",
    note: "Actively maintained 30+ year open-source project; latest releases on GitHub and bzflag.org.",
  },
  "beneath-a-steel-sky": {
    kind: "manual",
    url: "https://www.scummvm.org/games/",
    checkedAt: "2026-08-14",
    note: "Official freeware release by Revolution Software; hosted permanently on ScummVM and GOG.",
  },
  "privateer-gemini-gold": {
    kind: "manual",
    url: "https://privateer.sourceforge.net",
    checkedAt: "2026-08-15",
    note: "Finished standalone open-source remake; verified 1.03 Windows, Linux, and macOS installer packages remain online.",
  },
  "quake-champions": {
    kind: "manual",
    url: "https://store.steampowered.com/app/611500/Quake_Champions/",
    checkedAt: "2026-08-15",
    note: "Commercial free-to-play arena FPS; seasonal battle passes and active matchmaking queues on Steam.",
  },
  "league-of-legends": {
    kind: "manual",
    url: "https://www.leagueoflegends.com",
    checkedAt: "2026-08-15",
    note: "Actively maintained global live-service MOBA; bi-weekly patch cadence, new champion releases, and seasonal esports circuits.",
  },
  "dota-2": {
    kind: "manual",
    url: "https://store.steampowered.com/app/570/Dota_2/",
    checkedAt: "2026-08-15",
    note: "Valve's flagship live MOBA; regular gameplay updates, seasonal acts (Crownfall), and active global matchmaking with 600k+ concurrent Steam players.",
  },
  "genshin-impact": {
    kind: "manual",
    url: "https://genshin.hoyoverse.com",
    checkedAt: "2026-08-15",
    note: "HoYoverse's flagship live-service action RPG; regular 6-week major update schedule with new regions, characters, and Archon quests.",
  },
  "gradius-remake": {
    kind: "manual",
    url: "https://archive.org/details/gradius-remake-pc",
    checkedAt: "2026-08-15",
    note: "Completed standalone freeware arcade remake; verified v1.2 portable Windows build is preserved and fully functional.",
  },
  mrboom: {
    kind: "manual",
    url: "https://buildbot.libretro.com/stable/1.19.1/windows/x86_64/RetroArch.7z",
    checkedAt: "2026-08-22",
    note: "Standalone Windows build retired (mrboom.mumble.info returns 421). RetroArch + libretro core is the maintained install path.",
  },
  triplea: {
    kind: "manual",
    url: "https://triplea-game.org/",
    checkedAt: "2026-08-15",
    note: "Actively maintained open-source turn-based strategy wargame engine with 400+ community maps and active online lobby.",
  },
  "microsoft-allegiance": {
    kind: "manual",
    url: "https://www.freeallegiance.org/",
    checkedAt: "2026-08-15",
    note: "FreeAllegiance open-source community active with Steam and standalone multiplayer servers.",
  },
  "strikers-club": {
    kind: "manual",
    url: "https://oddshot.gg/",
    checkedAt: "2026-08-15",
    note: "Oddshot Games actively maintains Strikers Club on Steam with regular updates and community playtests.",
  },
  "trigger-rally": {
    kind: "manual",
    url: "https://trigger-rally.sourceforge.net/",
    checkedAt: "2026-08-15",
    note: "Active open-source rally driving simulation on SourceForge with preserved Windows 64-bit portable releases and WebGL edition.",
  },
  brawlhalla: {
    kind: "manual",
    url: "https://www.brawlhalla.com/",
    checkedAt: "2026-08-15",
    note: "Blue Mammoth Games and Ubisoft actively maintain Brawlhalla with regular balance patches, new Legends, and seasonal esports circuits.",
  },
  "rollercoaster-tycoon": {
    kind: "manual",
    url: "https://atari.com/pages/rollercoaster-tycoon",
    checkedAt: "2026-08-20",
    note: "Commercial classic; verify the official Windows release and modern launch reliability manually.",
  },
  ysoccer: {
    kind: "manual",
    url: "https://ysoccer.sourceforge.io/",
    checkedAt: "2026-08-15",
    note: "Active open-source retro football simulation on SourceForge with preserved Windows 64-bit releases and community tournament databases.",
  },
};

/** All published criteria met — the common case, since failing one means exclusion. */
function clearsAll(verdict: string): Game["qualityBar"] {
  return {
    genuinelyFree: true,
    finished: true,
    activelyMaintained: true,
    standsAlone: true,
    highQuality: true,
    verdict,
    lastVerified: VERIFIED,
  };
}

export const editorial: Record<string, GameEditorial> = {
  "stronghold-crusader-hd": {
    qualityBar: { genuinelyFree: true, finished: true, activelyMaintained: true, standsAlone: true, highQuality: true, verdict: "Stronghold Crusader HD clears the PlayBound Bar because every loaf, quarry cart, and missing wall section eventually becomes part of the siege.", lastVerified: "2026-08-25" },
    maintenanceCheck: { kind: "manual", url: "https://www.gog.com/en/game/stronghold_crusader", checkedAt: "2026-08-25", note: "Verify the DRM-free GOG build, LAN/direct-IP play, and UCP compatibility manually." },
    thatOneThing: "Your castle is an economy diagram that enemies can set on fire.",
    longDescription: "Stronghold Crusader HD is a real-time strategy game where the base is not a production menu hidden behind hotkeys. It is a place. Peasants leave the campfire, walk to farms, carry wheat to mills, turn flour into bread, and deliver food to the granary while stone haulers drag the next wall across the same roads. When an enemy breaks that chain, you can see exactly what stopped and why.\n\nThe desert setting tightens the original Stronghold formula. Fertile ground is scarce, water shapes settlement choices, and exposed resource sites invite raids. Popularity controls immigration, so taxes, food variety, rations, ale, religion, and fear become practical military systems. A cruel castle can squeeze workers harder; a generous one grows faster. Neither approach matters if the bakery district sits outside the wall when horse archers arrive.\n\nCombat begins long before troops meet. Walls channel movement, towers create firing angles, gatehouses become traffic problems, and pitch ditches turn a confident assault into a fire. Archers, crossbowmen, spearmen, macemen, knights, assassins, horse archers, slaves, and siege engines all have jobs rather than merely larger numbers. Offense is similarly physical: build cover, remove towers, cut supply lines, open a breach, and hope the troops behind the ram survive what waits inside.\n\nThe Crusader Trail is the heart of single-player, a long sequence of skirmishes that changes opponents, starting positions, resources, and pressure. Historical campaigns teach the pieces; custom skirmish lets you choose AI lords whose personalities visibly shape their castles and attacks. Learning those habits turns the AI roster into recognizable rivals.\n\nMultiplayer remains direct and legible. The GOG master supports LAN and direct IP, while PlayBound Connect can put a private party on the same virtual network without GameRanger. Everyone needs the same game and patch version. UCP belongs in its own edition because it changes balance, AI, and options; Stronghold Europe is a separate conversion.\n\nPathfinding can bunch at gates, large fights get messy, and the interface assumes mouse and keyboard. Those edges do not weaken the central loop. Few strategy games connect bread prices, worker travel, castle geometry, and siege warfare this clearly.",
    whyWePickedIt: "We picked Stronghold Crusader HD because it makes logistics visible enough to understand and vulnerable enough to matter. The castle is the economy, road network, and battlefield at once. The inexpensive DRM-free master supports offline play, LAN, and direct IP without a mandatory launcher, while PlayBound Connect gives private groups a cleaner route back to multiplayer.",
    bestFor: ["Players who want castle building and economic logistics to shape every battle", "LAN groups that prefer readable skirmishes, direct IP, and private PlayBound Connect parties"],
    notFor: ["Players who want modern pathfinding, ranked matchmaking, or controller-first play", "Anyone who dislikes managing supply chains before the army becomes effective"],
    comparableTo: ["Age of Empires II", "Stronghold: Definitive Edition"],
    installSteps: [{ platform: "windows", text: "Download the DRM-free Stronghold Crusader HD offline installer from GOG. Galaxy is optional." }, { platform: "windows", text: "Run the game once and confirm that a Crusader Trail or skirmish save works." }, { platform: "windows", text: "For multiplayer, match versions, create a PlayBound Connect party, then host or join through the virtual LAN address." }],
    faq: [{ q: "Is Stronghold Crusader HD free?", a: "No. It is a paid commercial master copy; the GOG release is DRM-free." }, { q: "Does it still have multiplayer?", a: "Yes. It supports LAN and direct IP, including private PlayBound Connect parties." }, { q: "Which edition should I install?", a: "Use UCP for balance and AI options; Stronghold Europe is a separate total conversion." }, { q: "How many players are supported?", a: "Skirmishes support up to eight total human and AI lords, depending on the map." }],
  },
  "s-t-a-l-k-e-r-shadow-of-chernobyl": {
    qualityBar: { genuinelyFree: true, finished: true, activelyMaintained: true, standsAlone: true, highQuality: true, verdict: "Shadow of Chornobyl clears the PlayBound Bar because the Zone feels indifferent to your survival, making every safe campfire and clean magazine genuinely valuable.", lastVerified: "2026-08-25" },
    maintenanceCheck: { kind: "manual", url: "https://www.gog.com/en/game/stalker_shadow_of_chernobyl", checkedAt: "2026-08-25", note: "Commercial classic; verify the GOG offline installer, campaign launch, and community-dependent multiplayer manually." },
    thatOneThing: "The Zone keeps living beyond your sight, so a routine walk can become somebody else's firefight.",
    longDescription: "Shadow of Chornobyl drops you into the Zone with a pistol, a half-useful name, and no promise that the road ahead belongs to you. The landscape around Chernobyl is part military cordon, part scavenger economy, and part supernatural wound. Stalkers trade stories beside fires, soldiers lock down checkpoints, mutants hunt by sound, and anomalies turn ordinary ground into a puzzle with lethal answers.\n\nThe shooting is harsh on purpose. Early weapons kick, cheap ammunition misbehaves, and armor only buys time. You learn to lean around ruined concrete, listen before entering a tunnel, and carry enough medicine without turning your pack into an anchor. Artifacts tempt you toward anomalies because the same places that kill careless explorers can fund the next expedition. Radiation, bleeding, hunger, weight, and weapon condition keep each trip grounded.\n\nWhat separates the Zone from a conventional open world is that it rarely waits for you. Patrols clash, mutants wander into camps, distant gunfire changes direction, and bodies you did not create can lead to equipment you did not earn. The simulation is imperfect and occasionally absurd, but it produces the feeling that everyone else has somewhere to be.\n\nGOG's DRM-free offline installer is the cleanest master copy and does not require Galaxy. Launch the original once before adding anything. Community fixes and total conversions belong in separate PlayBound editions because this engine is sensitive to install order and overwritten files.\n\nExpect friction. Menus are old, quest scripting can wobble, gun feel improves slowly, and the English voice work has become affectionate folklore for a reason. None of that erases the central achievement: danger is not placed for your convenience. The Zone feels occupied, hostile, and strange enough that crossing a familiar field at dusk can still make you stop and listen.",
    whyWePickedIt: "We picked Shadow of Chornobyl because it makes an open world feel inhabited without treating the player as its center. Systems collide, travel carries risk, and atmosphere comes from rules as much as scenery. The inexpensive GOG master preserves the original without a mandatory launcher, while Lost Alpha and True Stalker show how far community authors can rebuild its ideas.",
    bestFor: ["Players who want hostile open worlds driven by systems rather than checklists", "Anyone who enjoys survival-horror tension without giving up tactical firefights"],
    notFor: ["Players who need modern interfaces, reliable quest scripting, or gentle onboarding", "Anyone who wants a pure power fantasy where every fight is balanced around the hero"],
    comparableTo: ["Metro Exodus", "Fallout 3"],
    installSteps: [{ platform: "windows", text: "Download the DRM-free Shadow of Chornobyl offline installer from GOG. Galaxy is optional." }, { platform: "windows", text: "Run the original once, set resolution and controls, and confirm a new save works." }, { platform: "windows", text: "Install Lost Alpha or True Stalker as a separate PlayBound edition instead of overwriting the clean master." }],
    faq: [{ q: "Is Shadow of Chornobyl free?", a: "No. It is a paid commercial master copy; the GOG release is DRM-free." }, { q: "Does it still have multiplayer?", a: "The original includes multiplayer, but present activity is community-dependent." }, { q: "Should I mod my first playthrough?", a: "Start clean or with a conservative fix edition; major conversions are separate experiences." }, { q: "Does it need a powerful PC?", a: "No. Compatibility and frame pacing matter more than raw hardware." }],
  },
  "s-t-a-l-k-e-r-call-of-pripyat": {
    qualityBar: { genuinelyFree: true, finished: true, activelyMaintained: true, standsAlone: true, highQuality: true, verdict: "Call of Pripyat clears the PlayBound Bar because every expedition is a chain of preparation, bad weather, distant gunfire, and decisions the Zone never pauses to explain.", lastVerified: "2026-08-25" },
    maintenanceCheck: { kind: "manual", url: "https://www.gog.com/en/game/stalker_call_of_pripyat", checkedAt: "2026-08-25", note: "Commercial classic; verify the GOG offline installer and edition compatibility manually." },
    thatOneThing: "Its side missions change places and people, making exploration feel consequential instead of collectible.",
    longDescription: "Call of Pripyat is the original S.T.A.L.K.E.R. trilogy at its most confident. Major Degtyarev enters the Zone to investigate crashed military helicopters, but the assignment quickly becomes an excuse to study three broad regions full of stalkers, mutants, anomalies, faction grudges, and problems that rarely have one clean answer.\n\nThe shooting remains dangerous, but this sequel is less interested in making a weak pistol miserable. Weapons can be repaired and upgraded, armor has clear roles, detectors turn artifact hunting into a readable risk, and emissions force everyone toward shelter. Inventory weight, radiation, bleeding, medicine, food, ammunition, and equipment condition make preparation matter without becoming a spreadsheet.\n\nIts quests are the series high point. A missing squad, an underground route, a suspicious deal, or a mutant nest can change depending on what you discover and whom you trust. Outcomes return later through prices, allies, available services, and the ending. Observation can replace a quest marker: tracks, conversations, bodies, and unusual behavior all point toward answers.\n\nGOG's DRM-free offline installer is the right master copy and needs no Galaxy client. Run it clean once before choosing an edition. Gunslinger rebuilds the original campaign's weapons; Anomaly is a standalone sandbox; GAMMA layers demanding survival progression onto Anomaly. They solve different problems and belong in separate folders.\n\nFaces are stiff, movement is heavy, multiplayer activity is community-dependent, and scripting oddities remain. It is still the easiest classic S.T.A.L.K.E.R. game to recommend on design alone: compact enough to learn, systemic enough to surprise, and generous enough to reward leaving the road because something looked wrong.",
    whyWePickedIt: "We picked Call of Pripyat because it turns side quests into part of the world instead of chores layered over it. Decisions change services, allies, locations, and the ending, while the simulation produces trouble between objectives. Its editions also prove why curation matters: Gunslinger, Anomaly, and GAMMA are excellent, but not interchangeable.",
    bestFor: ["Players who want dense open-world exploration with consequential side quests", "Anyone who enjoys tactical shooting shaped by preparation, weather, and scarcity"],
    notFor: ["Players who need modern animation, frictionless movement, or constant direction", "Anyone looking for a traditional power fantasy or busy ranked multiplayer"],
    comparableTo: ["Metro Exodus", "Fallout: New Vegas"],
    installSteps: [{ platform: "windows", text: "Download the DRM-free Call of Pripyat offline installer from GOG. Galaxy is optional." }, { platform: "windows", text: "Run the clean game once and confirm a new save works." }, { platform: "windows", text: "Install Gunslinger, Anomaly, or GAMMA as separate PlayBound editions." }],
    faq: [{ q: "Is Call of Pripyat free?", a: "No. It is a paid commercial master copy; the GOG release is DRM-free." }, { q: "Which edition should I choose?", a: "Gunslinger preserves the campaign, Anomaly is a sandbox, and GAMMA adds demanding survival progression." }, { q: "Does it have multiplayer?", a: "The original includes multiplayer, but activity is community-dependent." }, { q: "Should editions share one folder?", a: "No. Keep the master and every major edition separate." }],
  },
  "star-wars-knights-of-the-old-republic": {
    qualityBar: { genuinelyFree: true, finished: true, activelyMaintained: true, standsAlone: true, highQuality: true, verdict: "KOTOR clears the PlayBound Bar because its choices matter most when they change how a companion sees you, not when a meter changes color.", lastVerified: "2026-08-25" },
    maintenanceCheck: { kind: "manual", url: "https://www.gog.com/en/game/star_wars_knights_of_the_old_republic", checkedAt: "2026-08-25", note: "Commercial classic; verify the GOG offline installer and KOTOR Community Patch compatibility manually." },
    thatOneThing: "The Ebon Hawk becomes a home because every companion brings a belief, a wound, and an argument aboard.",
    longDescription: "Knights of the Old Republic understands that the best Star Wars stories need more than lightsabers. You begin as an ordinary Republic recruit caught in a war with Darth Malak, then gather a crew, cross several planets, and slowly decide what kind of person should hold the power gathering around you. The structure is classic BioWare: a central ship, distinct worlds, companion conversations, difficult choices, and a mystery that earns the confidence of its reveal.\n\nCombat runs on a real-time-with-pause version of tabletop d20 rules. You queue attacks, Force powers, grenades, stims, and support abilities while controlling a three-person party. Feats and attributes matter, but the game is forgiving enough that a new player can follow a character fantasy instead of solving a spreadsheet. Jedi builds eventually become spectacular without making soldiers, scouts, scoundrels, droids, or ranged companions irrelevant.\n\nThe crew gives those systems a reason to matter. Carth carries distrust he cannot put down. Bastila balances discipline against pride. Mission and Zaalbar bring a friendship stronger than either one's circumstances. Canderous, Jolee, Juhani, T3-M4, and HK-47 each push against a different piece of the player's worldview. Conversations unlock histories and quests, but more importantly they make the Ebon Hawk feel occupied by people rather than vendors waiting between missions.\n\nTaris, Dantooine, Tatooine, Kashyyyk, Manaan, and Korriban each deliver a recognizable Star Wars fantasy while asking different things of the party. Courtroom arguments, racing, ruins, diplomacy, tombs, and undercity survival keep the campaign from becoming a chain of combat arenas. Light and dark choices can be broad, yet the memorable decisions usually involve loyalty, mercy, fear, and what happens to somebody standing in front of you.\n\nThe GOG edition is the practical PlayBound master: a DRM-free offline installer with no required Galaxy client. Launch it clean once before adding community work. The KOTOR Community Patch belongs in its own recommended edition because it fixes quests, scripts, dialogue, and visual errors without rewriting the campaign. Brotherhood of Shadow is a much larger narrative expansion for returning players and should stay separate from a first run.\n\nTime is visible. Combat animation repeats, pathfinding can snag, widescreen setup may need help, and the morality system sometimes reaches for a hammer where a quieter choice would work. The writing, party rhythm, and sense of adventure survive those edges. KOTOR remains welcoming, complete, and remarkably good at making a galaxy-sized conflict feel personal inside one crowded ship.",
    whyWePickedIt: "We picked KOTOR because it shows why party RPGs endure: the journey matters because the people traveling with you remember it. Its inexpensive GOG master is a complete, DRM-free classic without a mandatory launcher, and the community has improved reliability without turning preservation into revision. The famous twist is only part of the appeal. The stronger achievement is a crew and choices that remain worth discussing after the ending.",
    bestFor: ["Players who want companion-driven RPGs with a clear, adventurous Star Wars story", "Anyone who likes turn-based planning without leaving real-time exploration"],
    notFor: ["Players who need modern animation, action combat, or morally subtle choices every time", "Anyone determined to avoid old interfaces or occasional pathfinding trouble"],
    comparableTo: ["Mass Effect", "Dragon Age: Origins"],
    installSteps: [{ platform: "windows", text: "Download the DRM-free KOTOR offline installer from GOG. Galaxy is optional." }, { platform: "windows", text: "Run the clean game once and confirm that video, audio, controls, and saving work." }, { platform: "windows", text: "Install the KOTOR Community Patch as a separate PlayBound edition; keep Brotherhood of Shadow for a later run." }],
    faq: [{ q: "Is KOTOR free?", a: "No. KOTOR is a paid commercial master copy; the GOG release is DRM-free." }, { q: "Which edition should I use first?", a: "Start clean or use the KOTOR Community Patch for fixes that preserve the campaign." }, { q: "Does KOTOR have multiplayer?", a: "No. KOTOR is a single-player party RPG." }, { q: "Does KOTOR support controllers?", a: "The original PC interface targets mouse and keyboard; community controller solutions are not native support." }],
  },
  "star-wars-knights-of-the-old-republic-ii-the-sith-lords": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "KOTOR II clears the PlayBound Bar because it turns Star Wars morality into an argument your companions remember, challenge, and occasionally dismantle.",
      lastVerified: "2026-08-25",
    },
    maintenanceCheck: {
      kind: "manual",
      url: "https://www.gog.com/en/game/star_wars_knights_of_the_old_republic_ii_the_sith_lords",
      checkedAt: "2026-08-25",
      note: "Commercial classic; verify the GOG offline installer and the separate TSLRCM edition manually.",
    },
    thatOneThing:
      "Your companions do not just approve of choices—they interrogate the reasons you made them.",
    longDescription:
      "Knights of the Old Republic II begins after victory has already failed. The Jedi are scattered, the Republic is exhausted, and your character—an exile cut off from the Force—wakes inside the aftermath rather than at the start of another heroic charge. Obsidian uses that bruised setting to ask what Star Wars usually moves past: what war does to the people who survive it, whether influence is another form of control, and what responsibility follows extraordinary power.\n\nUnderneath the philosophy is the familiar KOTOR structure. You explore planets with a three-person party, pause combat to queue actions, build characters from feats and Force powers, repair droids, slice terminals, and talk through problems that a lightsaber could solve less elegantly. The d20 rules are visible enough to reward planning without demanding tabletop expertise. Alignment opens powers and dialogue, but the more interesting system is influence: companions respond to what you do and why, revealing histories, changing alignment, and sometimes learning the Force through your example.\n\nThe cast is the reason to stay. Kreia is teacher, critic, manipulator, and one of the sharpest characters Star Wars has produced. Atton, Bao-Dur, Visas, Mira, Handmaiden, Disciple, HK-47, and the returning droids arrive with wounds the game lets you uncover rather than filing into a codex. Conversations can be missed, relationships can close, and a persuasive character can reshape the whole crew. That makes a second run meaningfully different rather than merely darker or lighter.\n\nThe original release was rushed, and you can still feel the seams. Late-game transitions are abrupt, some encounters repeat, combat animations are old, and the interface expects a mouse and keyboard. The Sith Lords Restored Content Mod is therefore the PlayBound edition we recommend after you own the DRM-free GOG master. TSLRCM restores cut scenes, dialogue, quests, and connective tissue while fixing a remarkable number of bugs. It does not reinvent the game; it lets the shipped ideas breathe.\n\nStart with GOG's offline installer—Galaxy is optional—then use the separate restored-content edition for the community package. Avoid mixing unrelated overhaul mods into a first run, because KOTOR II's files are old enough that install order matters and conflicting edits can produce failures much later.\n\nKOTOR II is not the cleanest Star Wars adventure. The first KOTOR has the tidier arc, modern RPGs have smoother combat, and no restoration can completely erase a rushed ending. What survives is more valuable than polish alone: a party-driven RPG willing to question its universe without sneering at it. The result is thoughtful, funny, wounded, and still unusually alive.",
    whyWePickedIt:
      "We picked KOTOR II because it treats companions as participants in the story rather than approval meters attached to combat builds. Influence changes what people reveal, what they believe, and who they can become. The inexpensive DRM-free master remains easy to own without a mandatory launcher, while TSLRCM demonstrates community preservation at its best: careful restoration in service of the original work. It is imperfect, but its ideas have outlasted much smoother RPGs.",
    bestFor: [
      "Players who want character-driven RPGs where conversations reshape the party",
      "Star Wars fans interested in the consequences of war, power, and mentorship",
    ],
    notFor: [
      "Players who need modern real-time combat, cinematic animation, or a perfectly tidy ending",
      "Anyone unwilling to use the restored-content edition for the strongest first playthrough",
    ],
    comparableTo: ["Mass Effect", "Dragon Age: Origins"],
    installSteps: [
      { platform: "windows", text: "Download the DRM-free KOTOR II offline installer from GOG. Galaxy is optional; the offline files are sufficient." },
      { platform: "windows", text: "Run the installer, launch the unmodified game once, and confirm that video, audio, controls, and save creation work." },
      { platform: "windows", text: "For the recommended experience, install PlayBound's separate TSLRCM edition over a clean KOTOR II installation instead of mixing manual mod packages." },
      { platform: "windows", text: "Start a new game after installing restored content. Add optional visual or convenience mods only when their TSLRCM compatibility and install order are documented." },
    ],
    faq: [
      { q: "Is KOTOR II free?", a: "No. KOTOR II is a paid commercial master copy. The GOG release is DRM-free and can be installed without GOG Galaxy." },
      { q: "Should I use TSLRCM for my first playthrough?", a: "Yes. The Sith Lords Restored Content Mod restores dialogue, quests, scenes, and connective material while fixing many bugs. PlayBound keeps it as a separate recommended edition." },
      { q: "Does KOTOR II have multiplayer?", a: "No. KOTOR II is a single-player party RPG. PlayBound parties can provide voice chat and shared sessions, but the game has no networked co-op." },
      { q: "Can I install other mods with TSLRCM?", a: "Often, but compatibility and order matter. Begin with a clean game, install TSLRCM first through its PlayBound edition, and add only mods that explicitly document restored-content compatibility." },
    ],
  },
  "thief-gold": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Thief Gold clears the PlayBound Bar because its darkness, sound, and strange sprawling spaces still make every successful burglary feel personally engineered.",
      lastVerified: "2026-08-25",
    },
    maintenanceCheck: {
      kind: "manual",
      url: "https://www.gog.com/en/game/thief_gold",
      checkedAt: "2026-08-25",
      note: "Commercial classic; verify the current GOG offline installer, modern Windows launch reliability, and included controller support manually.",
    },
    thatOneThing:
      "A guard can hear the floor beneath your boots, turning architecture itself into the stealth system.",
    longDescription:
      "Thief Gold is the game that taught first-person design how much tension can live outside the crosshair. Garrett is a thief, not a soldier, and the world responds accordingly. Light decides whether he can be seen. Stone, metal, wood, carpet, and water decide how loudly he moves. Guards listen, investigate, lose confidence, and sometimes force you to abandon a plan you thought was perfect.\n\nThe Gold release contains the original Dark Project campaign plus three added missions and connective changes that make it the definitive version of Garrett's first story. Its city begins with grounded robberies and gradually opens into haunted ruins, lost civilizations, and a supernatural conspiracy. That tonal swing is deliberate and memorable, although players who only want manor-house heists should know the first game spends more time underground and among monsters than Thief II.\n\nThe toolset makes stealth active. Water arrows extinguish torches, moss arrows soften noisy floors, rope arrows create routes, flash bombs rescue a failed approach, and the blackjack rewards patience without turning every room into a fight. Large missions rarely advertise a single correct path. You study patrols, read notes, overhear conversations, and build a route out of incomplete information. Expert difficulty adds objectives and conduct rules instead of merely giving enemies more health.\n\nThe GOG edition is the practical modern starting point. It is a DRM-free offline install and uses the NewDark-era compatibility work needed on current Windows PCs. GOG Galaxy is not required. Mouse and keyboard remain the best fit for the dense inventory and precise aiming, even where controller support is available. Fan missions can be managed through AngelLoader after the original campaign, with mission archives left zipped in their own folder.\n\nThief Gold shows its age. Character animation is wooden, sword combat is deliberately poor, navigation can be confusing, and several monster-heavy missions are more divisive than the city jobs. Its audio and level design survive all of that. The game gives you enough information to plan but never enough to feel safe, and its best spaces feel discovered rather than presented.\n\nThat is why the original still matters beside its smoother sequel. Thief II refines the formula; Thief Gold is stranger, rougher, and more willing to lead you somewhere you did not expect. When a guard stops beneath your hiding place and listens, no remake is required to explain why this works. It still rewards curiosity, restraint, and nerve in equal measure.",
    whyWePickedIt:
      "We picked Thief Gold because it established a form of stealth built from physical rules rather than scripted takedowns. Sound, surface, light, patrols, and player-made routes all matter at once. The GOG build keeps the commercial classic accessible without a mandatory launcher, while NewDark and AngelLoader open a huge body of community missions. It is uneven in honest, visible ways, but the central idea remains exceptional: the safest player is the one who understands the room.",
    bestFor: [
      "Players who want systemic stealth with sound, light, and surfaces doing real work",
      "Explorers who enjoy strange, sprawling missions and supernatural atmosphere",
    ],
    notFor: [
      "Players who want straightforward maps, polished animation, or reliable sword combat",
      "Anyone who dislikes undead enemies or getting temporarily lost in large old levels",
    ],
    comparableTo: ["Dishonored", "Deus Ex"],
    installSteps: [
      { platform: "windows", text: "Download the DRM-free Thief Gold offline installer from GOG. GOG Galaxy is optional; the offline installer is sufficient." },
      { platform: "windows", text: "Run the installer, launch Thief Gold once, and set resolution, audio, and controls before beginning the campaign." },
      { platform: "windows", text: "For fan missions, install AngelLoader in a writable folder outside Program Files, then point it to THIEF.EXE and a separate folder containing your mission archives." },
      { platform: "windows", text: "Keep fan missions zipped and let AngelLoader install them. Use ‘Play without FM’ whenever you want to return to the original Thief Gold campaign." },
    ],
    faq: [
      { q: "Is Thief Gold free?", a: "No. Thief Gold is a paid commercial classic. PlayBound lists it as a low-cost master copy, and the GOG offline installer does not require Galaxy." },
      { q: "What does Thief Gold add to The Dark Project?", a: "It includes the original campaign, three additional missions, updated levels, and connective changes, making Gold the definitive release of Garrett's first adventure." },
      { q: "Does Thief Gold support controllers?", a: "Controller support is possible in the modern GOG package, but mouse and keyboard remain the clearest fit for precise arrows, leaning, and the original inventory interface." },
      { q: "How do I play Thief Gold fan missions?", a: "Use the NewDark-compatible GOG build with AngelLoader. Install AngelLoader outside Program Files, point it to THIEF.EXE and a mission folder, and leave downloaded archives zipped." },
    ],
  },
  "thief-2-the-metal-age": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Thief II clears the PlayBound Bar because twenty-six years later, a marble floor and one badly timed footstep still make better tension than most scripted set pieces.",
      lastVerified: "2026-08-25",
    },
    maintenanceCheck: {
      kind: "manual",
      url: "https://www.gog.com/en/game/thief_2_the_metal_age",
      checkedAt: "2026-08-25",
      note: "Commercial classic; verify the current GOG offline installer, modern Windows launch reliability, and included controller support manually.",
    },
    thatOneThing:
      "Every room becomes a clockwork stealth puzzle the moment you stop and listen.",
    longDescription:
      "Thief II is a stealth game about information before action. You play Garrett, a professional thief who survives by reading rooms: the scrape of a guard's boots, the shine on a marble floor, the dark patch beneath a balcony, and the distance between one torch and the next. Darkness is cover, sound is evidence, and a clean escape is usually more satisfying than a pile of bodies.\n\nThe sequel takes the first game's wonderful systems and gives them spaces built to show those systems off. Mansions, banks, warehouses, city streets, and Mechanist strongholds feel like places with routines rather than corridors waiting for a hero. Objectives send you inside, but the best stories happen between them—when a water arrow saves a route, a rope arrow invents one, or a guard hears exactly one footstep too many.\n\nGarrett is capable without becoming powerful. His blackjack, broadhead arrows, flash bombs, scouting orb, and collection of specialty arrows reward preparation and improvisation. The difficulty settings do more than inflate enemy health; they add objectives and restrictions, turning familiar missions into tighter heists. That makes Thief II unusually replayable even before the enormous fan-mission scene enters the picture.\n\nThe GOG release is the sensible modern starting point: a DRM-free offline installer, the NewDark-compatible game, and no required launcher. Run the original campaign first. When you want more, AngelLoader can organize fan missions without unpacking every archive by hand. Controller support exists in the current GOG package, but mouse and keyboard remain the sharpest way to aim arrows and work through the old interface.\n\nSome edges are still unmistakably from 2000. Character animation is stiff, combat is awkward, menus assume a keyboard, and the deliberate pace will frustrate anyone who wants stealth as a brief pause between fights. Those limitations matter. They also leave the central design untouched: observe, plan, improvise, disappear. Few games trust sound, space, and player judgment this completely. Thief II does, and that confidence is still its one great trick.\n\nThe campaign also understands that stealth needs texture. Eavesdropped conversations sketch out the city, Garrett's dry commentary keeps the gloom from turning ponderous, and the Mechanists give every mission a sharp industrial identity. A first run can be cautious and methodical; a return trip can chase loot, expert objectives, ghost rules, or routes you never noticed. It is not nostalgia doing all the work here. The underlying simulation still produces decisions worth making.",
    whyWePickedIt:
      "We picked Thief II because its stealth is not a visibility meter pasted onto an action game. The whole world participates: flooring changes your noise, light changes your safety, patrols create timing windows, and tools let you rewrite a route. It remains approachable through GOG's offline build, grows for years through NewDark fan missions, and gives us an honest reason to keep recommending a game from 2000: nobody has replaced what it does best.",
    bestFor: [
      "Players who enjoy patient, systems-driven stealth where listening matters as much as looking",
      "Anyone who wants sprawling handcrafted missions with several viable routes",
    ],
    notFor: [
      "Players who want fast combat, modern animation, or constant objective markers",
      "Anyone unwilling to spend a few minutes learning old-school controls and menus",
    ],
    comparableTo: ["Dishonored", "Deus Ex"],
    installSteps: [
      {
        platform: "windows",
        text: "Download the DRM-free GOG offline installer for Thief II. GOG Galaxy is optional; the offline files are enough.",
      },
      {
        platform: "windows",
        text: "Run the installer, then launch Thief II once. Set your resolution, audio, and controls before starting the campaign.",
      },
      {
        platform: "windows",
        text: "For fan missions, keep the NewDark-compatible GOG build and install AngelLoader in a writable folder outside Program Files. Point it to Thief2.exe and to a separate fan-mission archive folder.",
      },
      {
        platform: "windows",
        text: "Leave downloaded fan missions zipped. Let AngelLoader install and launch them; choose ‘Play without FM’ whenever you want the original campaign.",
      },
    ],
    faq: [
      {
        q: "Do I need GOG Galaxy to play Thief II?",
        a: "No. Download the DRM-free offline installer from your GOG library. Galaxy is optional.",
      },
      {
        q: "Does Thief II support controllers?",
        a: "The current GOG package includes controller support, but mouse and keyboard remain the most precise fit for aiming, inventory, and the original interface.",
      },
      {
        q: "How do I play Thief II fan missions?",
        a: "Use the NewDark-compatible GOG build with AngelLoader. Install AngelLoader outside Program Files, point it to Thief2.exe and your fan-mission folder, and leave mission archives zipped.",
      },
      {
        q: "Does Thief II have multiplayer?",
        a: "No. Thief II is a single-player stealth campaign; PlayBound parties are useful for voice chat and shared sessions, not networked co-op.",
      },
    ],
  },
  "rollercoaster-tycoon": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict: "RollerCoaster Tycoon turns tiny pricing decisions and hand-built hills into a park that feels alive, legible, and entirely yours.",
      lastVerified: "2026-08-20",
    },
    maintenanceCheck: {
      kind: "manual",
      url: "https://atari.com/pages/rollercoaster-tycoon",
      checkedAt: "2026-08-20",
      note: "Commercial classic; verify the official Windows release and modern launch reliability manually.",
    },
    longDescription:
      "RollerCoaster Tycoon is a theme-park management simulation where the exciting part and the spreadsheet part are the same machine. Chris Sawyer designed and programmed the original around a remarkably clear chain of consequences: a ride draws guests, its queue changes foot traffic, hungry visitors find the nearest stall, litter creates complaints, and complaints tell you exactly where the park is failing. The Deluxe edition packages the 1999 game with Corkscrew Follies and Loopy Landscapes, giving the original scenario campaign a much broader set of rides, scenery, and increasingly strange plots of land.\n\nEach scenario starts with a concrete target—usually a guest count, park value, or ride requirement—and a deadline. You borrow carefully, set admission and ride prices, hire staff, research attractions, and shape paths around terrain that rarely cooperates. The famous coaster builder is only one piece of the puzzle, but it remains the star: lift hills, drops, banking, brakes, scenery, and station throughput all affect whether a design is profitable or simply an expensive nausea generator. Excitement, intensity, and nausea ratings turn visual design into a readable engineering problem.\n\nThe guest simulation is what keeps the park from becoming a static diorama. Every visitor has money, needs, tolerances, and visible thoughts. You can spot a crowd saying they cannot find a bathroom, trace the broken path layout that caused it, and fix the problem without consulting a hidden analytics screen. Mechanics inspect rides, handymen clean paths, security guards curb vandalism, and entertainers soften long waits. Nothing is individually complicated; the pleasure comes from dozens of understandable systems colliding.\n\nTime has left marks. The interface assumes a mouse, a modest resolution, and patience with stacked windows. The original executable can also need compatibility help on modern PCs. OpenRCT2 offers an excellent modern engine for players who also own the required RollerCoaster Tycoon 2 or Classic data; linking the original game then brings its scenarios and assets across. That route is optional and does not make the commercial game free.\n\nPlayBound recommends RollerCoaster Tycoon because its low price buys a complete, interruption-free design classic. There are no timers, premium currencies, or decorative shops asking for another payment. More importantly, its simulation still teaches by showing. When a park thrives, you understand why—and when it fails, the tiny furious guests usually told you first.",
    whyWePickedIt:
      "RollerCoaster Tycoon proves that depth does not require obscurity. Its guests, queues, finances, and ride physics expose their logic clearly enough for a new player to learn by watching, yet they combine into scenarios that remain absorbing decades later. It is not free, so we classify it as value rather than pretend otherwise: the standard edition is a modest one-time purchase and the game contains no recurring monetization. This is preservation with a point—a complete classic that still earns the space it occupies.",
    thatOneThing:
      "Click any guest, read one blunt little thought, and follow it back to a park-wide problem you can actually fix.",
    bestFor: [
      "Players who enjoy management games with visible cause and effect",
      "Coaster builders who want track design tied to physics, throughput, and profit",
      "Low-spec Windows PCs and short scenario-based play sessions",
      "Anyone who prefers a complete one-time purchase over live-service progression",
    ],
    notFor: [
      "Players who need a modern high-resolution interface out of the box",
      "Anyone looking for first-person ride building or contemporary 3D presentation",
      "Players who want a free game; RollerCoaster Tycoon is a paid commercial title",
      "Mac or Linux users unwilling to configure a compatibility layer or OpenRCT2 with legally owned assets",
    ],
    comparableTo: [
      "Parkitect",
      "Planet Coaster",
      "Theme Park",
      "OpenTTD",
      "Two Point Hospital",
      "SimCity 2000",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Obtain a legitimate copy of RollerCoaster Tycoon: Deluxe, then download its Windows installer.",
      },
      {
        platform: "windows",
        text: "Run the installer, then launch the game once and confirm that the original scenarios load correctly.",
      },
      {
        platform: "windows",
        text: "If the original executable has display or compatibility trouble, apply Windows compatibility settings or use OpenRCT2 with legally owned RollerCoaster Tycoon 2 or Classic assets and link your RCT1 installation.",
      },
    ],
    faq: [
      {
        q: "Is RollerCoaster Tycoon free?",
        a: "No. RollerCoaster Tycoon: Deluxe is a paid commercial game. It qualifies for PlayBound as a low-cost value pick with a complete game and no microtransactions, not as a free download.",
      },
      {
        q: "What is included in the Deluxe edition?",
        a: "Deluxe includes the original RollerCoaster Tycoon plus the Corkscrew Follies and Loopy Landscapes expansion content, adding scenarios, rides, shops, and scenery.",
      },
      {
        q: "Does it work on modern Windows PCs?",
        a: "The preserved release is available for Windows, but this remains a 1999 game and compatibility can vary. Windowed modes, compatibility settings, or the OpenRCT2 route can provide a smoother experience.",
      },
      {
        q: "Can I use OpenRCT2 to play it?",
        a: "OpenRCT2 can link an original RollerCoaster Tycoon installation for its scenarios and assets, but OpenRCT2 itself requires legally owned RollerCoaster Tycoon 2 or RollerCoaster Tycoon Classic game files.",
      },
      {
        q: "Is RollerCoaster Tycoon a sandbox game?",
        a: "It has strong sandbox-style building tools, but the core game is a scenario campaign with financial, attendance, and park-value objectives. That structure gives each map a distinct management problem.",
      },
      {
        q: "What hardware does the Deluxe release require?",
        a: "The published minimum asks for a 1.8 GHz processor, 512 MB RAM, a DirectX 7-compatible 3D graphics card, and 2 GB of storage. The bigger concern on a modern PC is operating-system compatibility, not performance.",
      },
    ],
  },
  "albion-online": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Albion turns gathering, trade, and territorial risk into one coherent machine; the free account is the real game, while Premium mostly changes how quickly you move through it.",
      lastVerified: "2026-08-20",
    },
    maintenanceCheck: {
      kind: "manual",
      url: "https://albiononline.com/news",
      checkedAt: "2026-08-20",
      note: "Official news and patch notes show active 2026 updates and live events.",
    },
    longDescription:
      "Albion Online is a sandbox MMO with a refreshingly legible premise: your equipment is your class, and nearly every sword, saddle, potion, and plank in circulation was gathered and built by another player. Swapping from healer to tank is a matter of changing gear rather than rerolling a character. That makes experimentation cheap, while the Destiny Board gives long-term specialists plenty to pursue.\n\nThe world is arranged by risk. Safe zones let you learn the economy and combat without losing your kit. Red and black zones turn travel into a real decision because defeat can mean dropping what you carried. Full-loot PvP sounds brutal—and occasionally is—but it gives transport, scouting, crafting, and guild logistics a purpose most MMOs only pretend they have. A load of ore matters because getting it home is part of the job.\n\nCombat is compact and readable, built around short ability bars and clear area markers. The interesting decisions happen before and around the fight: which set you brought, whether your group should commit, and whether the stranger at the edge of the screen is bait. Beyond PvP, there are expeditions, open-world mobs, dungeons, gathering loops, personal islands, and a market deep enough to be somebody's entire game.\n\nPremium boosts progression and economic efficiency, so the monetization is not invisible. Still, the complete world is available without buying an expansion or routing the account through Steam. PlayBound installs Albion's own launcher because that is the cleanest path to the same cross-platform account used on mobile and desktop.",
    whyWePickedIt:
      "Albion belongs here because its systems respect player agency. Gathering is not filler, crafting is not a side menu, and danger is not painted scenery. The economy works because players make things other players can lose. It asks for patience and accepts that loss can sting, but few free MMOs make ordinary decisions feel this consequential.",
    thatOneThing:
      "A cart full of resources can turn a routine ride home into the tensest five minutes of your night.",
    installSteps: [
      { platform: "windows", text: "Choose Install in PlayBound; we download and open Albion's official standalone installer." },
      { platform: "windows", text: "Choose an install location in the Albion launcher—an SSD is strongly recommended—then let it fetch the current client." },
      { platform: "all", text: "Create or sign into an Albion account, select your region, and let the launcher finish patching before Play." },
    ],
    faq: [
      { q: "Is Albion Online actually free?", a: "Yes. The world, economy, PvE, and PvP are playable without buying the game. Premium adds progression and economic bonuses but is not required to log in or reach the full map." },
      { q: "Does PlayBound install the Steam version?", a: "No. PlayBound uses Albion's official standalone launcher, so an existing Albion account works without Steam." },
      { q: "Do I lose equipment when I die?", a: "Only in full-loot zones. Blue and yellow areas provide safer progression; red and black zones are where carried gear can be lost to other players." },
      { q: "Can I change classes?", a: "There are no permanent classes. Weapons and armor determine your abilities, so changing a loadout changes your role." },
      { q: "Does Albion support cross-platform play?", a: "Yes. Windows, macOS, Linux, Android, and iOS players share the same world and account system." },
    ],
    bestFor: ["Players who want a real player-run economy", "Small groups and guilds that enjoy risk, logistics, and territory", "Gatherers and crafters who want their work to matter"],
    notFor: ["Anyone who hates the possibility of losing carried equipment", "Players looking for a heavily scripted solo campaign", "People who want every progression boost to be cosmetic-only"],
    comparableTo: ["EVE Online", "RuneScape", "Ultima Online", "New World"],
  },
  "guild-wars-2": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Guild Wars 2 makes cooperation feel natural instead of mandatory, and its free core world remains one of the strongest no-subscription MMO introductions available.",
      lastVerified: "2026-08-20",
    },
    maintenanceCheck: { kind: "manual", url: "https://www.guildwars2.com/en/news/", checkedAt: "2026-08-20", note: "ArenaNet continues to publish live updates and expansion support in 2026." },
    longDescription:
      "Guild Wars 2 removes several habits that make older MMOs feel like office work. Players who attack the same creature share credit. Resource nodes are personal instead of first-come. Dynamic events pull everyone nearby toward a common problem without asking strangers to negotiate a party first. The result is an open world where seeing another player is usually good news.\n\nCombat mixes tab targeting with active movement, dodges, ground placement, and weapon-defined skill bars. A guardian with a greatsword behaves differently from one carrying a staff, and elite specializations in paid expansions push professions into new roles. The free core game still includes the original level journey, personal story, structured PvP, and World vs World: a persistent three-way siege mode built around keeps, supply lines, and very large groups.\n\nTyria rewards wandering. Maps hide jumping puzzles, event chains, world bosses, vistas, and small stories that are easy to miss if you treat the compass as an order. Level scaling keeps earlier zones useful, while the lack of a conventional gear treadmill means a good endgame set does not become rubbish every season. Paid expansions add major campaigns, masteries, mounts, and specializations; the free account is substantial, but it is not the entire modern game.\n\nPlayBound installs ArenaNet's standalone 64-bit client directly. That avoids Steam account boundaries and keeps the account path ArenaNet documents. Expect a large first download and CPU-heavy performance in crowded events—even strong graphics cards cannot brute-force every world boss pileup.",
    whyWePickedIt:
      "We picked Guild Wars 2 because it solves a social design problem most MMOs simply accept. It gives strangers reasons to help without making them form a committee first. The free core game is broad enough to judge the combat, exploration, PvP, and world structure honestly before paying for anything.",
    thatOneThing: "A world event can turn twenty unrelated passersby into a functioning rescue party without a single invite.",
    installSteps: [
      { platform: "windows", text: "Choose Install in PlayBound to download ArenaNet's official Gw2Setup-64 client." },
      { platform: "windows", text: "Select a folder with at least 80 GB free; an SSD helps loading and patching." },
      { platform: "windows", text: "Create or sign into an ArenaNet account, let the launcher download the data archive, then choose Play." },
    ],
    faq: [
      { q: "How much of Guild Wars 2 is free?", a: "The full original core game, leveling path, structured PvP, and World vs World are free. Expansions, their stories, masteries, mounts, and elite specializations are paid." },
      { q: "Does Guild Wars 2 require a subscription?", a: "No. There is no monthly subscription; expansions are purchased separately." },
      { q: "Does PlayBound use Steam?", a: "No. It installs ArenaNet's standalone 64-bit client so you can use a normal ArenaNet account." },
      { q: "How large is the installation?", a: "ArenaNet currently lists 80 GB of available space. Leave extra room for patches and temporary download data." },
      { q: "Is Guild Wars 2 friendly to solo players?", a: "Yes. Story and open-world exploration work well solo, while public events let you cooperate without maintaining a permanent group." },
    ],
    bestFor: ["Explorers who dislike rigid quest hubs", "Friends who want cooperative play without a subscription", "Large-scale PvP and world-boss groups"],
    notFor: ["Players who want the entire modern game free", "Anyone who needs stable high frame rates in the largest crowds", "Fans of strict holy-trinity combat from level one"],
    comparableTo: ["World of Warcraft", "Final Fantasy XIV", "The Elder Scrolls Online", "RIFT"],
  },
  "lord-of-the-rings-online": {
    qualityBar: { genuinelyFree: true, finished: true, activelyMaintained: true, standsAlone: true, highQuality: true, verdict: "LOTRO is old in visible ways, but its patient storytelling and extraordinary sense of place still make it the best digital walking tour of Middle-earth.", lastVerified: "2026-08-20" },
    maintenanceCheck: { kind: "manual", url: "https://www.lotro.com/news", checkedAt: "2026-08-20", note: "Standing Stone Games continues active updates, events, and expansion support in 2026." },
    longDescription:
      "The Lord of the Rings Online has spent almost two decades filling the space between famous scenes. Its Middle-earth is not a sequence of movie sets. Roads take time, settlements have working farms, and the Shire is allowed to be quiet before the story sends you toward darker country. The scale is the point: reaching Bree after an evening on foot feels like arriving somewhere.\n\nUnder that landscape is a traditional hotbar MMO with classes, crafting professions, group instances, raids, and an enormous quest archive. Combat carries the rhythm and interface density of its era, though the 64-bit client keeps the current game practical on modern Windows. The strongest material is often writing rather than spectacle. Regional story arcs show what the War of the Ring costs people far from the Fellowship, while the Epic storyline lets your character move beside—not replace—the familiar heroes.\n\nThe free offering is generous at the beginning and more complicated later. Standing Stone has opened substantial older content over time, but expansions, quest packs, conveniences, and VIP benefits still form a dense store. It is possible to earn store currency through play; it is not honest to pretend the monetization disappears. The interface also arrives carrying years of accumulated systems.\n\nPlayBound uses the current Standing Stone installer, never an obsolete DVD build and never Steam. The launcher patches the full high-resolution client after the small bootstrap runs. LOTRO is not the MMO we recommend for sharp action combat. It is the one we recommend when the road, the text, and the place matter more than getting to endgame quickly.",
    whyWePickedIt: "LOTRO made the list because preservation is not only about keeping executables alive. It is also about keeping a particular interpretation of a world available. No other game gives Middle-earth this much room to breathe, and few long-running MMOs are still adding to a map with this much history behind it.",
    thatOneThing: "The first walk from the Shire to Bree still feels like a journey instead of a loading screen.",
    installSteps: [
      { platform: "windows", text: "Choose Install in PlayBound to open Standing Stone's current LOTRO installer." },
      { platform: "windows", text: "Install the launcher, choose the 64-bit client, and allow at least 35 GB including language data." },
      { platform: "windows", text: "Let the launcher patch completely, sign into a Standing Stone account, and select a world." },
    ],
    faq: [
      { q: "Is LOTRO free to play?", a: "Yes, with a large free starting journey. Later regions, expansions, conveniences, and VIP benefits may require purchases or earned LOTRO Points." },
      { q: "Does PlayBound install LOTRO through Steam?", a: "No. It uses Standing Stone Games' current standalone installer." },
      { q: "Can I play LOTRO on Linux or Steam Deck?", a: "The publisher officially supports Windows. Proton setups can work, but PlayBound does not label them officially supported." },
      { q: "Should I use the 64-bit client?", a: "Yes. The old unsupported legacy client is obsolete; choose the supported 64-bit client in launcher options." },
      { q: "Is LOTRO good for solo play?", a: "Very. Most landscape and Epic story content can be followed solo, with fellowships useful for group instances and raids." },
    ],
    bestFor: ["Tolkien readers who want geography and atmosphere", "Solo players who read quest text", "Long-term explorers and completionists"],
    notFor: ["Players who need modern action combat", "Anyone overwhelmed by old MMO interfaces and currencies", "People expecting every later expansion to be free"],
    comparableTo: ["World of Warcraft Classic", "EverQuest II", "Dungeons & Dragons Online", "The Elder Scrolls Online"],
  },
  "dc-universe-online": {
    qualityBar: { genuinelyFree: true, finished: true, activelyMaintained: true, standsAlone: true, highQuality: true, verdict: "DCUO's interface shows its age, but movement powers, combo combat, and an absurdly deep DC costume box still give it an identity no newer superhero MMO has replaced.", lastVerified: "2026-08-20" },
    maintenanceCheck: { kind: "manual", url: "https://www.dcuniverseonline.com/news", checkedAt: "2026-08-20", note: "Daybreak continues episodes, events, and maintenance updates in 2026." },
    longDescription:
      "DC Universe Online starts with the decision superhero games understand best: who do you want to become? Body type, morality, mentor, power set, weapon, costume, and movement are separate choices. A fire-powered acrobat with a bow feels different from an ice tank who flies, and movement is not merely travel. Superspeed, flight, and acrobatics shape how you cross cities and approach fights.\n\nCombat is more immediate than the hotbar MMOs around it. Mouse or controller combos handle basic attacks while powers, blocks, counters, and movement fill out the rhythm. It can become visually noisy in group content, but the physicality survives: enemies are launched, scenery can be picked up, and a good counter interrupts somebody who thought they had momentum. Episodes draw from a huge range of DC stories rather than staying trapped in one continuity.\n\nThe game carries fifteen years of systems, currencies, and interface decisions. New players will meet upgrade tracks and menus faster than the tutorial can explain them. Monetization includes membership, marketplace items, progression conveniences, and optional content structures that have shifted over time. The free game is substantial enough to establish a character and see the core loop, but this is a live service, not a sealed free campaign.\n\nPlayBound downloads Daybreak's own LaunchPad installer instead of sending you to Steam. LaunchPad then retrieves the current client and handles patches. The official requirements are remarkably low; in practice, a modern system and extra memory make crowded hubs and large fights less rough. What keeps DCUO worth installing is not technical polish. It is the rare pleasure of making an original hero and then sprinting up the side of a Metropolis skyscraper because that is simply how your hero gets around.",
    whyWePickedIt: "We picked DCUO because no current alternative combines original-character creation, recognizable DC stories, and action-led MMO combat at this scale. It is messy, crowded with legacy systems, and unmistakably itself. Free players can discover whether that identity clicks before spending anything.",
    thatOneThing: "Choosing a movement power changes the texture of the whole city, not just the speed of your commute.",
    installSteps: [
      { platform: "windows", text: "Choose Install in PlayBound to download Daybreak's official DCUO setup program." },
      { platform: "windows", text: "Run LaunchPad, choose an install folder with at least 30 GB free, and let it download the current client." },
      { platform: "windows", text: "Create or sign into a Daybreak account, finish patching, then choose your server and create a character." },
    ],
    faq: [
      { q: "Is DC Universe Online free?", a: "Yes. You can create characters and play substantial story and group content free; membership, marketplace items, and convenience purchases remain available." },
      { q: "Does PlayBound require Steam for DCUO?", a: "No. PlayBound downloads Daybreak's standalone LaunchPad installer." },
      { q: "Can PC players play with console players?", a: "Cross-play availability depends on platform server groups. Do not assume every console shares the PC population." },
      { q: "Does DCUO support controllers?", a: "Yes. Its combo combat and movement work well on a controller." },
      { q: "How much storage does DCUO need?", a: "Daybreak lists 30 GB free. Keep additional room available for launcher staging and future updates." },
    ],
    bestFor: ["Players who love superhero character creation", "Controller users who prefer active MMO combat", "DC fans interested in broad comic-book storylines"],
    notFor: ["Anyone who wants a clean modern interface", "Players allergic to live-service currencies and upgrade systems", "People expecting universal cross-play across every platform"],
    comparableTo: ["City of Heroes", "Champions Online", "Marvel Heroes", "Neverwinter"],
  },
  openarena: {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      /*
       * 0.8.8 is from 2012 and nothing has shipped since. The servers are full
       * and the game is complete, but "actively maintained" is a claim about
       * development, and there is none — saying otherwise would make the other
       * four ticks worth less.
       */
      activelyMaintained: false,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Four out of five, and the missing one is not the one you would worry about. OpenArena has not shipped a release since 2012, but it did not need to — it is a finished arena shooter with servers that still fill up, and it asks nothing of you but the download.",
      lastVerified: VERIFIED,
    },
    maintenanceCheck: {
      kind: "manual",
      url: "https://openarena.ws/download.php",
      checkedAt: VERIFIED,
      note: "0.8.8 (Feb 2012) remains the current release; no newer stable build exists. Community servers verified live at 70 listed, 221 players.",
    },
    longDescription:
      "When id Software released the Quake III engine under the GPL, it handed the internet a perfect arena shooter with a hole in the middle: the code was free, the guns and maps were not. OpenArena is what happens when a community spends twenty years filling that hole with work of their own.\n\nEverything you shoot, stand on and hear here was made from scratch to be given away. The maps are original, the weapons are original, the announcer bellowing over your killing spree is original. That matters less as a licensing footnote than as the reason the whole thing is one download with nothing withheld — no base game to own first, no assets to source from somewhere grey.\n\nWhat you get is the real thing, not an homage. Movement is weightless and fast, strafe-jumping carries you across an arena in a couple of seconds, and the rocket launcher is aimed at the floor as often as at a person. The railgun rewards patience, the shotgun punishes it. Health and armour sit on fixed timers, so the good players are the ones counting seconds in their heads while you are still looking for a fight.\n\nThe honest catch is the calendar. The last release landed in February 2012 and the roster of populated servers is smaller than it was — you will find deathmatch and CTF running most evenings in Europe and North America, not a matchmaking queue that fills in ten seconds. What is still there is genuinely there: real people, real servers, most of them running for longer than some studios have existed.\n\nIt also runs on anything. The engine is from 1999, so a laptop with integrated graphics will hold triple-digit frame rates, and the whole game fits in the space of a single modern patch.",
    whyWePickedIt:
      "We added OpenArena because it is the cleanest answer we have to a question people ask us constantly: what do I play when I do not want to spend money and do not want to be sold anything. There is no launcher, no account, no season, no shop. You download it, you open it, you are in a game.\n\nThere is also something we find quietly impressive about it. Most free shooters are free because someone is monetising your attention somewhere else. This one is free because a group of people decided the engine deserved a game to go with it and then made every texture and sound themselves. Fourteen years after the last release the servers still have people on them, which tells you they got it right.",
    bestFor: [
      "Anyone who misses Quake III and does not want to pay for it again",
      "Old laptops and integrated graphics — the engine is from 1999",
      "LAN parties, where it needs no accounts and no internet at all",
      "Short sessions; a deathmatch round is over in ten minutes",
      "Players who want mechanical skill to decide matches rather than unlocks",
    ],
    notFor: [
      "Anyone expecting a populated matchmaking queue at any hour",
      "Players who want modern shooter comforts — no progression, no loadouts",
      "Those who need current visuals; this is 2005 art on a 1999 engine",
      "Anyone hoping for active development, which stopped in 2012",
    ],
    comparableTo: ["Quake III Arena", "Quake Live", "Xonotic", "Unvanquished", "Warsow", "Doom"],
    installSteps: [
      {
        platform: "all",
        text: "Install through PlayBound, which pulls the 0.8.8 archive from the project's SourceForge mirror and checks it against the published MD5.",
      },
      {
        platform: "all",
        text: "Nothing else is needed. OpenArena is a complete game — it does not read any files from Quake III.",
      },
      {
        platform: "all",
        text: "Raise com_maxfps before your first match. The default is conservative and the movement feels markedly different once it is uncapped.",
      },
      {
        platform: "all",
        text: "Use the in-game server browser rather than starting a local match; the populated servers are where the game actually lives.",
      },
      {
        platform: "linux",
        text: "Mark the binary executable if your file manager has not done it for you.",
        command: "chmod +x openarena.x86_64",
      },
    ],
    faq: [
      {
        q: "Is OpenArena really free?",
        a: "Completely. The engine is GPL and every asset was created by the community to be freely licensed, so there is nothing to buy, no account to make and no store. You do not need to own Quake III or any other game.",
      },
      {
        q: "Do I need Quake III Arena to play it?",
        a: "No. OpenArena reuses id Software's open-sourced engine but ships its own maps, weapons, models and sounds. It is a complete standalone game.",
      },
      {
        q: "Is anyone still playing in 2026?",
        a: "Yes, though modestly. We counted 70 listed servers with 221 players across them when this entry was last checked, concentrated in Europe and North America. Expect populated deathmatch and CTF in the evenings rather than instant matchmaking.",
      },
      {
        q: "Why is the last release from 2012?",
        a: "Development on the stable branch stopped after 0.8.8. The game was finished by then, and community work since has gone into maps and the experimental OpenArena eXpanded branch rather than new official releases.",
      },
      {
        q: "Will it run on my old laptop?",
        a: "Almost certainly. The engine dates from 1999, so integrated graphics will hold well over a hundred frames per second. The only real requirement is about 700 MB of disk space.",
      },
      {
        q: "Can I play offline or on a LAN?",
        a: "Yes to both. Bots fill any arena for offline practice, and LAN play needs no internet connection and no accounts, which makes it a reliable choice for a room full of machines.",
      },
      {
        q: "Is this related to The Elder Scrolls: Arena?",
        a: "No, despite both being in this catalog. That is a 1994 Bethesda RPG; this is a multiplayer arena shooter. They share nothing but the word.",
      },
    ],
  },

  starcraft: {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      /*
       * Classic StarCraft gets occasional compatibility and security patches
       * rather than active development, and there is no public repository to
       * check — hence a manual entry that verify:maintenance will flag when it
       * goes stale rather than a github check that would always look dead.
       */
      activelyMaintained: false,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The pinnacle of competitive real-time strategy, featuring three perfectly asymmetric sci-fi factions, an immortal esports legacy, and sixty gripping story campaign missions completely free.",
      lastVerified: VERIFIED,
    },
    maintenanceCheck: {
      kind: "manual",
      url: "https://us.shop.battle.net/en-us/product/starcraft",
      checkedAt: VERIFIED,
      note: "Classic StarCraft receives only sporadic compatibility patches; Blizzard disbanded the Classic Games team in 2024. Free Anthology availability re-confirmed on Battle.net.",
    },
    longDescription:
      "In 1998 Blizzard shipped a strategy game with three factions that barely shared a rule between them, and accidentally invented a national sport.\n\nTerran, Zerg and Protoss are not the usual reskins with different unit names. Terrans build modular bases they can literally lift and relocate, repair their machines, and fight a slow attrition game. Zerg buy nothing individually — they spend larvae, spread creep, and win by arriving with more bodies than you have bullets. Protoss field expensive, powerful units with regenerating shields and can teleport reinforcements straight into a fight. Balancing three armies this different should have been impossible, and Blizzard spent two decades proving it wasn't.\n\nThat balance is why StarCraft became infrastructure in South Korea — televised leagues, professional teams, players with salaries and fan clubs, a competitive scene that outlived several console generations. Brood War, the expansion, is the version that scene actually played, and it is included free.\n\nThe campaigns deserve their own mention. Sixty missions across the two releases, tied together by briefing-room scenes and a genuinely good story about Sarah Kerrigan, told with a confidence most games still don't manage. You can play the whole thing solo and never touch multiplayer.\n\nWhat Blizzard did in 2017 is the reason it is in this catalog: patch 1.18 made the original game and Brood War free permanently, added Windows 10 and modern macOS compatibility, windowed mode, observer mode and improved matchmaking. StarCraft: Remastered launched later the same year as a paid upgrade with 4K art — worth having, entirely optional, and not what you are downloading here.\n\nBe clear about what it is: a 1998 game at 640×480 with heavy sprite art and interface conventions that predate conveniences you now consider standard. There is no unit rally-point sophistication, selection caps exist, and the learning curve for multiplayer is close to vertical. As a single-player campaign and a piece of design history, it is unmatched at the price.",
    whyWePickedIt:
      "Very few genuinely canonical games are free, and fewer still were made free deliberately by the company that still profits from the franchise. Blizzard could have left StarCraft behind a storefront forever; instead they patched it for modern machines and gave it away. That combination — historically important, still excellent, actually free — is exactly what this catalog exists to surface.",
    bestFor: [
      "Anyone who wants to understand why RTS design peaked here",
      "Sixty missions of single-player campaign, no multiplayer required",
      "Players curious about the game that built professional esports",
      "Very old hardware — it is a 1998 game and runs on anything",
    ],
    notFor: [
      "Players who need modern visuals or interface conveniences",
      "Anyone hoping for a gentle multiplayer ladder; the skill floor is brutal",
      "Linux users, who will need Wine or Proton rather than a native build",
      "Those who want the 4K art, which is the paid Remastered upgrade",
    ],
    comparableTo: ["Command & Conquer", "Age of Empires II", "Warcraft III", "Supreme Commander", "Dune 2000"],
    installSteps: [
      {
        platform: "all",
        text: "Install the Battle.net desktop app from Blizzard and sign in with a free Battle.net account.",
      },
      {
        platform: "all",
        text: "Find StarCraft in the game list and install it. The Anthology — StarCraft plus Brood War — costs nothing; do not buy Remastered unless you specifically want the 4K art.",
      },
      {
        platform: "all",
        text: "Play the StarCraft campaign before Brood War. Brood War continues the story directly and assumes you know the units.",
      },
      {
        platform: "linux",
        text: "There is no native Linux build. Battle.net and StarCraft both run under Wine or Proton, but that route is community-supported rather than official.",
      },
    ],
    faq: [
      {
        q: "Is StarCraft actually free?",
        a: "Yes. Blizzard made StarCraft and its Brood War expansion free permanently in March 2017 with patch 1.18. You need a free Battle.net account and the Battle.net app, but there is nothing to buy.",
      },
      {
        q: "What is the difference between the free version and Remastered?",
        a: "The free Anthology is the complete original game and expansion with modern compatibility. Remastered is a paid upgrade that adds 4K artwork and some quality-of-life features. Gameplay and balance are identical, and the two can play together online.",
      },
      {
        q: "Does the free version include Brood War?",
        a: "Yes. Both the original campaign and the Brood War expansion are included, which is roughly sixty missions in total.",
      },
      {
        q: "Can I play StarCraft on modern Windows and macOS?",
        a: "Yes. Patch 1.18 added support for current Windows and macOS versions along with windowed mode. There is no native Linux client, though it runs under Wine and Proton.",
      },
      {
        q: "Is anyone still playing StarCraft multiplayer?",
        a: "Yes, though it is a small and extremely skilled population, particularly in South Korea. Expect a steep introduction if you go straight to ladder play.",
      },
      {
        q: "Is StarCraft still being updated?",
        a: "Not meaningfully. It receives occasional compatibility and security patches, but active development stopped and Blizzard disbanded its Classic Games team in 2024. The game is complete and stable as it stands.",
      },
    ],
  },

  "tes-arena": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: false,
      standsAlone: true,
      /*
       * Not highQuality: Arena matters historically and is free, but it is a
       * 1994 dungeon crawler with generated content that repeats heavily. It
       * earns a place as the series' origin rather than on play quality, and
       * saying so is more useful than pretending otherwise.
       */
      highQuality: false,
      verdict:
        "The historic 1994 genesis of The Elder Scrolls: an unconstrained, continent-spanning dungeon crawler that laid the foundation for thirty years of Tamriel roleplaying.",
      lastVerified: VERIFIED,
    },
    maintenanceCheck: {
      kind: "manual",
      url: "https://cdnstatic.bethsoft.com/elderscrolls.com/assets/files/tes/extras/Arena106Setup.zip",
      checkedAt: VERIFIED,
      note: "Bethesda's freeware package, unchanged since the 2004 anniversary release. Download URL re-verified reachable and serving 9.1 MB.",
    },
    longDescription:
      "The Elder Scrolls: Arena was supposed to be a gladiator game. Somewhere in development it turned into an entire continent, and Bethesda has been building on that accident ever since.\n\nArena drops you into Tamriel with a mission to recover the eight pieces of the Staff of Chaos, scattered across dungeons in a world containing every province the series would later visit individually. The scale is genuinely absurd for 1994 — hundreds of towns, each with shops, temples, inns and their own inhabitants, all generated rather than hand-placed. You can walk out of the main quest and simply travel, taking odd jobs, robbing dungeons, and getting lost in a way that later, more curated Elder Scrolls games deliberately reined in.\n\nWhat is remarkable is how much of the series' DNA is already present. Skills improve through use. Guilds have their own quest lines and ranks. Spells can be made rather than bought. Days pass, shops close at night, and there is a working calendar behind it all. Morrowind and Skyrim refined these ideas; they did not invent them.\n\nThe cost is that most of Tamriel is procedural. Towns share layouts, dungeon corridors repeat, and quest text recycles. Twenty hours in you will have seen the shapes the generator knows. Combat is a matter of holding a mouse button and dragging a direction, which was novel then and is tiresome now. It is genuinely hard, frequently unfair, and does not explain itself.\n\nBethesda made it freeware in 2004 for the series' tenth anniversary, and the download here is their own package. Being a DOS game, it wants DOSBox to run at a sensible speed. If you would rather play it with modern controls and rendering, OpenTESArena is an open-source engine reimplementation in active development — impressive and worth watching, though not yet finished enough to be the way we recommend starting.",
    whyWePickedIt:
      "We include Arena for the same reason a museum keeps first drafts. It is not the best Elder Scrolls game and we are not going to pretend it is — but it is the one where the series' whole design philosophy shows up fully formed, thirty years ago, and Bethesda gave it away rather than reselling it. That deserves a proper entry rather than a footnote.",
    bestFor: [
      "Anyone curious about where Elder Scrolls design actually started",
      "Players who enjoy getting lost in enormous, indifferent worlds",
      "Retro RPG fans comfortable with DOS-era conventions",
      "Extremely low-spec machines — it is a 1994 game",
    ],
    notFor: [
      "Players expecting Skyrim; this is far more primitive and far less forgiving",
      "Anyone who dislikes repetitive procedurally generated content",
      "Those who want guidance — the game explains almost nothing",
      "Players unwilling to configure DOSBox for a reasonable experience",
    ],
    comparableTo: ["The Elder Scrolls II: Daggerfall", "Ultima Underworld", "Might and Magic", "Morrowind"],
    installSteps: [
      {
        platform: "all",
        text: "Install through PlayBound, which fetches Bethesda's official freeware package.",
      },
      {
        platform: "all",
        text: "Run it through DOSBox — DOSBox Staging is the best current build. Without it the game runs at whatever speed your CPU feels like, which is not playable.",
      },
      {
        platform: "all",
        text: "Set cycles in DOSBox if movement feels too fast or too slow. Around 20000 cycles is a reasonable starting point.",
      },
      {
        platform: "all",
        text: "Save often and in multiple slots. Arena is from an era that considered losing progress part of the experience.",
      },
    ],
    faq: [
      {
        q: "Is The Elder Scrolls: Arena free?",
        a: "Yes. Bethesda released it as freeware in 2004 to mark the series' tenth anniversary, and still hosts the download themselves. It is also free on Steam and GOG.",
      },
      {
        q: "Do I need DOSBox to play Arena?",
        a: "In practice, yes. Arena is a DOS game, and without DOSBox it either refuses to run on modern Windows or runs at an unusable speed. The GOG release bundles a pre-configured DOSBox if you would rather not set one up.",
      },
      {
        q: "Is Arena worth playing today, or should I start with Daggerfall?",
        a: "Daggerfall is the better game and is also free. Play Arena if you are specifically interested in the series' origins; play Daggerfall, ideally through Daggerfall Unity, if you want a genuinely engrossing old Elder Scrolls game.",
      },
      {
        q: "What is OpenTESArena?",
        a: "An open-source reimplementation of Arena's engine with modern rendering and controls, in active development. It is promising and is progressing quickly, but it is not yet complete, so the original freeware release remains the way to actually finish the game.",
      },
      {
        q: "How long is Arena?",
        a: "The main quest runs roughly thirty to forty hours, and the world is effectively endless because most of it is generated. Most players see what the generator has to offer well before exhausting it.",
      },
      {
        q: "Is this related to OpenArena?",
        a: "No. OpenArena is a free Quake III-style arena shooter and shares nothing with this game but the word Arena.",
      },
    ],
  },

  daggerfall: {
    qualityBar: clearsAll(
      "The ultimate fantasy life simulator: a monumental 160,000-square-kilometer continent of political court intrigue, banking, ship ownership, and endless dungeon delving reborn in modern 60 FPS Unity."
    ),
    maintenanceCheck: { kind: "github", repo: "Interkarma/daggerfall-unity" },
    longDescription:
      "The Elder Scrolls II: Daggerfall is Bethesda's monumental 1996 open-world RPG, set in the Iliac Bay regions of High Rock and Hammerfell. Sent on a personal mission by Emperor Uriel Septim VII to investigate the ghost of King Lysandus and locate a lost letter, you are thrust into a complex web of imperial espionage, court intrigue, and supernatural conspiracies.\n\nDaggerfall represents the pinnacle of open-world simulation scale in gaming history. Its landmass spans over 160,000 square kilometers with more than 15,000 towns, cities, dungeons, and temples populated by 750,000 NPCs. You can buy horses, carts, sailing ships, and private townhouses; borrow money from provincial banks; contract vampirism or lycanthropy; join knightly orders, temples, and thieves guilds; and craft custom spells and enchanted items.\n\nDaggerfall Unity modernizes this historic RPG in the Unity engine, replacing the archaic DOS interface with modern widescreen and 4K rendering, full first-person mouselook, gamepad controls, dynamic lighting, smooth terrain heightmaps, and a rich modding framework. Bethesda released the original game files completely free to the public, making Daggerfall Unity 100% free to play.",
    whyWePickedIt:
      "Daggerfall is the ultimate fantasy life simulation. While later Elder Scrolls games compressed their geography, Daggerfall chose absolute unconstrained scale. Daggerfall Unity rescues this masterpiece from DOSBox instability and turns it into one of the richest, most immersive modern retro RPG experiences available.",
    bestFor: [
      "Fans of deep open-world fantasy RPGs like Morrowind, Oblivion, and Skyrim",
      "Players who love sandbox freedom, owning real estate, ships, and bank accounts",
      "Gamers fascinated by massive procedural continents and endless dungeon delving",
      "Modding enthusiasts wanting hundreds of visual, quest, and survival expansions",
    ],
    notFor: [
      "Players who want tightly scripted, linear 10-hour cinematic storylines",
      "Those who easily get lost in sprawling 3D procedural underground labyrinths",
    ],
    comparableTo: [
      "The Elder Scrolls III: Morrowind",
      "The Elder Scrolls: Arena",
      "Ultima Underworld",
      "Kingdom Come: Deliverance",
      "Mount & Blade II: Bannerlord",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Install Daggerfall Unity directly through PlayBound launcher or download the latest release from DF Workshop. The installer sets up the free game data automatically.",
      },
      {
        platform: "linux",
        text: "Download the native Linux Daggerfall Unity build or launch via Proton on Steam Deck with built-in gamepad controls.",
      },
      {
        platform: "all",
        text: "Enhance your playthrough with DREAM, Quest Pack 1, and Basic Roads by dropping mods into the StreamingAssets/Mods folder.",
      },
    ],
    faq: [
      {
        q: "Is The Elder Scrolls II: Daggerfall free?",
        a: "Yes! Bethesda released the full Daggerfall game data as official freeware in 2009 for the 15th anniversary, and also published it free on Steam. Daggerfall Unity is free open-source software under the MIT license.",
      },
      {
        q: "What is Daggerfall Unity (DFU)?",
        a: "Daggerfall Unity is an open-source recreation of Daggerfall in the Unity engine by Gavin 'Interkarma' Clayton. It delivers native widescreen/4K rendering, modern mouselook, gamepad support, bug fixes, and an extensive modding API.",
      },
      {
        q: "Can I play Daggerfall Unity on Steam Deck?",
        a: "Yes! Daggerfall Unity features native full controller and gamepad mapping, making it run wonderfully on Steam Deck at 60 FPS with exceptional battery life.",
      },
      {
        q: "How big is the map in Daggerfall?",
        a: "Daggerfall's Iliac Bay map spans roughly 161,600 square kilometers — roughly the physical size of Great Britain — containing over 15,000 settlements, dungeons, and temples.",
      },
      {
        q: "What mods should I install first?",
        a: "We recommend starting with D.R.E.A.M. for updated visuals/audio, Basic Roads and Travel Options for wilderness exploration, and Quest Pack 1 for hundreds of new quests.",
      },
      {
        q: "Does Daggerfall have multiple endings?",
        a: "Yes! Daggerfall features six distinct major endings depending on which faction leader or supernatural entity you bestow the Totem of Tiber Septim upon, leading to the lore event known as the Warp in the West.",
      },
    ],
  },

  alephone: {
    qualityBar: clearsAll(
      "Bungie's cerebral sci-fi masterpiece, delivering razor-sharp terminal lore, chilling rogue AI philosophy from Durandal, and dual-shotgun combat that shaped the DNA of modern first-person shooters."
    ),
    maintenanceCheck: { kind: "github", repo: "Aleph-One-Marathon/alephone" },
    longDescription:
      "Before Halo, Bungie made Marathon — and Marathon 2 is the one people still argue about.\n\nReleased in 1995 for the Mac, it arrived while Doom was defining what a shooter was, and quietly disagreed with most of it. Doom gave you a wordless marine and a body count. Marathon 2 gave you terminals: screens scattered through every level carrying thousands of words of story from an artificial intelligence called Durandal, who is manipulative, funny, self-aware and slowly going insane. You are working for him. It is not clear you should be.\n\nThe design disagrees in mechanical ways too. You can swim. You can look up and down properly. Levels have objectives beyond reaching the exit — rescuing trapped crew, activating systems, exploring backwards — and they expect you to read the terminals to know what you are doing. Enemies coordinate. Ammunition is scarce enough to matter. It is slower and more deliberate than its contemporaries, and it rewards patience in a way 1995 shooters generally did not.\n\nAleph One is what keeps it alive. Bungie released the engine source in 2000, and the project has maintained it ever since: modern resolutions and widescreen, OpenGL rendering, mouselook, gamepad support, internet multiplayer and native Windows, macOS and Linux builds. Bungie also allowed the complete game data to be distributed free, so the download is the whole thing — engine and game together, no purchase, no store, no hunting for files.\n\nThe honest caveat is that this is a genuinely old game underneath. The textures are low-resolution, enemies are sprites, and level geometry can be maze-like in a way modern shooters trained you out of. If you need a map that holds your hand, this will frustrate you. If you want to see where a lot of modern sci-fi shooter writing actually came from, it is right here, complete, for free.",
    whyWePickedIt:
      "Most free classics are free because nobody wanted them. Marathon 2 is free because Bungie chose to release it, and it happens to contain some of the best writing in the genre's history — an AI narrator that games spent the next twenty years imitating badly. That it now installs in one click with mouselook and widescreen, rather than requiring an emulator and a prayer, is the entire reason preservation projects matter.",
    bestFor: [
      "Anyone interested in where Halo, and Bungie's writing, actually came from",
      "Players who like story delivered through reading and exploration",
      "Deliberate, resource-conscious shooting rather than constant action",
      "Very low-spec machines — it runs on essentially anything",
      "Mac and Linux players, who get first-class native builds",
    ],
    notFor: [
      "Players who want modern visuals; this is 1995 sprite art at heart",
      "Anyone who dislikes maze-like level design or backtracking",
      "Those who skip text — most of the story lives in optional terminals",
      "People looking for a populated multiplayer scene rather than a campaign",
    ],
    comparableTo: ["Halo", "Doom", "System Shock", "Quake", "Duke Nukem 3D"],
    installSteps: [
      {
        platform: "all",
        text: "Install through PlayBound, or download the Marathon 2 package from the Aleph One site. The download includes both the engine and the full game.",
      },
      {
        platform: "all",
        text: "Turn on mouselook in Preferences → Controls if it is not already enabled. The default control scheme dates from 1995 and is not what you want.",
      },
      {
        platform: "all",
        text: "Read the terminals. They are not optional flavour — objectives and story are both delivered through them.",
      },
      {
        platform: "macos",
        text: "The Mac build is unsigned, so the first launch needs a right-click and Open rather than a double-click.",
      },
    ],
    faq: [
      {
        q: "Is Marathon 2 really free?",
        a: "Yes. Bungie permitted the Marathon trilogy's game data to be distributed at no cost, and the Aleph One engine that runs it is open source under the GPL. The download includes both — there is nothing to buy and no original copy required.",
      },
      {
        q: "What is Aleph One?",
        a: "Aleph One is the open-source continuation of Bungie's Marathon 2 engine, maintained since Bungie released the source code in 2000. It adds modern resolutions, mouselook, OpenGL rendering and network play, and is what makes the games run on current machines.",
      },
      {
        q: "Should I play Marathon 1 first?",
        a: "Not necessarily. Marathon 2 is the usual starting point — it is the strongest of the three and its story stands on its own. The first game is also free if you want the full arc afterwards.",
      },
      {
        q: "Does it work on modern Windows, Mac and Linux?",
        a: "Yes, with native builds for all three, including Apple Silicon. There is no emulator or compatibility layer involved.",
      },
      {
        q: "Is there still multiplayer?",
        a: "Yes, Aleph One supports internet and LAN play, though the population is small and organised through community channels rather than matchmaking. Treat this as a single-player game with multiplayer available, not the other way round.",
      },
      {
        q: "Can I play it on Steam Deck?",
        a: "Yes. It is extremely light on hardware and works well with a gamepad configuration, though a mouse remains the better way to aim.",
      },
    ],
  },
  "marathon-2": {
    qualityBar: clearsAll(
      "Bungie's cerebral sci-fi masterpiece, delivering razor-sharp terminal lore, chilling rogue AI philosophy from Durandal, and dual-shotgun combat that shaped the DNA of modern first-person shooters."
    ),
    maintenanceCheck: { kind: "github", repo: "Aleph-One-Marathon/alephone" },
    longDescription:
      "Before Halo, Bungie made Marathon — and Marathon 2 is the one people still argue about.\n\nReleased in 1995 for the Mac, it arrived while Doom was defining what a shooter was, and quietly disagreed with most of it. Doom gave you a wordless marine and a body count. Marathon 2 gave you terminals: screens scattered through every level carrying thousands of words of story from an artificial intelligence called Durandal, who is manipulative, funny, self-aware and slowly going insane. You are working for him. It is not clear you should be.\n\nThe design disagrees in mechanical ways too. You can swim. You can look up and down properly. Levels have objectives beyond reaching the exit — rescuing trapped crew, activating systems, exploring backwards — and they expect you to read the terminals to know what you are doing. Enemies coordinate. Ammunition is scarce enough to matter. It is slower and more deliberate than its contemporaries, and it rewards patience in a way 1995 shooters generally did not.\n\nAleph One is what keeps it alive. Bungie released the engine source in 2000, and the project has maintained it ever since: modern resolutions and widescreen, OpenGL rendering, mouselook, gamepad support, internet multiplayer and native Windows, macOS and Linux builds. Bungie also allowed the complete game data to be distributed free, so the download is the whole thing — engine and game together, no purchase, no store, no hunting for files.\n\nThe honest caveat is that this is a genuinely old game underneath. The textures are low-resolution, enemies are sprites, and level geometry can be maze-like in a way modern shooters trained you out of. If you need a map that holds your hand, this will frustrate you. If you want to see where a lot of modern sci-fi shooter writing actually came from, it is right here, complete, for free.",
    whyWePickedIt:
      "Most free classics are free because nobody wanted them. Marathon 2 is free because Bungie chose to release it, and it happens to contain some of the best writing in the genre's history — an AI narrator that games spent the next twenty years imitating badly. That it now installs in one click with mouselook and widescreen, rather than requiring an emulator and a prayer, is the entire reason preservation projects matter.",
    bestFor: [
      "Anyone interested in where Halo, and Bungie's writing, actually came from",
      "Players who like story delivered through reading and exploration",
      "Deliberate, resource-conscious shooting rather than constant action",
      "Very low-spec machines — it runs on essentially anything",
      "Mac and Linux players, who get first-class native builds",
    ],
    notFor: [
      "Players who want modern visuals; this is 1995 sprite art at heart",
      "Anyone who dislikes maze-like level design or backtracking",
      "Those who skip text — most of the story lives in optional terminals",
      "People looking for a populated multiplayer scene rather than a campaign",
    ],
    comparableTo: ["Halo", "Doom", "System Shock", "Quake", "Duke Nukem 3D"],
    installSteps: [
      {
        platform: "all",
        text: "Install through PlayBound, or download the Marathon 2 package from the Aleph One site. The download includes both the engine and the full game.",
      },
      {
        platform: "all",
        text: "Turn on mouselook in Preferences → Controls if it is not already enabled. The default control scheme dates from 1995 and is not what you want.",
      },
      {
        platform: "all",
        text: "Read the terminals. They are not optional flavour — objectives and story are both delivered through them.",
      },
      {
        platform: "macos",
        text: "The Mac build is unsigned, so the first launch needs a right-click and Open rather than a double-click.",
      },
    ],
    faq: [
      {
        q: "Is Marathon 2 really free?",
        a: "Yes. Bungie permitted the Marathon trilogy's game data to be distributed at no cost, and the Aleph One engine that runs it is open source under the GPL. The download includes both — there is nothing to buy and no original copy required.",
      },
      {
        q: "What is Aleph One?",
        a: "Aleph One is the open-source continuation of Bungie's Marathon 2 engine, maintained since Bungie released the source code in 2000. It adds modern resolutions, mouselook, OpenGL rendering and network play, and is what makes the games run on current machines.",
      },
      {
        q: "Should I play Marathon 1 first?",
        a: "Not necessarily. Marathon 2 is the usual starting point — it is the strongest of the three and its story stands on its own. The first game is also free if you want the full arc afterwards.",
      },
      {
        q: "Does it work on modern Windows, Mac and Linux?",
        a: "Yes, with native builds for all three, including Apple Silicon. There is no emulator or compatibility layer involved.",
      },
      {
        q: "Is there still multiplayer?",
        a: "Yes, Aleph One supports internet and LAN play, though the population is small and organised through community channels rather than matchmaking. Treat this as a single-player game with multiplayer available, not the other way round.",
      },
      {
        q: "Can I play it on Steam Deck?",
        a: "Yes. It is extremely light on hardware and works well with a gamepad configuration, though a mouse remains the better way to aim.",
      },
    ],
  },

  keeperfx: {
    qualityBar: {
      /*
       * Not genuinelyFree: KeeperFX itself is GPL, but it cannot run without
       * Dungeon Keeper data that has to be bought. Marking this true because
       * the patch is free would misrepresent what a player actually needs to
       * spend to play, which is the one thing this checklist exists to answer.
       */
      genuinelyFree: false,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The definitive modernization of Bullfrog's villainous management sim, giving you full evil command over imps, bile demons, and trapped heroes with modern widescreen and smart creature AI.",
      lastVerified: VERIFIED,
    },
    maintenanceCheck: { kind: "github", repo: "dkfans/keeperfx" },
    longDescription:
      "Dungeon Keeper asked a question most strategy games still avoid: what if you were the dungeon at the bottom of the map, and the heroes were the problem?\n\nYou dig out rooms, build a treasury and a lair, and lure imps, bile demons, dark mistresses and horned reapers into working for you. You slap them when they slack off. You torture captured heroes until they change sides. It is funny in a genuinely mean-spirited way, narrated by a voice that clearly enjoys your worst decisions, and the management underneath it is sharper than the humour suggests — creatures have needs, moods and grudges, and a dungeon that ignores them falls apart from the inside.\n\nKeeperFX is what makes it playable now. Rather than wrapping the 1997 binary in DOSBox, the project has spent over fifteen years replacing that binary function by function with maintained C code. The result runs natively on modern Windows at modern resolutions, with a rewritten creature AI, a working campaign editor, restored cut content, multiplayer, and a large library of fan-made campaigns that in several cases exceed the original in design quality.\n\nThe catch, and the reason this entry does not clear our first criterion, is that KeeperFX is a rebuild of the engine and not a replacement for the content. It needs Dungeon Keeper's original data files — levels, sprites, the voice acting — and those are still commercial. A GOG copy is inexpensive and goes on sale often, and an original CD works equally well, but you do have to own one. PlayBound will not distribute those files, so the launcher asks you to point at your own installation and overlays KeeperFX onto a copy of it.\n\nIf you already own Dungeon Keeper in any form, this is unambiguously the best way to play it. If you do not, factor in the cost of the base game before starting.",
    whyWePickedIt:
      "We list a lot of remakes that replace their originals outright, and KeeperFX deliberately does not — it rebuilds the engine and leaves the content alone, which is why it is still going after fifteen years while flashier projects stalled. It is also the clearest case in the catalog of a title we rate highly but cannot call free, and saying so plainly is more useful than quietly bending the definition.",
    bestFor: [
      "Anyone who already owns Dungeon Keeper on GOG or CD",
      "Players who like management sims with a mean streak",
      "Fans of the fan-campaign scene, which is large and still active",
      "Modern Windows machines where the original refuses to behave",
    ],
    notFor: [
      "Players unwilling to buy the original game, which is required",
      "Anyone wanting Dungeon Keeper 2 — that is OpenKeeper, a separate project",
      "Mac and Linux users, unless you are comfortable running it through Wine",
      "Those after a gentle builder; this one expects you to be actively cruel",
    ],
    comparableTo: ["Dungeon Keeper", "Dungeons 3", "War for the Overworld", "Evil Genius", "Startopia"],
    installSteps: [
      {
        platform: "windows",
        text: "Install or locate your own copy of Dungeon Keeper first — the GOG release or an original CD both work.",
      },
      {
        platform: "windows",
        text: "Start the KeeperFX install in PlayBound. It will ask you to point at that copy, then build a separate KeeperFX install from it, leaving your original untouched.",
      },
      {
        platform: "windows",
        text: "Launch KeeperFX and set your resolution in the launcher window. It defaults conservatively and there is no reason to stay there.",
      },
      {
        platform: "windows",
        text: "Play the original campaign first. The fan campaigns assume you already know the systems and several are considerably harder.",
      },
    ],
    faq: [
      {
        q: "Is KeeperFX free?",
        a: "The project itself is free and open source, but it is not a complete game on its own — it needs Dungeon Keeper's original data files, which are commercial. You will need a GOG copy or an original CD, so playing it is not free overall.",
      },
      {
        q: "Do I need the original Dungeon Keeper?",
        a: "Yes. KeeperFX rebuilds the engine, not the content — the levels, artwork and audio all come from your own copy. PlayBound does not distribute those files.",
      },
      {
        q: "Does KeeperFX work with the GOG version?",
        a: "Yes, the GOG release is the most straightforward source. An original CD install works too, as does the copy EA gave away during its On the House promotion if you claimed it at the time.",
      },
      {
        q: "Is this Dungeon Keeper 1 or 2?",
        a: "The first one. Dungeon Keeper 2 has a separate reimplementation called OpenKeeper, which is a different project at an earlier stage.",
      },
      {
        q: "What does KeeperFX add over the original?",
        a: "Native modern Windows support, high resolutions, a substantially reworked creature AI, restored cut content, a campaign editor, multiplayer fixes, and support for a large library of fan-made campaigns.",
      },
      {
        q: "Can I run KeeperFX on Linux or macOS?",
        a: "There is no native build; it targets Windows. It generally runs well under Wine or Proton, including on Steam Deck, but that is community territory rather than something the project supports directly.",
      },
    ],
  },

  "dungeon-keeper-gold": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "You run the dungeon, slap the imps, and convert the heroes while a narrator enjoys every bad decision — the original Bullfrog campaign and Deeper Dungeons, still a complete nasty management sim.",
      lastVerified: "2026-08-18",
    },
    longDescription:
      "Dungeon Keeper Gold is the 1998 compilation of Bullfrog's dungeon-management sim: the original 1997 campaign plus The Deeper Dungeons, a set of harder self-contained realms. You do not drop into someone else's maze as a hero. You are the maze. Imps chip out the earth, a treasure room fills, a lair and hatchery keep the workforce alive, and the first wandering knight is a body to slap, cage, and talk into switching sides.\n\nThe joke is mean on purpose. Richard Ridings narrates as if he has been waiting all week for you to drop a boulder on a paladin, and the systems under that voice are tighter than the tone suggests. Creatures have appetites, wages, and grudges. A dungeon that trains nothing but warlocks still starves if nobody is eating. A Horned Reaper left idle will take the place apart from the inside. Rooms have jobs: the library researches spells, the workshop builds traps and doors, the temple and graveyard unlock the nastier recruits. You look down in isometric, pick units up with a hand, and slap them when they slack off. It is a management game that wants you to enjoy being cruel, and it does not pretend otherwise.\n\nGold is how most people buy this now. On GOG and Steam the compilation runs through DOSBox, which is enough to finish both campaigns on a current PC. It is a complete product — no live-service shop, no season pass, no second purchase to finish the story. It is not a full replica of every 1998 retail extra. The digital Gold build does not include the Windows level editor, the Direct3D executable, or the desktop theme that came in some boxes. What you get is the game and the expansion, which is what you actually play.\n\nPlayBound lists this separately from KeeperFX on purpose. This page is the commercial compilation: the legal data, the original campaigns, the DOSBox wrapper the stores ship. KeeperFX is a fan-made engine rebuild that needs those files and then replaces the 1997 binary with maintained code, widescreen, and a much sharper creature AI. If you already own Gold and you want that modernisation, use the KeeperFX listing and overlay it. If you want the original Gold experience as sold, stay here. Do not treat the two pages as the same download.\n\nPrice is the other honest part. Dungeon Keeper Gold is not freeware. It is a paid 1990s strategy game that usually sits well under PlayBound's $15 ceiling, with nothing predatory hanging off it. That clears worth-the-cost. It is not a free game, and calling it one would make the KeeperFX entry a lie too.",
    whyWePickedIt:
      "We keep a lot of 1990s strategy alive by pointing at fan rebuilds. Dungeon Keeper still needs a commercial copy, and Gold is the copy most people can actually buy today — campaign, expansion, done. Listing it as its own VALUE title means we can say what you are paying for without pretending KeeperFX is a complete free game, and without sending someone who wanted the original compilation into an engine overlay they did not ask for.",
    bestFor: [
      "Players who want the original Bullfrog campaign and Deeper Dungeons in one purchase",
      "Anyone fine with a DOSBox classic rather than a fan rebuild",
      "Management-sim fans who want to play the villain, not the hero",
      "People looking for a complete game under $15 with no live-service hooks",
    ],
    notFor: [
      "Anyone expecting native widescreen and rebuilt AI — that is KeeperFX, listed separately",
      "Players who want Dungeon Keeper 2",
      "Anyone unwilling to buy a 1990s game, even cheaply",
      "People who bounce off DOS-era interfaces and low resolutions",
    ],
    comparableTo: ["War for the Overworld", "Dungeons 3", "Evil Genius", "Startopia"],
    installSteps: [
      {
        platform: "all",
        text: "Buy Dungeon Keeper Gold from the purchase link on this page. GOG is the usual source; Steam also sells the same compilation.",
      },
      {
        platform: "all",
        text: "Install it through that store's app (GOG Galaxy or Steam) and launch the Gold build. Digital Gold runs in DOSBox — that is expected, not a broken install.",
      },
      {
        platform: "all",
        text: "Play the original campaign first. The Deeper Dungeons levels are harder, unordered, and assume you already know the rooms and creatures.",
      },
      {
        platform: "all",
        text: "If you want native widescreen and the rebuilt creature AI after you own this, that is KeeperFX — a separate PlayBound listing that overlays a new engine on these files. It does not replace this page.",
      },
    ],
    faq: [
      {
        q: "Is Dungeon Keeper Gold free?",
        a: "No. It is a paid compilation of Dungeon Keeper and The Deeper Dungeons. It usually costs well under $15, with no extra shop or paywalled campaign, which is why it still clears PlayBound's worth-the-cost bar — but it is not freeware.",
      },
      {
        q: "What is included in Dungeon Keeper Gold?",
        a: "The original 1997 campaign and The Deeper Dungeons expansion. The current GOG and Steam builds run through DOSBox and do not include the 1998 CD's Windows level editor, Direct3D executable, or desktop theme.",
      },
      {
        q: "Is this Dungeon Keeper 1 or 2?",
        a: "The first game. Dungeon Keeper 2 is a sequel with a different engine; its fan reimplementation is OpenKeeper, not this listing and not KeeperFX.",
      },
      {
        q: "Do I need KeeperFX to play Dungeon Keeper Gold?",
        a: "No. Gold is a complete game on its own via DOSBox. KeeperFX is an optional fan engine that uses these data files for modern resolutions and AI. PlayBound lists it separately so the two downloads are not confused.",
      },
      {
        q: "Does Dungeon Keeper Gold run on a modern PC?",
        a: "Yes. The store builds wrap the original executable in DOSBox, which is how GOG and Steam ship it. It is playable today; it will not look or control like a 2020s strategy game unless you add KeeperFX.",
      },
      {
        q: "Can I use this copy with KeeperFX?",
        a: "Yes. KeeperFX needs a legal Dungeon Keeper install, and a GOG or Steam Gold copy is the straightforward source. Install Gold first, then follow the KeeperFX page — PlayBound does not mix the two installs on this listing.",
      },
    ],
  },

  "space-station-14": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "An unmatched open-source social sandbox where complex atmospheric physics, hilarious station sabotage, and emergent player-driven workplace chaos make every round unforgettable.",
      lastVerified: VERIFIED,
    },
    maintenanceCheck: { kind: "github", repo: "space-wizards/space-station-14" },
    longDescription:
      "Space Station 13 has been the best game nobody can play for twenty years. It runs on BYOND, an engine from 1996, and its interface assumes you already know everything. Space Station 14 is the attempt to keep what made it extraordinary and throw away the part that kept people out.\n\nA round begins with the crew arriving on a station. You are assigned a job — engineer, botanist, security officer, chef, janitor, clown — and you go and do it. The engineers actually start the reactor, and if they do it badly the station loses power. The chef actually cooks, using food the botanist actually grew. The doctors treat injuries that have specific causes, on a body with individually damageable parts. Nothing is abstracted into a progress bar.\n\nMeanwhile, somebody has been quietly told they are a traitor.\n\nWhat makes it work is that the simulation is honest. Atmospherics tracks gas composition, temperature and pressure per tile, so a hull breach is a real physical event that spreads. Power is a network you can trace and sabotage. Because the systems are consistent rather than scripted, players invent things the developers never planned — and the resulting stories are the actual product. A round can be a quiet shift where the biggest crisis is a plumbing failure, or it can end with the station on fire and the surviving crew arguing over who to trust in the escape shuttle.\n\nIt is round-based, which matters more than it sounds. Nothing carries over. There is no account progression, no unlocks, no gear score — the newest player and the veteran start each round on equal footing, and status comes entirely from competence and reputation. That design is why it stays interesting after a hundred hours and why it has no monetisation to speak of.\n\nThe honest warning: this is not a game you drop into for fifteen minutes. Rounds run one to two hours, jobs have real learning curves, and the community expects you to stay in character. Most servers have new-player-friendly rules and will tolerate a lot of fumbling — but pick a job like Cargo Technician or Botanist for your first few rounds rather than Head of Security.",
    whyWePickedIt:
      "We put a lot of preservation projects in this catalog, and most of them are careful recreations of something that already worked. Space Station 14 is doing something harder — taking a genuinely great design trapped in an unusable engine and rebuilding it so that ordinary people can reach it. It is also the clearest example we have of a game where the interesting part is other players rather than content, which is exactly the kind of thing that dies when nobody is running free servers.",
    bestFor: [
      "Players who want stories that emerge rather than stories that are written",
      "Anyone curious about Space Station 13 who bounced off the BYOND client",
      "Long sessions — rounds typically run one to two hours",
      "People who enjoy roleplay and being in character with strangers",
      "Modest hardware; it is 2D and undemanding",
    ],
    notFor: [
      "Short sessions — you cannot meaningfully play this in fifteen minutes",
      "Anyone who wants persistent progression, unlocks or a gear treadmill",
      "Players who dislike reading, learning systems, or asking other people for help",
      "Solo play, since an empty station has essentially nothing to do",
    ],
    comparableTo: ["Space Station 13", "Barotrauma", "Among Us", "Rimworld", "Dwarf Fortress"],
    installSteps: [
      {
        platform: "all",
        text: "Install the Space Station 14 launcher through PlayBound, or download it from the official site.",
      },
      {
        platform: "all",
        text: "Create a Space Station 14 account in the launcher. It is free and is only used to identify you to servers.",
      },
      {
        platform: "all",
        text: "Pick a server from the launcher's list. The matching game build downloads automatically the first time you join, so the first connection is slower than later ones.",
      },
      {
        platform: "all",
        text: "Choose a low-pressure job for your first round — Botanist, Cargo Technician or Janitor. Avoid command and security roles until you know the station.",
      },
      {
        platform: "linux",
        text: "Mark the launcher binary executable if your desktop environment does not do it for you.",
        command: "chmod +x SS14.Launcher",
      },
    ],
    faq: [
      {
        q: "Is Space Station 14 free?",
        a: "Yes, entirely. The game and engine are MIT-licensed open source, there is no purchase, subscription or in-game store, and the community servers are run by volunteers. An account is required, but it is free and exists only so servers can identify players.",
      },
      {
        q: "What is the difference between Space Station 14 and Space Station 13?",
        a: "Space Station 13 is the original, built on the BYOND engine from the 1990s. Space Station 14 is a from-scratch reimplementation on a purpose-built engine with a modern interface, better performance and native Windows, macOS and Linux clients. The design is the same; the barrier to entry is much lower.",
      },
      {
        q: "How long is a round?",
        a: "Usually one to two hours. Rounds end when the shuttle leaves or the station becomes unsurvivable, and nothing carries over to the next one — there is no progression system.",
      },
      {
        q: "Do I need to roleplay?",
        a: "On most servers, yes, at least lightly. Staying in character is a rule rather than a suggestion, and servers vary in how strictly they enforce it. Each server publishes its rules in the launcher, and low-roleplay servers exist if that is not for you.",
      },
      {
        q: "Is it hard to learn?",
        a: "The systems are deep, but you do not need to know them all. Pick a simple job, read your department's wiki page, and ask in-character questions — helping new players is part of the culture. Expect your first couple of rounds to be confusing regardless.",
      },
      {
        q: "Can I play Space Station 14 alone?",
        a: "Not meaningfully. The entire game is other people; an empty station has almost nothing to offer. You can host a local server to learn controls, but that is practice rather than play.",
      },
      {
        q: "Does it run on Steam Deck or low-end hardware?",
        a: "Yes. It is a 2D game with modest requirements and runs comfortably on a Steam Deck or an older laptop. The main constraint is that it is mouse-and-keyboard heavy, so a Deck benefits from a control layout or an external keyboard.",
      },
    ],
  },

  openra: {
    qualityBar: clearsAll(
      "OpenRA clears the PlayBound Bar: genuinely free with no monetisation, stable and complete, actively developed, good enough to recommend at full price, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Electronic Arts has spent two decades not knowing what to do with Command & Conquer. OpenRA is what happened when volunteers decided to do it properly instead.\n\nIt is not a mod and not an emulator. OpenRA is a from-scratch open-source engine that runs Tiberian Dawn, Red Alert and Dune 2000 with modern resolutions, sane pathfinding, real widescreen support and multiplayer that works without port-forwarding gymnastics. Crucially, it does not simply replicate 1995 — build queues, unit control and production behave the way you always wished they had. Veterans should expect rebalanced skirmishes rather than a pixel-perfect recreation, and that is the point.\n\nEach supported game ships as a separate mod with its own campaign, faction roster and map pool. Red Alert is the most popular starting point; Tiberian Dawn is the purist's choice. Total conversions like Combined Arms mix universes together, and the in-game map browser gives you thousands of community maps without leaving the client.\n\nWhat separates OpenRA from most preservation projects is that it is genuinely alive. There is a competitive ladder with real people on it. Map pools rotate. Balance patches ship. For a franchise whose official custodian released one remaster and went quiet, having an actively maintained, actively played version is remarkable.\n\nAt roughly 350 MB it installs in minutes and runs on essentially any laptop made in the last fifteen years. There is no account requirement, no launcher telemetry and no store.",
    whyWePickedIt:
      "Most classic-RTS revivals are nostalgia projects that stall out at 'technically playable'. OpenRA went the other way — it fixed the things the originals got wrong, kept everything they got right, and then built a competitive scene on top. It is the rare preservation effort that is better than the thing it preserves, and it costs nothing.",
    bestFor: [
      "Anyone who grew up on Command & Conquer or Red Alert",
      "Short, decisive matches rather than hour-long build-ups",
      "Competitive 1v1 with a real ladder and ranking",
      "Old or low-spec laptops — 350 MB and very light on hardware",
      "LAN parties, with no accounts or internet needed",
    ],
    notFor: [
      "You want a pixel-perfect recreation — unit control is deliberately modernised",
      "You prefer slow, economy-heavy strategy; matches here can end in minutes",
      "You want a single-player-only experience, since the community is the main draw",
      "You are looking for modern 3D visuals rather than updated sprite art",
    ],
    comparableTo: ["Command & Conquer", "Red Alert", "Dune 2000", "Tiberian Sun"],
    faq: [
      {
        q: "Is OpenRA free?",
        a: "Yes, completely. OpenRA is open-source under GPL-3.0 with no purchase, subscription, in-game currency or advertising. The original game assets it uses were released as freeware by Electronic Arts, so the whole package is legal and free.",
      },
      {
        q: "Is OpenRA legal?",
        a: "Yes. OpenRA is a clean-room reimplementation of the game engine, and the Command & Conquer and Red Alert assets it downloads were officially released as freeware by Electronic Arts. Nothing is pirated.",
      },
      {
        q: "Which OpenRA mod should I start with?",
        a: "Red Alert. It has the largest player base, the most active ladder and the most familiar faction design. Tiberian Dawn is the closer recreation of the 1995 original if that is what you are after.",
      },
      {
        q: "Does OpenRA have single-player campaigns?",
        a: "Yes. Each mod includes the original campaign missions alongside skirmish mode against AI opponents of varying difficulty. You never need to play online.",
      },
      {
        q: "Is OpenRA still active in 2026?",
        a: "Yes. Development continues, balance patches ship regularly, and the multiplayer ladder has an ongoing population. Live server and player counts are shown on the OpenRA servers page.",
      },
      {
        q: "Can I play OpenRA on Steam Deck?",
        a: "Yes. OpenRA runs on the Steam Deck, though it is a mouse-driven RTS so a trackpad or external mouse gives a much better experience than the sticks.",
      },
      {
        q: "How is OpenRA different from the C&C Remastered Collection?",
        a: "The Remastered Collection is a paid product that upgrades the original graphics while keeping the original engine behaviour. OpenRA is free and rewrites the engine, modernising unit control, pathfinding and multiplayer — a different design philosophy rather than a cheaper version of the same thing.",
      },
      {
        q: "Why can't friends join my OpenRA game / why doesn't my server show up?",
        a: "OpenRA lists a game only after the master server can reach your PC on UDP 1234. That fails on many home routers, campus Wi-Fi, and CGNAT. Joining someone else's listed server never needs a port forward. If you host from home, PlayBound turns on OpenRA's built-in UPnP so most consumer routers open the port automatically. Creating a PlayBound party starts a dedicated room on PlayBound's public server — everyone connects outbound, no port forward. There is no in-engine relay.",
      },
    ],
  },

  freedoom: {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The premier open-source boomer shooter package, combining two full-length retro FPS campaigns, blistering deathmatch arenas, and total compatibility with thirty years of community Doom WADs.",
      lastVerified: "2026-08-15",
    },
    longDescription:
      "When id Software open-sourced the classic Doom source code in 1997, they left behind a puzzle: the code was free, but the game data (IWADs containing levels, sounds, music, and sprites) remained proprietary. Freedoom was created to solve that puzzle completely.\n\nFreedoom provides a complete, 100% free-software replacement for Doom's data assets. It includes three distinct games in one package: Freedoom: Phase 1 (four distinct 9-level episodes inspired by classic episodic FPS design), Freedoom: Phase 2 (a massive continuous 32-level campaign), and FreeDM (a dedicated 32-level fast-paced arena deathmatch suite).\n\nOn PlayBound, Freedoom is paired directly with GZDoom, the premier modern source port. This means you don't just get raw 90s pixels — you get uncapped frame rates, widescreen and ultrawide support, true mouselook, dynamic lighting, hardware-accelerated OpenGL/Vulkan rendering, and native controller support without needing any configuration files or command-line setup.\n\nBecause Freedoom matches standard Doom IWAD specifications, it is also a gateway to thirty years of custom community WADs, total conversions, and mods like Brutal Doom, Project Brutality, and thousands of custom level sets.",
    whyWePickedIt:
      "Freedoom proves that legendary fast-paced boomer-shooter gameplay doesn't require commercial game files or grey-market ROM downloads. With GZDoom as the engine, it delivers dozens of hours of relentless demon-slaying and map exploration in a single, perfectly packaged one-click install.",
    bestFor: [
      "Fans of classic 90s shooters like Doom, Quake, Duke Nukem 3D, and Blood",
      "Anyone who wants immediate, blistering 120+ FPS combat with modern mouselook",
      "Players wanting an open platform for playing thousands of free community WADs and mods",
      "Low-spec PCs, modern gaming rigs, and handhelds like the Steam Deck alike",
    ],
    notFor: [
      "Players looking for modern narrative-heavy, cutscene-driven FPS campaigns",
      "Those who dislike mazes, secret rooms, and keycard-hunting progression",
      "Pure id Software purists who exclusively want the original 1993 copyrighted textures",
    ],
    comparableTo: ["Doom", "Doom II", "Quake", "Duke Nukem 3D", "Blood", "Heretic", "Hexen", "DUSK", "Amid Evil"],
    faq: [
      {
        q: "Is Freedoom free and legal?",
        a: "Yes, 100%. All graphics, sound effects, music, and levels in Freedoom were created from scratch by volunteer contributors and released under the permissive BSD 3-Clause license. No proprietary Doom assets are used.",
      },
      {
        q: "What engine does PlayBound use for Freedoom?",
        a: "PlayBound bundles GZDoom, the most advanced and widely supported modern Doom source port. It includes hardware acceleration (OpenGL / Vulkan), true mouselook, dynamic lighting, high resolution support, and controller integration.",
      },
      {
        q: "What is the difference between Phase 1, Phase 2, and FreeDM?",
        a: "Phase 1 contains four 9-level episodes with distinct bosses (similar in structure to The Ultimate Doom). Phase 2 is a single sprawling 32-level campaign with continuous weapon progression (similar to Doom II). FreeDM is a dedicated 32-level multiplayer deathmatch set.",
      },
      {
        q: "Can I play custom community WADs with this install?",
        a: "Yes! Because Freedoom acts as a full replacement IWAD and GZDoom is the host engine, you can drag and drop custom PWADs or mods onto gzdoom.exe to play community maps.",
      },
      {
        q: "Does Freedoom support gamepads and controllers?",
        a: "Yes. GZDoom features native plug-and-play support for Xbox, PlayStation, and generic PC controllers with customizable deadzones and sensitivity in the options menu.",
      },
    ],
  },

  freelancer: {
    qualityBar: clearsAll(
      "Freelancer clears the PlayBound Bar: completely preserved by the community with no microtransactions, a massive 40+ hour cinematic space campaign, modernized with widescreen HD visual upgrades and TheStarport's FLUF framework, and instantly playable on modern operating systems."
    ),
    longDescription:
      "Released in 2003 by Digital Anvil and Chris Roberts, Freelancer remains one of the greatest space combat and trading games ever made.\n\nYou play as Edison Trent, a lone pilot stranded on Planet Manhattan with 500 credits and a beat-up Starflier after a catastrophic station explosion. What starts as odd jobs for the Liberty Security Force quickly spirals into a galactic conspiracy involving ancient alien artifacts, corrupt military leaders, and interstellar war across the Sirius Sector's four major houses (Liberty, Bretonia, Kusari, and Rheinland).\n\nWhat made Freelancer revolutionary — and why it still holds up today — is its intuitive mouse-flight control system, cinematic radio chatter, and living universe. Trade lanes pulse with cargo convoys, pirate factions ambush miners in dense asteroid fields, and every bar is filled with shady contacts offering rumors, faction reputation bribes, and lucrative bounty contracts.\n\nOn PlayBound, Freelancer is elevated with community-curated enhancements: the Freelancer: HD Edition visual overhaul (high-resolution textures, high-polygon ships, widescreen interface) and TheStarport's FLUF (Freelancer Universal Framework), providing crash prevention, modern 60+ FPS engine fixes, and seamless compatibility with modern Windows 10/11 systems without needing complex manual modding.",
    whyWePickedIt:
      "Freelancer is the gold standard for accessible, thrilling space combat RPGs. It captures the fantasy of being an independent pilot better than almost anything else — picking up cargo, dodging cruise disruptors in nebula clouds, and building your fortune across a vast galaxy — all running flawlessly on modern hardware.",
    bestFor: [
      "Anyone who loves space sims, dogfighting, and galaxy exploration",
      "Players wanting intuitive mouse-aim flight controls rather than complex joystick setups",
      "Fans of story-driven RPG campaigns with rich lore and memorable characters",
      "Multiplayer space dogfights and roleplay on dedicated community servers",
      "Low-spec laptops and modern gaming PCs alike",
    ],
    notFor: [
      "Players looking for ultra-hardcore Newtonian flight physics (e.g. FlightGear or Orbiter)",
      "Those who prefer procedural infinite universes over hand-crafted star systems",
      "Gamers who demand modern ray-traced lighting over stylized early-2000s sci-fi aesthetics",
    ],
    comparableTo: [
      "Star Citizen",
      "Elite Dangerous",
      "Everspace 2",
      "Rebel Galaxy Outlaw",
      "Wing Commander: Privateer",
      "X4: Foundations",
    ],
    faq: [
      {
        q: "Is Freelancer free to play?",
        a: "Yes. Freelancer is abandonware (originally published by Microsoft in 2003 and no longer sold on modern digital stores). The global fan community at The Starport maintains the game files, patches, and master servers for free preservation.",
      },
      {
        q: "Does Freelancer run on Windows 10 and Windows 11?",
        a: "Yes. The PlayBound install includes essential modern widescreen patches, no-CD fixes, and TheStarport's FLUF framework to ensure rock-solid stability and high-framerate support on modern Windows versions.",
      },
      {
        q: "What is FLUF (Freelancer Universal Framework)?",
        a: "FLUF is a modern open-source framework hosted on Codeberg by TheStarport. It provides enhanced memory management, crash prevention (CrashWalker), modern ImGui overlay support, and seamless module loading for the Freelancer engine.",
      },
      {
        q: "How do controls work in Freelancer?",
        a: "Freelancer pioneered fluid mouse-driven flight controls. Your ship steers towards your mouse cursor with weapon reticle tracking, while keyboard keys handle throttle, thrusters, cruise engines, and countermeasures. No flight stick is required.",
      },
      {
        q: "Is multiplayer still active?",
        a: "Yes! The Starport operates community master server lists that connect players to active dedicated servers running vanilla, roleplay, and custom total conversion mods.",
      },
    ],
  },

  "ur-quan-masters": {
    qualityBar: clearsAll(
      "The Ur-Quan Masters clears the PlayBound Bar: 100% free under GPL with full original assets released by the creators, an epic 40+ hour space opera campaign with full 3DO voice acting and music, Super Melee combat, and active cross-platform maintenance."
    ),
    longDescription:
      "Widely cited by game developers and critics as one of the greatest games ever made (ranking consistently alongside Chrono Trigger and Deus Ex), Star Control II: The Ur-Quan Masters is a tour-de-force of open-world space adventure, tactical ship combat, and narrative depth.\n\nIn 2002, original creators Paul Reiche III and Fred Ford (Toys for Bob) took an extraordinary step: they released the complete C source code and full 3DO multimedia assets to the fan community under the GNU GPL. The resulting open-source project, The Ur-Quan Masters (UQM), created a flawless modern port that remains 100% free of charge and completely self-contained.\n\nYou start with an ancient precursor flagship and a skeleton crew. Returning to Earth after decades in deep space, you find the human race encased under a red energy slave shield by the victorious Ur-Quan Hierarchy. To liberate Earth, you must explore a handcrafted galaxy of hundreds of stars, land planetary landers to gather exotic minerals, upgrade your flagship with advanced weapons and thrusters, and engage in diplomatic relations with over a dozen richly developed alien civilizations — from the hilariously cowardly Spathi to the ominous, dimension-shifting Orz.\n\nBeyond its sprawling story campaign, UQM includes Super Melee!, an acclaimed head-to-head combat mode where players assemble fleets of asymmetric starships (from lumbering dreadnoughts to hyper-agile interceptors) and duel in real-time gravity-warped orbital arenas.",
    whyWePickedIt:
      "The Ur-Quan Masters is the textbook example of PlayBound's mission: an all-time classic commercial masterpiece whose creators voluntarily gifted the entire game and its assets to the public as free open-source software. Its writing, humor, universe design, and space combat are as thrilling today as when it first stunned the industry.",
    bestFor: [
      "Anyone who loves deep narrative space RPGs like Mass Effect, Starfield, or Starflight",
      "Fans of open-world exploration, planet scanning, and resource gathering",
      "Gamers who appreciate witty, unforgettable alien dialogue and rich sci-fi lore",
      "Players who enjoy head-to-head tactical 2D dogfighting in Super Melee!",
      "Steam Deck and modern PC players wanting a complete self-contained classic",
    ],
    notFor: [
      "Players wanting 3D first-person cockpits (try Freelancer or Elite Dangerous instead)",
      "Those who dislike reading or dialogue-heavy branching diplomacy",
      "Gamers expecting modern waypoint markers that hold your hand across the galaxy",
    ],
    comparableTo: [
      "Mass Effect",
      "Starfield",
      "FTL: Faster Than Light",
      "Starflight",
      "Endless Sky",
      "Freelancer",
    ],
    faq: [
      {
        q: "Is The Ur-Quan Masters the full Star Control II game?",
        a: "Yes! The Ur-Quan Masters is the official open-source version of Star Control II. Original creators Paul Reiche III and Fred Ford released both the code and 3DO audio/visual assets to the community, making it 100% free and fully playable from start to finish without needing any original retail discs.",
      },
      {
        q: "What makes the PlayBound Edition special?",
        a: "The PlayBound Edition pre-configures the full UQM content package, the complete 3DO voice acting package, remastered 3DO music, official remix add-on packs (including Super Melee!), and modern gamepad controller bindings so you can jump right into hyperspace.",
      },
      {
        q: "Does UQM include voice acting?",
        a: "Yes. The legendary 3DO version introduced full voice acting for every alien race, and the UQM project includes these high-quality voice recordings alongside the game's classic and remastered soundtrack.",
      },
      {
        q: "What is Super Melee! mode?",
        a: "Super Melee! is a standalone arcade combat mode where you draft a fleet of starships and battle a friend (locally) or the AI in real-time tactical space combat with unique ship abilities, energy management, and orbital gravity wells.",
      },
      {
        q: "Does it work well on Steam Deck and modern controllers?",
        a: "Yes. UQM runs natively through modern SDL2 with full controller support, customizable button layouts, and perfect scaling for widescreen and 16:10 handheld displays.",
      },
    ],
  },

  airforce: {
    qualityBar: clearsAll(
      "AirForce clears the PlayBound Bar: 100% freeware with no microtransactions, a complete fast-paced retro vertical shoot 'em up with naval and aerial boss fights, built with the Allegro game engine, and running standalone on modern Windows."
    ),
    longDescription:
      "Inspired by the golden age of arcade shoot 'em ups like Capcom's 1942 and 1943: The Battle of Midway, AirForce delivers a classic vertical-scrolling aerial combat experience built with the venerable Allegro C game programming library.\n\nTaking to the skies in a classic Allied fighter, you must fight your way through swarms of enemy interceptors, escort bombers, and anti-aircraft gunboats stationed across tropical island straits. The game emphasizes twitch reflexes, positioning, and target prioritization.\n\nPower-ups appear throughout each mission to upgrade your fighter's capabilities, including engine speed boosts, shot velocity enhancements, and a triple-spread cannon for wiping out dense enemy waves. Featuring retro pixel art from Ari Feldman's iconic SpriteLib asset library and support for both keyboard and gamepad controllers, AirForce is a fun, nostalgic arcade shooter.",
    whyWePickedIt:
      "AirForce is a charming, pure homage to classic WWII vertical arcade shooters. It delivers instant, no-nonsense pick-up-and-play shmup action with responsive controls, fun power-up progression, and nostalgic pixel art.",
    bestFor: [
      "Fans of classic 80s and 90s vertical arcade shmups like 1942, 1943, and Raiden",
      "Players wanting quick, focused arcade gaming sessions",
      "Anyone who enjoys retro pixel-art aviation aesthetics",
      "Low-spec laptops, handhelds, and legacy PCs",
    ],
    notFor: [
      "Players looking for ultra-dense modern bullet hell danmaku games like Touhou",
      "Those who prefer 3D flight simulators with realistic aerodynamics",
      "Gamers seeking multi-hour RPG narratives or voice-acted cutscenes",
    ],
    comparableTo: [
      "1942",
      "1943: The Battle of Midway",
      "Strikers 1945",
      "Raiden",
      "TwinBee",
      "Sky Force",
    ],
    faq: [
      {
        q: "What game is AirForce inspired by?",
        a: "AirForce was inspired by Capcom's 1984 arcade classic 1942, featuring vertical-scrolling WWII airplane dogfights, island military outposts, and power-up upgrades.",
      },
      {
        q: "How do power-ups work?",
        a: "Defeating specific enemy waves releases power-up icons that enhance your fighter. Upgrades include Speed Boosts, Shot Power, Shot Rate increases, and a 3-way Spread Shot level.",
      },
      {
        q: "Does AirForce support controllers and gamepads?",
        a: "Yes. AirForce includes built-in support for both keyboard arrow controls and standard USB/DirectInput gamepads and joysticks.",
      },
      {
        q: "What technology powers AirForce?",
        a: "AirForce was programmed in C using the open-source Allegro game programming library and utilizes classic pixel art from Ari Feldman's SpriteLib.",
      },
    ],
  },

  bzflag: {
    qualityBar: clearsAll(
      "BZFlag clears the PlayBound Bar: 100% free and open-source under the LGPL with no microtransactions, three decades of continuous development, instant online multiplayer tank warfare, over 40 super-flags, and cross-platform native support."
    ),
    longDescription:
      "First created in 1992 by Chris Schoeneman and continuously developed by an open-source community for over thirty years, BZFlag (Battle Zone capture the Flag) is one of the most enduring and beloved multiplayer indie games ever made.\n\nIn BZFlag, players control nimble 3D hover tanks in fast-paced arena combat. While the core objective is classic team Capture the Flag (infiltrate enemy territory, seize their team flag, and return it safely to your base), BZFlag elevates the formula with its physics and flag powers.\n\nTanks can jump over obstacles and deflect shots off walls with precision ricochet geometry. Across the map, players can capture over 40 different super-flags granting unique active abilities — such as Guided Missiles, Penetrating Lasers, Cloaking, Shockwaves, Steamrollers, Super Speed, and even Wings for aerial dogfighting. Alongside CTF, servers run Free-for-All, Rabbit Chase (one rabbit tank hunted by the entire server), and open capture-the-flag modes with community maps and custom physics settings.",
    whyWePickedIt:
      "BZFlag is an open-source multiplayer monument. It combines lightning-fast arcade tank controls, creative superpower flags, and thirty years of passionate community server hosting into an infinitely replayable free classic.",
    bestFor: [
      "Anyone who loves fast-paced multiplayer arena combat and Capture the Flag",
      "Fans of arcade vehicular combat, ricochet physics, and tank battles",
      "Gamers looking for lightweight games that run at hundreds of FPS on literally any PC",
      "Communities wanting to host their own dedicated servers with custom rules and maps",
    ],
    notFor: [
      "Players wanting slow, ultra-realistic modern military tank sims (e.g. War Thunder)",
      "Gamers seeking singleplayer cinematic story campaigns",
      "Those who dislike fast-paced twitch reflexes and jumping tanks",
    ],
    comparableTo: [
      "Battlezone",
      "Scorched 3D",
      "Armagetron Advanced",
      "Tanki Online",
      "Tremulous",
      "Xonotic",
    ],
    faq: [
      {
        q: "What is BZFlag?",
        a: "BZFlag (Battle Zone capture the Flag) is a free, open-source 3D first-person tank battle game originally created in 1992. It is known for its fast-paced capture-the-flag matches, jumping tanks, and superpower flags.",
      },
      {
        q: "How do super-flags work?",
        a: "Throughout the battlefield, super-flags grant your tank game-changing powers. Good flags include Guided Missiles, Lasers, Cloaking, Wings, and Shields. Watch out for 'bad flags' like Blindness or Momentum that add hilarious risk/reward mechanics.",
      },
      {
        q: "Can I play online with other players?",
        a: "Yes. BZFlag features a built-in global server browser that lists active community servers worldwide. You can join games instantly without creating an account.",
      },
      {
        q: "Can I host my own server or create maps?",
        a: "Yes. The BZFlag package includes `bzfs` (the BZFlag dedicated server) and support for custom map scripting with custom obstacles, teleporters, and physics zones.",
      },
    ],
  },

  "beneath-a-steel-sky": {
    qualityBar: clearsAll(
      "Beneath a Steel Sky clears the PlayBound Bar: released as 100% official freeware by Revolution Software with full CD talkie voice acting, a timeless cyberpunk story with art by Dave Gibbons, and flawless native cross-platform support via ScummVM."
    ),
    longDescription:
      "Created by Revolution Software under the direction of Charles Cecil and comic book legend Dave Gibbons (Watchmen), Beneath a Steel Sky is widely celebrated as one of the finest graphic adventure games in history.\n\nSet in a gritty, dystopian future Australia where rival megacities compete for technological dominance, you play as Robert Foster — an innocent raised by tribal nomads in the desolate outback wasteland known as The Gap. Following a brutal military raid that destroys your village, Foster is abducted and brought to the towering, class-stratified metropolis of Union City.\n\nEscaping from a burning helicopter crash in the city's upper levels, Foster must navigate a web of industrial corruption, sinister cybernetic surveillance, and the enigmatic AI ruler LINC. At your side is Joey, a customizable robot companion whose personality motherboard you can swap into different machine chassis to solve ingenious environmental puzzles. Featuring full CD talkie voice acting, Gibbons' hand-drawn aesthetic, and Revolution's pioneering Virtual Theatre engine (where NPCs walk autonomous schedules), Beneath a Steel Sky is an unforgettable cyberpunk adventure.",
    whyWePickedIt:
      "Beneath a Steel Sky is a monumental point-and-click classic that Revolution Software generously gifted to the world as official freeware. Its atmosphere, biting humor, and puzzle design remain unmatched.",
    bestFor: [
      "Fans of classic point-and-click graphic adventures like Monkey Island and Broken Sword",
      "Anyone who loves dystopian cyberpunk aesthetics, dark humor, and deep worldbuilding",
      "Comic book enthusiasts wanting to experience Dave Gibbons' visual storytelling",
      "Steam Deck and PC players wanting a self-contained story experience with full voice acting",
    ],
    notFor: [
      "Players who demand high-speed action combat over puzzle-solving and inventory deduction",
      "Those who dislike 90s pixel-art interfaces and dialogue-driven investigation",
      "Gamers seeking 3D ray-traced graphics",
    ],
    comparableTo: [
      "Broken Sword: The Shadow of the Templars",
      "The Secret of Monkey Island",
      "Full Throttle",
      "Gemini Rue",
      "Snatcher",
      "Beyond a Steel Sky",
    ],
    faq: [
      {
        q: "Why is Beneath a Steel Sky free?",
        a: "In 2003, Revolution Software made the extraordinary decision to release the complete Beneath a Steel Sky (including full CD talkie voice acting) as official freeware in partnership with the ScummVM project.",
      },
      {
        q: "Who is Dave Gibbons?",
        a: "Dave Gibbons is the legendary British comic artist who co-created Watchmen with Alan Moore. He served as the art director for Beneath a Steel Sky, creating the game's character designs, backgrounds, cutscenes, and introductory comic book.",
      },
      {
        q: "What is the Virtual Theatre engine?",
        a: "Virtual Theatre was Revolution Software's groundbreaking adventure game engine where non-player characters followed independent daily routines and wandered through the city instead of waiting statically in one room.",
      },
      {
        q: "Does it work well on modern PCs and Steam Deck?",
        a: "Yes! Running natively through ScummVM, Beneath a Steel Sky supports modern screen resolutions, save state management, trackpad/mouse controls, and gamepad bindings seamlessly.",
      },
    ],
  },

  "0ad": {
    qualityBar: {
      genuinelyFree: true,
      // Formally alpha, but continuously playable for years — a technical
      // label, not a statement about completeness in practice.
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "0 A.D. clears the PlayBound Bar. It is formally still in alpha, but it has been comfortably playable and content-complete for years, and its production values match commercial historical strategy games that charge full price.",
      lastVerified: VERIFIED,
    },
    longDescription:
      "0 A.D. is the answer to a question people ask constantly and rarely get a good response to: is there a free Age of Empires?\n\nYes, and it looks better than you expect. 0 A.D. is a historical real-time strategy game set between 500 BC and 500 AD, with more than a dozen fully realised civilisations — Athenians, Spartans, Romans, Carthaginians, Persians, Mauryans, Han Chinese and others — each with distinct units, buildings and architectural styles researched from historical sources. The art direction is genuinely impressive: this does not look like a volunteer project, it looks like a game somebody shipped.\n\nMechanically it sits squarely in the Age of Empires tradition. You gather four resources, build an economy on villager labour, advance through three phases of technology, and eventually field an army large enough to break someone's walls. Matches are long. The build-up is the point, and if you found Age of Empires II too slow you will find this slower.\n\nThe multiplayer lobby is functional and populated, though there is no ranked matchmaking service in the way OpenRA has a ladder. Where 0 A.D. genuinely excels is skirmish play against its AI, which is competent enough to be interesting, and the random map generator, which produces varied and playable terrain.\n\nThe honest caveat is the alpha label. Development has been slow and occasionally interrupted, and the project has been in alpha for over a decade. In practice this affects almost nothing — the game is stable and complete enough that the version number is closer to a philosophical position than a warning.",
    whyWePickedIt:
      "There is a specific kind of disappointment in wanting Age of Empires and finding only shallow clones. 0 A.D. is not that. The historical research is real, the art is beautiful, and the economy has the same satisfying rhythm as the game it descends from. It is the most visually accomplished free game we list, and it charges nothing.",
    bestFor: [
      "Anyone who wants Age of Empires without paying for it",
      "Long, methodical matches where the build-up matters most",
      "Skirmish play against competent AI",
      "Players who care about historical detail and architecture",
      "Anyone who wants a free game that does not look free",
    ],
    notFor: [
      "You want fast matches — games here regularly run past an hour",
      "You have limited disk space, since it is a 3 GB install",
      "You want ranked matchmaking, which has no official service",
      "You are troubled by a formal alpha label, even a long-stable one",
    ],
    comparableTo: ["Age of Empires II", "Age of Empires IV", "Rise of Nations", "Empire Earth"],
    faq: [
      {
        q: "Is 0 A.D. free?",
        a: "Yes, entirely. 0 A.D. is open-source under GPL-2.0 with no purchase, subscription or in-game spending of any kind. It is funded by donations to Wildfire Games.",
      },
      {
        q: "Is 0 A.D. finished?",
        a: "It is formally in alpha and has been for over a decade, but it is stable, feature-rich and content-complete in practice. Most players will not encounter anything that feels unfinished. The label reflects the project's own standards rather than the actual play experience.",
      },
      {
        q: "Is 0 A.D. better than Age of Empires II?",
        a: "Age of Empires II: Definitive Edition has more civilisations, a ranked matchmaking service and decades of balance refinement. 0 A.D. has better visuals in places, deeper historical detail, and costs nothing. If you already own AoE2 it remains the more polished competitive game; if you do not, 0 A.D. is a genuine alternative rather than a compromise.",
      },
      {
        q: "How many civilisations does 0 A.D. have?",
        a: "More than a dozen playable civilisations spanning 500 BC to 500 AD, including Athenians, Spartans, Macedonians, Romans, Carthaginians, Persians, Mauryans, Kushites, Gauls, Britons, Iberians, Seleucids, Ptolemies and Han Chinese.",
      },
      {
        q: "Does 0 A.D. have multiplayer?",
        a: "Yes, with an in-game lobby for finding and hosting matches. There is no official ranked ladder, but casual and organised multiplayer both happen regularly.",
      },
      {
        q: "What are 0 A.D.'s system requirements?",
        a: "A 2 GHz dual-core CPU, 4 GB of RAM and an OpenGL 2.1 GPU as a minimum, with roughly 3 GB of disk space. Large late-game battles benefit noticeably from a faster CPU.",
      },
    ],
  },

  "beyond-all-reason": {
    qualityBar: clearsAll(
      "Beyond All Reason clears the PlayBound Bar: free with no monetisation, complete and stable, under very active development, competitive with commercial large-scale RTS games, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Total Annihilation came out in 1997 and defined a genre that has been badly served ever since. Supreme Commander tried. Planetary Annihilation tried. Beyond All Reason succeeded, and it is free.\n\nBAR is a large-scale commander RTS: you start with a single engineering unit, build a streaming economy of metal and energy, and escalate to battles involving thousands of units across enormous maps. Full strategic zoom lets you pull back from individual tanks to an icon-level view of the entire theatre, which is the mechanic that makes this scale legible rather than chaotic.\n\nThe economy is the heart of it and it is deliberately unforgiving. Metal and energy stream continuously rather than accumulating in a bank, and stalling either one brings your whole production chain to a halt. Resources are spent at varying ratios depending on what you are building, so mastering the economy is a genuine skill ceiling in its own right — considerably more demanding than Supreme Commander's more forgiving model.\n\nThe multiplayer population is large and, unusually for a free game, growing. Team games of eight versus eight are common and chaotic in the best way. Matchmaking works, there is an active balance team, and the community produces a steady stream of maps.\n\nBAR shares the Recoil engine with Zero-K and much of the same underlying content, which makes the two easy to confuse. The distinction is philosophical: BAR stays close to Total Annihilation and expects you to micromanage, while Zero-K diverges and automates. Neither is better; they reward different instincts.\n\nAt 2.2 GB it is one of the larger installs we list, and it wants a reasonably modern machine when unit counts climb.",
    whyWePickedIt:
      "Very few free games can claim to be the best in their genre outright, paid competition included. This one can. Nothing currently on sale does thousand-unit commander RTS as well as Beyond All Reason does, and the fact that it is free and open-source is almost incidental to the recommendation.",
    bestFor: [
      "Total Annihilation and Supreme Commander veterans",
      "Enormous battles with thousands of units on screen",
      "Large team games — eight versus eight is common",
      "Players who enjoy economy management as a skill in itself",
      "Anyone who wants an active, growing multiplayer community",
    ],
    notFor: [
      "You dislike micromanagement — Zero-K automates far more",
      "You have a slow machine; late-game unit counts are demanding",
      "You want a story campaign, as the focus is overwhelmingly multiplayer",
      "You want a small download, since it is a 2.2 GB install",
    ],
    comparableTo: [
      "Total Annihilation",
      "Supreme Commander",
      "Planetary Annihilation",
      "Sins of a Solar Empire",
    ],
    faq: [
      {
        q: "Is Beyond All Reason free?",
        a: "Yes, entirely free and open-source. There are no purchases, no battle pass, no cosmetics for sale and no advertising. Development is funded by donations.",
      },
      {
        q: "What is the difference between Beyond All Reason and Zero-K?",
        a: "Both run on the Recoil engine and share maps and models. Beyond All Reason stays closer to Total Annihilation, with a more punishing economy and heavier reliance on player micromanagement. Zero-K deliberately diverges, with unit AI smart enough to command at a general level. BAR has the larger current player base; Zero-K has the smaller download and a Steam presence.",
      },
      {
        q: "Does Beyond All Reason have a single-player campaign?",
        a: "There is skirmish play against AI opponents, and the AI is strong enough to be worth practising against, but the game is built around multiplayer. There is no narrative campaign.",
      },
      {
        q: "What are Beyond All Reason's system requirements?",
        a: "A 3 GHz quad-core CPU, 8 GB of RAM and a dedicated GPU are realistic minimums for comfortable play. Large late-game battles are CPU-bound, so a faster processor matters more than a faster graphics card.",
      },
      {
        q: "Is Beyond All Reason on Steam?",
        a: "Beyond All Reason is distributed through its own launcher from the official site. Zero-K, its close relative, is available on Steam.",
      },
      {
        q: "How many players does Beyond All Reason have?",
        a: "It has one of the healthier populations among free open-source games, with team games filling readily at peak hours. Live server and player counts are shown on the Beyond All Reason servers page.",
      },
    ],
  },

  "zero-k": {
    qualityBar: clearsAll(
      "Zero-K clears the PlayBound Bar: free with no monetisation, mature and complete, actively maintained, genuinely excellent on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Zero-K asks a question most real-time strategy games avoid: why are you clicking so much?\n\nIt is a large-scale commander RTS built on the same Recoil engine lineage as Beyond All Reason, sharing maps, models and much underlying tech. Where the two part company is philosophy. BAR treats Total Annihilation as scripture. Zero-K treats it as a starting point, and the biggest departure is unit intelligence. Zero-K's units are smart enough to be directed rather than driven — you can order a group to attack a target while keeping their distance, or hold a line, or retreat when damaged, and they will do something sensible without babysitting. The result is a game that scales to enormous battles without turning into an ergonomics test.\n\nThe economy is more forgiving than BAR's. Metal and energy still stream, but stalling is less catastrophic and the game is more willing to let you recover from a mistake. Terrain is deformable, physics genuinely affects projectiles, and the unit roster is large and unusually varied — including a lot of designs with no equivalent anywhere else.\n\nThere is a substantial single-player campaign, which is unusual in this genre and a real advantage over BAR. It works as a long tutorial that gradually introduces the unit roster, and it is enjoyable in its own right.\n\nZero-K is the older sibling here, with a long-established player base and a Steam listing that makes it easier to find and install. At 1.3 GB it is also markedly lighter than BAR.",
    whyWePickedIt:
      "Zero-K is the thinking player's large-scale RTS. Handing over low-level control to competent unit AI sounds like a small change and turns out to be transformative — you spend your attention on strategy instead of on clicking. The single-player campaign is a genuine bonus in a genre that usually ships multiplayer and nothing else.",
    bestFor: [
      "Directing battles rather than micromanaging individual units",
      "Players who want a substantial single-player campaign in an RTS",
      "Anyone who found Supreme Commander's interface exhausting",
      "Physics-driven combat and deformable terrain",
      "A smaller install than Beyond All Reason, with a Steam option",
    ],
    notFor: [
      "You want strict Total Annihilation fidelity — BAR is the closer match",
      "You enjoy micromanagement, since much of it is deliberately automated",
      "You want the largest possible current player base",
      "You dislike a big unit roster; the variety is initially overwhelming",
    ],
    comparableTo: [
      "Total Annihilation",
      "Supreme Commander",
      "Planetary Annihilation",
      "Beyond All Reason",
    ],
    faq: [
      {
        q: "Is Zero-K free?",
        a: "Yes, entirely. Zero-K is free and open-source on both its own launcher and Steam, with no purchases, no cosmetics and no advertising.",
      },
      {
        q: "Is Zero-K or Beyond All Reason better?",
        a: "They serve different tastes. Zero-K has smarter unit AI, a more forgiving economy, a real single-player campaign and a smaller download. Beyond All Reason stays closer to Total Annihilation, demands more micromanagement, and currently has more players. If you have played neither and want less clicking, start with Zero-K.",
      },
      {
        q: "Does Zero-K have a single-player campaign?",
        a: "Yes, a substantial one, which is unusual for this genre. It gradually introduces the unit roster and works well as both a tutorial and a game in its own right.",
      },
      {
        q: "Is Zero-K on Steam?",
        a: "Yes. Zero-K is listed on Steam and is free there, with no paid content of any kind.",
      },
      {
        q: "What are Zero-K's system requirements?",
        a: "A 2.5 GHz quad-core CPU, 4 GB of RAM and a dedicated GPU handle it comfortably. Like most games in this genre, very large battles are CPU-bound.",
      },
    ],
  },

  mindustry: {
    qualityBar: clearsAll(
      "Mindustry clears the PlayBound Bar: free with no monetisation on desktop, complete and heavily content-rich, actively developed, easily good enough to sell, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Factorio famously never goes on sale and the developers have said it never will. Mindustry is the answer for everyone who wanted that itch scratched anyway, and it is not a lesser substitute — it adds something Factorio only gestures at.\n\nMindustry is a top-down factory automation game where the factory is under attack. You mine resources, run them along conveyor belts, refine them through production chains and feed the output into turrets, because waves of enemies are coming for the network you just built. That combat pressure changes how you build. In Factorio a messy layout is an aesthetic problem; in Mindustry a messy layout is a defensive liability, because throughput to your guns is what keeps you alive.\n\nMaps are bounded rather than endless, which turns the game into a series of self-contained optimisation puzzles instead of one sprawling megabase. A campaign sector is an evening rather than a month, and that structure suits people who want a defined objective and an ending. The campaign spans dozens of sectors across two planets with distinct resource sets and enemy behaviour.\n\nMultiplayer is genuinely good and free — co-op building on public servers, and a competitive PvP mode where two teams race to out-produce and then destroy each other. There is a built-in mod browser with a large library of community content, including maps, schematics and full overhauls.\n\nAt roughly 250 MB it runs on almost anything, including phones and low-end laptops. The desktop version is entirely free; the mobile store versions are the only place any payment exists.",
    whyWePickedIt:
      "Automation games usually ask for a month of your life. Mindustry gives you the same conveyor-belt satisfaction in evening-sized portions, and then makes you defend what you built — which turns out to be a better idea than it sounds. It is also one of the most polished games we list, free or otherwise.",
    bestFor: [
      "Anyone who wants Factorio's logistics without the price or the time sink",
      "Defined objectives and shorter sessions rather than endless bases",
      "Co-op building with friends, or competitive PvP factory racing",
      "Low-end hardware — around 250 MB and very undemanding",
      "Players who want combat pressure to shape their layouts",
    ],
    notFor: [
      "You want Factorio's scale and endless single world",
      "You dislike combat interrupting your optimisation",
      "You want 3D or first-person building",
      "You want deep crafting recipe trees; Mindustry's are simpler by design",
    ],
    comparableTo: ["Factorio", "Satisfactory", "Shapez", "Dyson Sphere Program"],
    faq: [
      {
        q: "Is Mindustry free?",
        a: "The desktop version on Steam, itch.io and the official site is entirely free and open-source under GPL-3.0, with no purchases or advertising. The iOS and Android store listings are paid, which is the only place money changes hands.",
      },
      {
        q: "Is Mindustry like Factorio?",
        a: "The core loop is very similar — conveyor logistics, resource chains and throughput optimisation. The differences are that Mindustry is top-down 2D, uses bounded maps rather than one endless world, and makes combat central rather than incidental. Sessions are much shorter as a result.",
      },
      {
        q: "Does Mindustry have multiplayer?",
        a: "Yes, both co-op and competitive PvP, on free public servers or your own. Multiplayer costs nothing and requires no account.",
      },
      {
        q: "How big is Mindustry?",
        a: "Around 250 MB, which makes it one of the smaller games in the catalog. It runs comfortably on old laptops and low-end hardware.",
      },
      {
        q: "Is Mindustry good for beginners to automation games?",
        a: "It is one of the better entry points. Bounded maps and a guided campaign introduce concepts gradually, and a failed sector costs you an evening rather than a month of progress.",
      },
      {
        q: "Can I mod Mindustry?",
        a: "Yes. There is a built-in mod browser with a large community library covering maps, schematics, new content and full overhauls, installable without leaving the game.",
      },
    ],
  },

  openttd: {
    qualityBar: clearsAll(
      "OpenTTD clears the PlayBound Bar: free with no monetisation, exceptionally complete after two decades of refinement, still actively developed, better than the commercial game it descends from, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "OpenTTD has been in continuous development since 2004. That is not a footnote — it is the whole reason to play it. Very few games of any kind have had twenty-two years of uninterrupted refinement, and it shows in a hundred small places.\n\nThe premise is Transport Tycoon Deluxe: build a transport network of trains, road vehicles, ships and aircraft, connect the towns and industries on the map, and grow a company by moving cargo and passengers profitably. You do not zone residential districts like Cities: Skylines — the towns already exist, and they grow when you serve them well. Signalling, route planning and network throughput are the real game, and they go far deeper than the cheerful presentation suggests.\n\nWhat the open-source rebuild added is enormous. Maps up to 4096 by 4096 tiles. Multiplayer for dozens of simultaneous players. A completely reworked interface. And BaNaNaS, an in-game content service that downloads new vehicle sets, industry chains, AI opponents, town-name generators and scenarios directly into the client — a library so large you could play a different-feeling game every month for a year.\n\nThe honest warning is that OpenTTD is a time sink of unusual severity. The interface is dense, the systems are deep, and 'one more year' is a phrase people say at four in the morning. It is also visually modest by default, though the graphics replacement sets available through BaNaNaS address that if it bothers you.\n\nAt 200 MB it runs on anything, including hardware you were about to throw away.",
    whyWePickedIt:
      "Twenty-two years of continuous development on a game that was already great produces something genuinely singular. OpenTTD is deeper than almost any commercial management game currently on sale, has a content library nothing else can match, and installs in 200 MB. It is the strongest argument we know for what open-source stewardship does for a game over time.",
    bestFor: [
      "Logistics and network optimisation as an end in itself",
      "Very long campaigns — a single game can last months",
      "Multiplayer with a group building one network together",
      "Old or very low-spec hardware",
      "Anyone who wants a vast library of official add-on content",
    ],
    notFor: [
      "You want city building and zoning rather than transport networks",
      "You dislike dense interfaces with a steep initial learning curve",
      "You want modern 3D visuals out of the box",
      "You want short sessions; this game does not respect your evening",
    ],
    comparableTo: [
      "Transport Tycoon Deluxe",
      "Cities: Skylines",
      "Transport Fever",
      "Railroad Tycoon",
    ],
    faq: [
      {
        q: "Is OpenTTD free?",
        a: "Yes, entirely. OpenTTD is open-source under GPL-2.0 with no purchases, subscriptions or advertising. The free base graphics set means you no longer need the original Transport Tycoon Deluxe files.",
      },
      {
        q: "Do I need to own Transport Tycoon Deluxe to play OpenTTD?",
        a: "No. OpenTTD ships with its own free graphics, sound and music sets, so it is a complete standalone game. You can use the original files if you own them, but it is not required.",
      },
      {
        q: "Is OpenTTD still being updated?",
        a: "Yes. OpenTTD has been in continuous development since 2004 and continues to receive regular releases, making it one of the longest continuously maintained games in existence.",
      },
      {
        q: "What is BaNaNaS in OpenTTD?",
        a: "BaNaNaS is the official in-game content service. It lets you download vehicle sets, industry chains, AI opponents, scenarios, heightmaps and graphics replacements directly inside the game, from a very large community library.",
      },
      {
        q: "Does OpenTTD have multiplayer?",
        a: "Yes, supporting dozens of simultaneous players on public or private servers, either cooperating on one company or competing as rivals. Live server and player counts are shown on the OpenTTD servers page.",
      },
      {
        q: "How is OpenTTD different from Cities: Skylines?",
        a: "OpenTTD is about transport networks between existing towns; Cities: Skylines is about designing and zoning a city itself. If you enjoy the traffic and logistics part of Skylines most, OpenTTD goes far deeper on exactly that.",
      },
    ],
  },

  luanti: {
    qualityBar: clearsAll(
      "Luanti clears the PlayBound Bar: free with no monetisation, a mature and stable engine, actively developed, genuinely excellent as a platform, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "The most common question about Luanti is whether it is a Minecraft clone, and the answer is no — it is something structurally different, which is both its greatest strength and the reason some people bounce off it in the first ten minutes.\n\nLuanti, formerly Minetest, is a free and open-source voxel game engine. Out of the box it gives you a sparse sandbox that is not trying to be a finished game. What makes it worth your time is the built-in content browser: hundreds of complete game modes, downloadable inside the client, ranging from faithful survival-crafting experiences to industrial automation, to guns-and-vehicles overhauls, to things with no Minecraft equivalent at all. Install one first. Judging Luanti by its default world is like judging a games console by the menu screen.\n\nOn technical merits it beats Minecraft in several specific places. It installs in about 150 MB against Minecraft's gigabyte-plus. It runs comfortably on hardware Minecraft cannot touch, including Raspberry Pi and decade-old laptops. World size is effectively unlimited with a far greater vertical range. Modding is first-class Lua with in-game installation, rather than Java and a third-party toolchain. Self-hosted multiplayer requires no account and no realm subscription.\n\nWhat it does not beat Minecraft on is polish and coherent design. Mojang's game is a single curated experience with two decades of art direction and content tuning behind it. Luanti's game modes are community-made and quality varies considerably. If you want to be handed something finished, that gap matters.\n\nThe compensating advantage is permanence. Luanti is open-source, self-hostable and cannot be discontinued, delisted or moved behind an account system by a corporate decision.",
    whyWePickedIt:
      "Luanti is the only voxel game we would call future-proof. Nobody can switch it off, price it, or force it through an account migration. Add that it runs on hardware nothing else will touch and installs in 150 MB, and it becomes the obvious recommendation for anyone who wants to build things without depending on a company's continued goodwill.",
    bestFor: [
      "Low-end hardware, old laptops and Raspberry Pi",
      "Anyone who wants a voxel game that cannot be shut down or repriced",
      "Modders — Lua scripting with an in-game content browser",
      "Self-hosted multiplayer with no accounts or subscriptions",
      "Players who enjoy configuring their own experience",
    ],
    notFor: [
      "You want a finished, polished game with no setup",
      "You care about Minecraft's specific content and progression design",
      "Your friends already play Minecraft and you want to join them",
      "You dislike variable community content quality",
    ],
    comparableTo: ["Minecraft", "Terraria", "Vintage Story", "Roblox"],
    faq: [
      {
        q: "Is Luanti free?",
        a: "Yes, entirely. Luanti is open-source under LGPL-2.1 with no purchase, subscription, account requirement or advertising. Every game mode in the content browser is also free.",
      },
      {
        q: "Is Luanti the same as Minetest?",
        a: "Yes. Minetest was renamed to Luanti in 2024. It is the same project with the same engine and content ecosystem.",
      },
      {
        q: "Is Luanti a good Minecraft alternative?",
        a: "It is the strongest free one, with important caveats. It is smaller, faster, runs on far weaker hardware, has first-class Lua modding, and cannot be shut down. But it is an engine with hundreds of community game modes rather than one curated game, so the default experience is sparse — install a game mode before judging it.",
      },
      {
        q: "Why does Luanti feel empty when I start it?",
        a: "Because vanilla Luanti is a platform, not a finished game. Open the content browser, install a game mode such as MineClone or a survival pack, and start a world with that instead. The default sandbox is not representative.",
      },
      {
        q: "Can Luanti run on a Raspberry Pi?",
        a: "Yes. Luanti runs on Raspberry Pi and other low-powered hardware, which is one of its clearest practical advantages over Minecraft.",
      },
      {
        q: "Does Luanti have multiplayer?",
        a: "Yes. You can join public community servers or host your own, with no account requirement and no subscription. Live server and player counts are shown on the Luanti servers page.",
      },
    ],
  },

  "endless-sky": {
    qualityBar: clearsAll(
      "Endless Sky clears the PlayBound Bar: free with no monetisation, complete with multiple full story campaigns, actively maintained, comfortably worth a commercial price, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Endless Sky is the best free game most people have never heard of, and the reason it stays obscure is that it looks like a mobile game from 2011. Get past ten minutes of that and it becomes one of the most generous single-player experiences available at any price.\n\nIt is a 2D space trading and combat game in the lineage of Escape Velocity: you start with a small ship and a large debt, haul cargo between systems, take on missions, upgrade or replace your ship, and gradually discover that the galaxy has a great deal going on. Buy low, sell high, and try not to get shot.\n\nWhat elevates it is the writing and the sheer volume of hand-authored content. This is not a procedurally generated galaxy with template quests. Every system, faction and storyline was written by someone, and there are multiple substantial campaigns with genuinely divergent paths and real consequences. The main human-space arc alone runs dozens of hours, and there are entire alien storylines beyond it that many players never see. It also has one of the more interesting endings in the genre, in that it declines to hand you a tidy resolution.\n\nCombat is readable and satisfying without being especially demanding — closer to arcade dogfighting than a simulation. Ship customisation is meaningful, with real trade-offs between speed, cargo, weapons and shields, but it is less granular than Naev's outfitting.\n\nAt 450 MB it runs on anything, and content updates ship regularly with new missions and ships from an active contributor community.",
    whyWePickedIt:
      "The gap between how Endless Sky looks and how good it is may be the widest we have encountered. It is a hand-written galaxy with dozens of hours of real writing, given away for nothing, by people who clearly cared. If you play one game from this catalog, make it this one.",
    bestFor: [
      "Story-driven space trading with genuinely good writing",
      "Long single-player campaigns — dozens of hours per arc",
      "Anyone who loved Escape Velocity or Freelancer",
      "Low-spec hardware and short sessions alike",
      "Players who want an accessible entry to the space trading genre",
    ],
    notFor: [
      "You want 3D cockpit flight rather than a top-down 2D view",
      "Dated presentation puts you off before the writing lands",
      "You want multiplayer, since this is single-player only",
      "You want the deepest possible ship outfitting; Naev goes further",
    ],
    comparableTo: ["Escape Velocity", "Elite Dangerous", "Freelancer", "Star Control"],
    faq: [
      {
        q: "Is Endless Sky free?",
        a: "Yes, entirely. Endless Sky is open-source under GPL-3.0 with no purchases, expansions or advertising. All content, including every story campaign, is included.",
      },
      {
        q: "How long is Endless Sky?",
        a: "The main human-space campaign runs several dozen hours, and there are further alien storylines beyond it. Completing everything takes well over a hundred hours.",
      },
      {
        q: "Is Endless Sky like Elite Dangerous?",
        a: "The trading, exploration and combat loop is similar in spirit, but Endless Sky is top-down 2D rather than a first-person cockpit, is single-player only, and is far more story-driven with hand-written missions instead of procedural content.",
      },
      {
        q: "Endless Sky or Naev — which should I play first?",
        a: "Endless Sky. It has stronger narrative direction, a more accessible combat model and a gentler learning curve. Play Naev afterwards if you want deeper ship outfitting and faction politics.",
      },
      {
        q: "Does Endless Sky have multiplayer?",
        a: "No. Endless Sky is a single-player game.",
      },
      {
        q: "Is Endless Sky still being updated?",
        a: "Yes. An active contributor community ships regular releases with new missions, ships and systems.",
      },
    ],
  },

  "privateer-gemini-gold": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: false,
      standsAlone: true,
      highQuality: true,
      verdict:
        "A complete, standalone remake of Wing Commander: Privateer that delivers full-freedom space trading, combat, and faction warfare without requiring original 1993 CD files or DOSBox configuration.",
      lastVerified: "2026-08-15",
    },
    longDescription:
      "Back in 1993, Origin Systems released Wing Commander: Privateer, setting the gold standard for open-ended space combat and trading by dropping players into the gritty Gemini Sector with an old scout ship, a handful of credits, and the freedom to forge their own destiny. Privateer Gemini Gold is an ambitious, community-crafted remake that rebuilds that legendary experience from the ground up on the open-source Vega Strike 3D engine.\n\nYou step into the cockpit of Grayson Burrows, beginning with a battered Tarsus scout class ship and a hefty bank loan. From the bustling landing pads of New Detroit to the frontier mining outposts of the Palan system, the entire Gemini Sector is open for business. How you earn your keep is entirely up to you: haul legal commodities between agricultural and industrial hubs, sign up for bounty contracts through the Mercenaries Guild, take high-risk courier runs for the Merchants Guild, or smuggle contraband through Confed patrols while dodging pirates and fanatical Retro cultists.\n\nUnlike DOSBox-emulated releases of the 1993 original, Gemini Gold runs natively on modern hardware at high widescreen resolutions with 32-bit color. Ship models, asteroid fields, jump gates, and base concourses have been reconstructed with real 3D geometry and enhanced lighting. The iconic ship progression remains intact—players can gradually upgrade shields, engines, and quad lasers, or trade up to a heavy-hauling Galaxy, agile Orion, or deadly Centurion heavy fighter.\n\nThe game seamlessly integrates both the full original Privateer storyline—following an ancient alien artifact that threatens the stability of the sector—and the Righteous Fire expansion campaign. It supports analog flight sticks, throttles, and modern gamepads, giving flight-sim enthusiasts authentic tactical dogfighting controls.\n\nWhile development concluded with the polished 1.03 stable release, Gemini Gold stands as a timeless preservation milestone: a complete, self-contained space simulator that requires no proprietary base game files and remains completely free to explore.",
    whyWePickedIt:
      "We added Privateer Gemini Gold because it exemplifies the very best of community-led game preservation. Rather than letting a landmark 90s space trading sim fade into DOSBox compatibility quirks, the team rebuilt the entire sector on an open-source engine and gave it away freely. It delivers the genuine thrill of open-ended space capitalism and tactical dogfighting with zero monetization and complete standalone independence.",
    bestFor: [
      "Fans of 90s space trading classics like Wing Commander: Privateer, Freelancer, and Elite",
      "Players seeking an open-ended galaxy with freedom to trade, hunt bounties, or smuggle",
      "Single-player pilots who want a rich, story-driven campaign with branching faction jobs",
      "HOTAS and flight-stick owners looking for tactical space dogfighting",
      "Low-spec PCs and Steam Deck players looking for a lightweight, self-contained space sim",
    ],
    notFor: [
      "Players looking for multiplayer servers or online persistent universes",
      "Anyone demanding cutting-edge AAA photorealistic graphics over authentic 90s-era 3D aesthetics",
      "Pilots expecting arcade auto-aim rather than momentum-based space flight physics",
      "Those wanting continuous live-service updates; this is a finished classic release",
    ],
    comparableTo: [
      "Wing Commander: Privateer",
      "Freelancer",
      "Elite Dangerous",
      "Vega Strike",
      "Naev",
      "Endless Sky",
    ],
    installSteps: [
      {
        platform: "all",
        text: "Install through the PlayBound Launcher for one-click setup. The launcher downloads the official 1.03 package directly from SourceForge and configures your executable paths.",
      },
      {
        platform: "windows",
        text: "For manual install on Windows, download PrivateerGold1.03.exe from the official SourceForge project page and run the setup wizard.",
      },
      {
        platform: "windows",
        text: "Run setup.exe in your installation folder prior to the first launch to set your desired screen resolution, fullscreen/windowed mode, and joystick sensitivity.",
      },
      {
        platform: "linux",
        text: "For Linux, download PrivateerGold1.03.bz2.bin, grant execute permissions, and launch the binary installer.",
        command: "chmod +x PrivateerGold1.03.bz2.bin && ./PrivateerGold1.03.bz2.bin",
      },
      {
        platform: "macos",
        text: "For macOS, download and open the PrivateerGold1.03.dmg image and copy Privateer Gemini Gold to your Applications folder.",
      },
    ],
    faq: [
      {
        q: "Is Privateer Gemini Gold free?",
        a: "Yes. Privateer Gemini Gold is completely free and open-source under the GPL-2.0 license. There are no microtransactions, in-game stores, or paywalled ships.",
      },
      {
        q: "Do I need the original 1993 Wing Commander Privateer to play?",
        a: "No. Gemini Gold is a fully standalone remake built on the open-source Vega Strike engine. It contains all ship models, stations, textures, and campaign missions out of the box without requiring original CD files.",
      },
      {
        q: "What ships can I pilot in Gemini Gold?",
        a: "You begin with the Tarsus scout ship and can purchase and customize the Orion light fighter, the Galaxy heavy merchant freighter, or the formidable Centurion heavy fighter, each with distinct hardpoints and cargo capacities.",
      },
      {
        q: "Does Gemini Gold include the Righteous Fire expansion?",
        a: "Yes. Both the original Privateer artifact campaign and the Righteous Fire expansion story arcs are fully implemented.",
      },
      {
        q: "Does Privateer Gemini Gold support flight sticks and gamepads?",
        a: "Yes. The Vega Strike engine supports USB joysticks, throttles, rudder pedals, and standard gamepads with customizable axis and button bindings.",
      },
      {
        q: "Is there a multiplayer mode in Privateer Gemini Gold?",
        a: "No. Privateer Gemini Gold is strictly an offline single-player experience focused on solitary exploration, trading, and campaign progression.",
      },
    ],
  },

  naev: {
    qualityBar: clearsAll(
      "Naev clears the PlayBound Bar: free with no monetisation, mature and content-complete, actively developed, deep enough to justify a commercial price, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Naev is what you play after Endless Sky, when you have decided that the outfitting screen is the best part.\n\nIt occupies the same territory — 2D space trading, combat and exploration in the Escape Velocity tradition — but weights it differently. Where Endless Sky leads with writing, Naev leads with systems. Ship customisation is genuinely deep: you are fitting individual slots with weapons, utilities and structural components, balancing mass against manoeuvrability, energy regeneration against shield capacity, and heat dissipation against sustained fire. Two players flying the same hull can end up with meaningfully different ships.\n\nFaction politics carry real weight. Reputation with each of the galaxy's powers shifts based on what you do, and it gates access to missions, shipyards and territory. Playing as a pirate is a genuinely different game from playing as a trader, not a cosmetic label.\n\nCombat is more technical than Endless Sky's, with a granular damage model, weapon tracking, and electronic warfare mechanics that reward understanding rather than reflexes. The learning curve is correspondingly steeper, and the game is less inclined to tell you what to do next. Some players find that liberating and others find it aimless — it depends entirely on whether you enjoy setting your own objectives.\n\nAt around 400 MB it runs on modest hardware, and development remains steady with regular releases.",
    whyWePickedIt:
      "Naev respects your intelligence and does not hold your hand. The outfitting depth is the real draw — it is closer to a fitting simulator than a shopping screen, and getting a build right feels genuinely earned. For players who want systems over story, it is the better of the two great free space games.",
    bestFor: [
      "Deep ship outfitting and build experimentation",
      "Faction reputation systems that meaningfully change the game",
      "Players who prefer setting their own objectives",
      "Technical combat with a granular damage model",
      "Anyone who has finished Endless Sky and wants more depth",
    ],
    notFor: [
      "You want strong narrative direction — Endless Sky is the better pick",
      "You dislike steep learning curves or sparse guidance",
      "You want 3D flight rather than a top-down 2D view",
      "You want multiplayer, since this is single-player only",
    ],
    comparableTo: ["Escape Velocity Nova", "Elite Dangerous", "EVE Online", "X4: Foundations"],
    faq: [
      {
        q: "Is Naev free?",
        a: "Yes, entirely. Naev is open-source under GPL-3.0 with no purchases, DLC or advertising.",
      },
      {
        q: "Is Naev better than Endless Sky?",
        a: "Neither is better outright. Naev has deeper ship outfitting and more consequential faction politics; Endless Sky has stronger writing and a gentler introduction. Start with Endless Sky if you are new to the genre and move to Naev when you want more systems depth.",
      },
      {
        q: "Is Naev hard to learn?",
        a: "Harder than Endless Sky. The outfitting system, faction reputation and combat model all reward study, and the game gives comparatively little direction about what to do next. That openness suits some players and frustrates others.",
      },
      {
        q: "Does Naev have multiplayer?",
        a: "No. Naev is single-player only.",
      },
      {
        q: "How big is Naev?",
        a: "Around 400 MB, and it runs comfortably on modest hardware.",
      },
    ],
  },

  "warzone-2100": {
    qualityBar: clearsAll(
      "Warzone 2100 clears the PlayBound Bar: free with no monetisation, a complete commercial game with a full campaign, still actively maintained after being open-sourced, genuinely good on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Warzone 2100 shipped in 1999 as a commercial retail game, sold reasonably, and then did something almost no commercial game does — its owners released the source code and the assets, and volunteers have been improving it ever since. Twenty-seven years later it is in better shape than it was at launch.\n\nWhat makes it distinctive is the unit designer. Most real-time strategy games hand you a fixed roster; Warzone 2100 hands you components. You research bodies, propulsion systems and weapons independently, then combine them into your own designs — a fast wheeled scout with a machine gun, a heavy tracked hull carrying artillery, a hover platform with anti-air. Because the research tree is enormous, running to hundreds of technologies, your army composition is genuinely a product of your own choices rather than a build order you looked up.\n\nThe single-player campaign is substantial and unusually well structured, carrying your units and research between missions so that losses actually matter. It is one of the better RTS campaigns of its era and it is free.\n\nThe trade-off is pace and presentation. This is a slower, more deliberate game than OpenRA, closer in tempo to 0 A.D., and it looks like what it is — a 1999 game with a lot of careful renovation. Multiplayer exists and works, with dedicated servers, but the population is modest.\n\nAt 550 MB it runs on anything, and it is one of the lighter installs among games of this scope.",
    whyWePickedIt:
      "The unit designer alone justifies it. Very few strategy games let you build your own army from researched components, and none of the ones that do are free. That Warzone 2100 was a paid retail product that its owners chose to liberate, and that volunteers have improved for nearly three decades, makes it one of the best arguments for open-source game preservation there is.",
    bestFor: [
      "Designing your own units from researched components",
      "A long, well-structured single-player campaign with persistent units",
      "Deep research trees and technology-order decisions",
      "Slower, more deliberate strategy than classic C&C",
      "Old hardware — light on resources for a game of its scope",
    ],
    notFor: [
      "You want fast matches; this is a deliberate, slow-burning game",
      "You want a large multiplayer population",
      "Dated presentation bothers you, renovation notwithstanding",
      "You prefer fixed unit rosters to component-based design",
    ],
    comparableTo: ["Command & Conquer", "Total Annihilation", "Earth 2150", "Supreme Commander"],
    faq: [
      {
        q: "Is Warzone 2100 free?",
        a: "Yes, entirely. Warzone 2100 was a commercial game in 1999 whose source code and assets were later released. It is now open-source under GPL-2.0 with no purchases or advertising.",
      },
      {
        q: "Is Warzone 2100 still being updated?",
        a: "Yes. Volunteers have maintained and improved it continuously since it was open-sourced, and releases continue to ship.",
      },
      {
        q: "Does Warzone 2100 have a single-player campaign?",
        a: "Yes, a substantial one. Units and research carry between missions, so losses have lasting consequences — one of the more interesting campaign structures of its era.",
      },
      {
        q: "What makes Warzone 2100 different from other RTS games?",
        a: "The unit designer. Instead of a fixed roster you research bodies, propulsion and weapons separately and combine them into your own designs, backed by a research tree running to hundreds of technologies.",
      },
      {
        q: "Does Warzone 2100 have multiplayer?",
        a: "Yes, including dedicated servers, though the player population is modest compared with newer free strategy games. Live server counts are shown on the Warzone 2100 servers page.",
      },
    ],
  },

  xonotic: {
    qualityBar: clearsAll(
      "Xonotic clears the PlayBound Bar: free with no monetisation, complete and polished, still maintained, an excellent arena shooter judged on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "The classic arena shooter is close to extinct as a commercial product. Quake Champions faded, Unreal Tournament was cancelled outright, and what remains of the genre on sale is mostly nostalgia re-releases. Xonotic is the genre's living continuation, and it is free.\n\nThis is a fast, movement-heavy first-person shooter in the direct lineage of Quake III Arena and Nexuiz before it. No loadouts, no unlock trees, no progression systems, no cosmetics — you spawn with a basic weapon and everything else is on the map. Weapon control, positioning and map knowledge are the entire game.\n\nThe movement deserves specific mention because it is the reason people stay. Xonotic's movement is faster and more technical than Quake III's, with its own mechanics to master, and the skill ceiling is genuinely high. Learning to chain jumps and maintain speed across a map takes real practice and feels excellent once it clicks. The engine runs at very high frame rates on modest hardware, which matters enormously in a game this fast.\n\nBot support is strong, which is more important than it sounds for a free shooter — you can practise properly offline and learn maps without depending on server population. Public servers are consistently populated, though numbers are far below commercial shooters, and there is an active competitive duel and team scene.\n\nThe caveats are honest ones. Player counts are modest, the art direction is functional rather than striking, and the technical movement is a genuine barrier for players used to modern grounded shooters. At around 1.1 GB it is a mid-sized install.",
    whyWePickedIt:
      "Someone had to keep the arena shooter alive after the commercial industry abandoned it, and Xonotic did. The movement is deeper than the games it descends from, the frame rates are excellent on cheap hardware, and it has never asked anyone for money. If you miss the days before loadouts, this is where they went.",
    bestFor: [
      "Classic arena shooting with no loadouts or progression",
      "Technical movement with a very high skill ceiling",
      "Very high frame rates on modest hardware",
      "Offline practice against strong bots",
      "LAN parties — no accounts, no internet required",
    ],
    notFor: [
      "You want large player populations at any hour",
      "You prefer grounded modern shooters to fast strafe-jumping",
      "You want progression, unlocks or cosmetics as motivation",
      "You care about striking art direction over function",
    ],
    comparableTo: ["Quake III Arena", "Unreal Tournament", "Quake Live", "Diabotical"],
    faq: [
      {
        q: "Is Xonotic free?",
        a: "Yes, entirely. Xonotic is open-source under GPL-2.0 with no purchases, battle passes, cosmetics or advertising of any kind.",
      },
      {
        q: "Is Xonotic like Quake?",
        a: "Yes, directly. Xonotic descends from the Quake III Arena tradition via Nexuiz, with no loadouts, map-based weapon pickups and movement-centric play. Its movement is faster and somewhat more technical than Quake III's.",
      },
      {
        q: "Does Xonotic have bots?",
        a: "Yes, and they are good enough for genuine practice. You can learn maps and weapon timings entirely offline, which makes the game viable regardless of server population.",
      },
      {
        q: "How many players does Xonotic have?",
        a: "Public servers are consistently populated but numbers are modest compared with commercial shooters. Live server and player counts are shown on the Xonotic servers page.",
      },
      {
        q: "Will Xonotic run on an old computer?",
        a: "Yes, very well. The engine is efficient and reaches high frame rates on hardware that struggles with modern shooters, which matters in a game this fast.",
      },
    ],
  },

  unvanquished: {
    qualityBar: clearsAll(
      "Unvanquished clears the PlayBound Bar: free with no monetisation, complete and playable, actively developed, genuinely distinctive on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Unvanquished does something no commercial game currently does: it puts a real-time strategy game and a first-person shooter in the same match, on opposite sides.\n\nTwo asymmetric teams face off. The humans are a conventional FPS side — projectile weapons, armour upgrades, and a base of turrets, armouries and repair stations that someone has to actually build and maintain. The aliens are melee-focused, wall-climbing, and evolve into larger and more dangerous forms as they accumulate resources, expanding their hive through organic structures. Neither side plays remotely like the other, and neither wins by shooting alone. Construction, resource control and map presence decide matches.\n\nThe result is a team game with genuine strategic texture, descended from the beloved Tremulous, running on a modern engine with far better performance and visuals. When it works — a coordinated team pushing a fortified position while their base holds behind them — there is nothing else quite like it.\n\nThe honest problem is that it requires a team willing to coordinate. A side that ignores building loses, and a side where nobody communicates loses to one that does. This makes Unvanquished excellent on a populated, engaged server and frustrating on an empty one. Bot support exists but is limited, so it is not a satisfying solo game. Player counts are the smallest of anything we list.\n\nAt 850 MB it installs quickly and is not especially demanding, though it wants a dedicated GPU.",
    whyWePickedIt:
      "We list Unvanquished because nothing else does what it does. The FPS/RTS hybrid is a genuinely rare design, and the free open-source world is the only place it survived. It needs a populated server to shine, which is a real caveat — but when it has one, it is the most interesting multiplayer game in this catalog.",
    bestFor: [
      "Something structurally unlike any commercial game",
      "Asymmetric team play with real strategic decisions",
      "Players who enjoy base building inside a shooter",
      "Coordinated groups playing together",
      "Fans of the original Tremulous",
    ],
    notFor: [
      "You want to play alone — bot support is limited",
      "You want a populated server at any hour",
      "You dislike coordinating with teammates to win",
      "You want a straightforward deathmatch shooter; Xonotic is that",
    ],
    comparableTo: ["Tremulous", "Natural Selection 2", "Savage 2", "Nuclear Dawn"],
    faq: [
      {
        q: "Is Unvanquished free?",
        a: "Yes, entirely. Unvanquished is open-source with no purchases, cosmetics or advertising.",
      },
      {
        q: "What kind of game is Unvanquished?",
        a: "An asymmetric FPS/RTS hybrid. Humans use projectile weapons and build a base of turrets and support structures; aliens use melee and wall-climbing and evolve into larger forms. Both sides depend on construction and resource control, not just combat.",
      },
      {
        q: "Is Unvanquished related to Tremulous?",
        a: "Yes. Unvanquished is a spiritual successor to Tremulous, keeping the asymmetric humans-versus-aliens design while running on a substantially more modern engine.",
      },
      {
        q: "Can I play Unvanquished alone?",
        a: "Not satisfyingly. Bot support exists but is limited, and the game depends on coordinated teams on populated servers. It is a multiplayer game first and foremost.",
      },
      {
        q: "How many players does Unvanquished have?",
        a: "The population is small — the smallest in the PlayBound catalog. Check the Unvanquished servers page for live counts before setting aside an evening for it.",
      },
    ],
  },

  "battle-for-wesnoth": {
    qualityBar: clearsAll(
      "The Battle for Wesnoth clears the PlayBound Bar: free with no monetisation, exceptionally complete with hundreds of hours of campaigns, still maintained after two decades, better than most commercial tactics games, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "The Battle for Wesnoth has been in development since 2003 and has quietly accumulated more turn-based tactical content than any commercial game in the genre. If you like Fire Emblem or Advance Wars and you want hundreds of hours for nothing, this is where to go.\n\nThe core is hex-grid turn-based tactics with a fantasy setting. Units occupy terrain that modifies their defence, a day-night cycle strengthens some factions and weakens others, and combat resolution is probabilistic — which means positioning and risk management matter more than raw unit strength. Units gain experience and advance into stronger forms, and crucially they persist between missions within a campaign, so a veteran you have carefully levelled is a real asset and losing them genuinely hurts.\n\nThe volume of content is the headline. The official campaigns alone run to well over a hundred hours across a dozen distinct storylines, several of which are properly written. Beyond that, the in-game add-on server hosts hundreds of community campaigns, some of which are better than the official ones. You could play this game for years without exhausting it.\n\nMultiplayer is turn-based and works well both online and hotseat, with an active community and a long-running competitive ladder.\n\nThe caveats are the probabilistic combat, which frustrates players who want deterministic outcomes, and the art style, which is consistent and characterful but plainly the work of volunteers over two decades. At 700 MB it runs on anything.",
    whyWePickedIt:
      "Two decades of accumulated campaigns makes Wesnoth almost absurd value — hundreds of hours of hand-crafted tactical content, given away, with hundreds more from the community on top. The persistent-unit campaign structure creates real attachment to your veterans in a way few games manage. It is one of the deepest games in this catalog by a wide margin.",
    bestFor: [
      "Turn-based tactics fans — Fire Emblem, Advance Wars, Final Fantasy Tactics",
      "Enormous amounts of single-player campaign content",
      "Persistent units that level up and carry between missions",
      "Hotseat and online turn-based multiplayer",
      "Very low-spec hardware and short sessions",
    ],
    notFor: [
      "You dislike probabilistic combat and want deterministic outcomes",
      "You want real-time rather than turn-based play",
      "Volunteer-made art direction bothers you",
      "You want modern presentation and full voice acting",
    ],
    comparableTo: ["Fire Emblem", "Advance Wars", "Final Fantasy Tactics", "Heroes of Might and Magic"],
    faq: [
      {
        q: "Is The Battle for Wesnoth free?",
        a: "Yes, entirely. Wesnoth is open-source under GPL-2.0 with no purchases or advertising. Every official campaign and all community add-ons are free.",
      },
      {
        q: "How much content does Wesnoth have?",
        a: "The official campaigns alone run to well over a hundred hours across roughly a dozen storylines, and the in-game add-on server hosts hundreds of additional community campaigns.",
      },
      {
        q: "Is Wesnoth like Fire Emblem?",
        a: "Broadly yes — hex-grid turn-based tactics with units that gain experience and advance. Wesnoth uses probabilistic combat resolution and terrain-based defence modifiers, and has far more content, but no permadeath outside optional settings.",
      },
      {
        q: "Does Wesnoth have multiplayer?",
        a: "Yes, both online and hotseat, with an active community and a long-standing competitive ladder.",
      },
      {
        q: "Is Wesnoth still being updated?",
        a: "Yes. Wesnoth has been in continuous development since 2003 and continues to receive releases.",
      },
    ],
  },

  supertuxkart: {
    qualityBar: clearsAll(
      "SuperTuxKart clears the PlayBound Bar: free with no monetisation, complete with a full campaign and multiplayer, actively developed, genuinely fun on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Mario Kart requires buying Nintendo hardware. SuperTuxKart requires a computer you already own, and it is the closest free equivalent that exists.\n\nThis is a kart racer with the full formula intact: drifting, item boxes, defensive and offensive power-ups, rubber-banding to keep races close, and tracks designed with shortcuts worth learning. There are dozens of tracks and arenas, a story mode with a proper progression of challenges, time trials, and — importantly — local split-screen for up to four players on one machine. Online racing works too, with public servers and no account requirement.\n\nWhat makes it more than a curiosity is that the track design is genuinely good. Several courses stand comparison with commercial kart racers, with layered routes and shortcuts that reward learning. Handling is slightly floatier than Nintendo's and drifting takes some acclimatisation, but it is consistent and satisfying once you adjust.\n\nThe roster is open-source mascots rather than familiar characters, which will either charm you or leave you cold. Presentation is bright and competent without matching Nintendo's polish, and there is no getting around the fact that Mario Kart 8 Deluxe is a more refined product. But Mario Kart 8 Deluxe costs money and needs a Switch, and this does not.\n\nAt roughly 1 GB it runs on modest hardware, and gamepads are properly supported — which matters, because this is a couch game first.",
    whyWePickedIt:
      "Local split-screen multiplayer is a dying feature and SuperTuxKart has it for four players, for free, on hardware you already own. The track design is better than a free kart racer has any obligation to be, and it is the game we recommend most often to anyone who needs something for a room full of people.",
    bestFor: [
      "Four-player local split-screen on one machine",
      "Anyone who wants Mario Kart without Nintendo hardware",
      "Family and living-room play with gamepads",
      "A story mode with real progression, not just quick races",
      "Free online racing with no account required",
    ],
    notFor: [
      "You want Nintendo's characters and polish specifically",
      "You are used to frame-perfect Mario Kart drift timing",
      "You want a large competitive online population",
      "You dislike open-source mascot characters",
    ],
    comparableTo: ["Mario Kart 8", "Crash Team Racing", "Sonic & All-Stars Racing", "Diddy Kong Racing"],
    faq: [
      {
        q: "Is SuperTuxKart free?",
        a: "Yes, entirely. SuperTuxKart is open-source under GPL-3.0 with no purchases, cosmetics or advertising.",
      },
      {
        q: "Does SuperTuxKart have split-screen?",
        a: "Yes, local split-screen for up to four players on one machine, with full gamepad support. It is one of the game's strongest features.",
      },
      {
        q: "Is SuperTuxKart a good Mario Kart alternative?",
        a: "It is the closest free equivalent. Drifting, item boxes, power-ups, split-screen and a story mode are all present, and several tracks are genuinely well designed. Handling is slightly floatier and the presentation is less polished than Mario Kart 8 Deluxe, but it costs nothing and needs no console.",
      },
      {
        q: "Does SuperTuxKart have online multiplayer?",
        a: "Yes, with public servers and no account requirement. Live server and player counts are shown on the SuperTuxKart servers page.",
      },
      {
        q: "Will SuperTuxKart run on a low-end laptop?",
        a: "Yes. It scales down well and runs acceptably on integrated graphics, though a dedicated GPU gives smoother frame rates at higher settings.",
      },
    ],
  },

  supertux: {
    qualityBar: clearsAll(
      "SuperTux clears the PlayBound Bar: free with no monetisation, complete with a full campaign and level editor, still maintained, genuinely enjoyable on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "SuperTux is a 2D side-scrolling platformer built openly and unapologetically in the Super Mario Bros. mould, and it has been quietly improving for over two decades.\n\nThe formula is exactly what you would expect and that is the point: run, jump, stomp enemies, collect coins, find secrets, reach the flag. There is a world map connecting levels, power-ups that change what you can do, and level design that escalates in difficulty at a sensible rate. Two full worlds of levels ship with the game, plus a substantial set of community add-on levels.\n\nThe standout feature is the built-in level editor. It is proper and complete, not a toy, and it has produced a real community of level designers. If you have ever wanted to build Mario levels without buying Super Mario Maker, this is the free route to it.\n\nJump physics are close to Nintendo's but not identical, and that matters more than it sounds. If you have thousands of hours of Mario muscle memory you will notice the difference in air control and momentum for the first hour. It is internally consistent and perfectly learnable — just not a clone.\n\nThe honest assessment is that the level design is good rather than exceptional. Nintendo's relentless inventiveness — a new idea every thirty seconds — is very hard to match, and SuperTux does not match it. What it offers instead is a solid, complete, free platformer with an excellent editor, on any computer, forever.\n\nAt 150 MB it is one of the smallest games in the catalog.",
    whyWePickedIt:
      "Free 2D platformers are mostly rough. SuperTux is not — it is complete, consistent and has been polished across two decades, and the level editor turns it into something with far more longevity than the shipped campaign alone. For a 150 MB download that runs on anything, it is remarkable value.",
    bestFor: [
      "Classic 2D platforming without buying a Nintendo console",
      "Building your own levels with a proper built-in editor",
      "Very low-spec hardware — a 150 MB install",
      "Short sessions and pick-up-and-play",
      "Younger players, with straightforward and friendly design",
    ],
    notFor: [
      "You expect frame-perfect Nintendo jump physics",
      "You want Mario's relentless level-design inventiveness",
      "You want multiplayer, since this is single-player",
      "You want modern visual production values",
    ],
    comparableTo: ["Super Mario Bros.", "Super Mario World", "Celeste", "Super Mario Maker"],
    faq: [
      {
        q: "Is SuperTux free?",
        a: "Yes, entirely. SuperTux is open-source under GPL-3.0 with no purchases or advertising.",
      },
      {
        q: "Is SuperTux like Super Mario Bros.?",
        a: "Very much so by design — running, jumping, stomping enemies, power-ups and a world map. Jump physics are close but not identical, so expect a short adjustment period if you have extensive Mario experience.",
      },
      {
        q: "Does SuperTux have a level editor?",
        a: "Yes, a complete built-in editor, which has produced an active community of level designers. It is the closest free equivalent to Super Mario Maker on a computer.",
      },
      {
        q: "How long is SuperTux?",
        a: "Two full worlds of levels ship with the game, plus a substantial library of community add-on levels — several hours for the base campaign and considerably more with community content.",
      },
      {
        q: "Is SuperTux suitable for children?",
        a: "Yes. It is bright, friendly, has no violence beyond cartoon enemy-stomping, requires no account, has no purchases and no online interaction with strangers.",
      },
    ],
  },

  hedgewars: {
    qualityBar: clearsAll(
      "Hedgewars clears the PlayBound Bar: free with no monetisation, complete and content-rich, still maintained after two decades, genuinely funny and good on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Turn-based artillery is a genre almost entirely defined by one paid series, and Hedgewars is the free equivalent that has been going since 2004.\n\nThe formula is Worms, faithfully: two or more teams take turns lobbing absurd weaponry across fully destructible terrain, with wind, angle and power to account for and a time limit per turn to keep things moving. The weapon roster is large and gleefully ridiculous — bazookas and grenades alongside sheep launchers, piano drops and things best discovered in play. Terrain deforms permanently, so a long match slowly demolishes the map beneath everyone.\n\nWhat makes Hedgewars work is that it understood the assignment. The weapons are funny, the physics are readable, the turn timer keeps matches brisk, and the whole thing is designed around a group of people in one room shouting at each other. Hotseat multiplayer on a single machine is the primary mode and it is excellent. Online multiplayer works too, with public rooms, plus a campaign and training missions for solo play.\n\nThe roster is hedgehogs rather than worms, weapon balance differs from any specific Worms entry, and the presentation is charming but plainly less polished than recent commercial releases. Those are the honest gaps, and none of them matter much when four people are crowded around one keyboard.\n\nAt 180 MB it is among the smallest games we list and runs on anything with a screen.",
    whyWePickedIt:
      "Hedgewars is a party game, and party games are judged on whether the room laughs. This one does. Twenty-two years of development have produced a deep weapon roster and consistent physics, and it needs no accounts, no internet and no hardware to speak of — just a keyboard and some people willing to take turns.",
    bestFor: [
      "Hotseat multiplayer with several people on one machine",
      "Party and living-room play with no setup",
      "Anyone who wants Worms without paying for it",
      "Very low-spec hardware — a 180 MB install",
      "Short sessions with a natural stopping point",
    ],
    notFor: [
      "You want recent commercial Worms polish and production values",
      "You are playing entirely alone; the campaign is secondary",
      "You want real-time action rather than turn-based play",
      "You want a large online population",
    ],
    comparableTo: ["Worms Armageddon", "Worms W.M.D", "Scorched Earth", "Gunbound"],
    faq: [
      {
        q: "Is Hedgewars free?",
        a: "Yes, entirely. Hedgewars is open-source under GPL-2.0 with no purchases, DLC or advertising.",
      },
      {
        q: "Is Hedgewars like Worms?",
        a: "Yes, closely. Turn-based artillery with destructible terrain, wind and angle mechanics, a large absurd weapon roster and hotseat multiplayer. Hedgehogs replace worms and weapon balance differs, but the formula is faithfully reproduced.",
      },
      {
        q: "Can several people play Hedgewars on one computer?",
        a: "Yes — hotseat multiplayer on a single machine is the primary mode and requires no extra controllers, accounts or internet connection.",
      },
      {
        q: "Does Hedgewars have single-player content?",
        a: "Yes, including a campaign, training missions and matches against AI opponents, though the game is at its best with other people.",
      },
      {
        q: "Does Hedgewars have online multiplayer?",
        a: "Yes, with public rooms and an official server. Live server and player counts are shown on the Hedgewars servers page.",
      },
    ],
  },

  veloren: {
    qualityBar: {
      genuinelyFree: true,
      // Under active development and openly pre-1.0. Honest scoring: this is
      // the one criterion Veloren does not yet clearly clear.
      finished: false,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Veloren clears four of five. It is genuinely free, very actively developed, good on its own merits and permanently open-source — but it is openly pre-release, and systems still change between versions. We list it because what exists is already worth playing, with that caveat stated plainly.",
      lastVerified: VERIFIED,
    },
    longDescription:
      "Veloren is the most ambitious game in this catalog and the one we are most careful about recommending, because it is honest about being unfinished and we should be too.\n\nIt is a multiplayer voxel action RPG, drawing openly on Cube World and Zelda: Breath of the Wild. The world is procedurally generated at genuinely large scale, with distinct biomes, weather, dungeons and a day-night cycle, all rendered in a voxel art style that is considerably more attractive than the description suggests. Combat is real-time and skill-based — dodging, timing and stamina management rather than tab-targeting — and there is character progression, crafting, gliding, sailing and mount taming.\n\nWhat makes Veloren interesting is that it is a fully open-source MMO-scale project that actually runs. You can host your own server for friends, join public ones, or play solo, and none of it costs anything or requires an account with anyone.\n\nThe caveat is real. Veloren is pre-1.0 and says so. Progression systems, combat balance and content get reworked between releases, worlds are sometimes reset, and the loot economy is not mature. If you want a stable game with a settled endgame, this is not yet it.\n\nWe list it anyway because what exists is already enjoyable — exploring a freshly generated world, fighting through a dungeon with friends, and gliding off a mountain are all good right now. Treat it as an excellent game in progress rather than a finished product, and it will not disappoint you.\n\nAt roughly 1 GB it wants a dedicated GPU for comfortable frame rates.",
    whyWePickedIt:
      "An open-source, self-hostable action RPG at this scale should not exist, and yet it runs and it is fun. We are including it with the honest note that it is unfinished, because the alternative — quietly omitting it — would hide one of the most impressive things happening in free games right now. Play it for what it is.",
    bestFor: [
      "Exploring large procedurally generated worlds",
      "Real-time skill-based combat rather than tab-targeting",
      "Self-hosting a small server for friends, free and account-free",
      "Anyone interested in an ambitious open-source project in motion",
      "Players comfortable with a game that changes between releases",
    ],
    notFor: [
      "You want a finished, stable game with a settled endgame",
      "You dislike progression reworks and occasional world resets",
      "You want a mature loot economy and balanced itemisation",
      "You are on integrated graphics; it wants a dedicated GPU",
    ],
    comparableTo: ["Cube World", "The Legend of Zelda: Breath of the Wild", "Valheim", "Minecraft"],
    faq: [
      {
        q: "Is Veloren free?",
        a: "Yes, entirely. Veloren is open-source under GPL-3.0 with no purchases, subscriptions, cosmetics or account requirement.",
      },
      {
        q: "Is Veloren finished?",
        a: "No, and it does not claim to be. Veloren is pre-1.0 and under very active development. Progression systems and combat balance change between releases and worlds are occasionally reset. What exists is enjoyable, but it is a game in progress.",
      },
      {
        q: "Can I host my own Veloren server?",
        a: "Yes. Self-hosting is fully supported and free, with no account or licence required, which makes it a good option for a small private world with friends.",
      },
      {
        q: "Is Veloren like Minecraft?",
        a: "It shares the voxel aesthetic but is a different game. Veloren is an action RPG focused on exploration, real-time combat and character progression rather than free-form building.",
      },
      {
        q: "What are Veloren's system requirements?",
        a: "A dedicated GPU is recommended for comfortable frame rates, alongside a quad-core CPU and 8 GB of RAM. It is more demanding than most games in this catalog.",
      },
    ],
  },

  "shattered-pixel-dungeon": {
    qualityBar: clearsAll(
      "Shattered Pixel Dungeon clears the PlayBound Bar: free with no monetisation on desktop, complete and exceptionally well balanced, actively developed with regular releases, better than most paid roguelikes, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Shattered Pixel Dungeon is the best-balanced roguelike we know of that costs nothing, and it fits in under 100 MB.\n\nIt is a traditional roguelike in the strict sense: turn-based, grid-based, procedurally generated dungeons, permanent death, and unidentified items you have to risk using to learn what they are. You pick one of several classes, descend through increasingly hostile floors, and almost certainly die somewhere in the middle while learning something useful for next time.\n\nWhat distinguishes it from the many free roguelikes is balance. This is a game that has been tuned obsessively over years, and it shows in how many viable builds exist. Almost every item has a use, almost every class has multiple genuine strategies, and losing rarely feels arbitrary — you can usually identify the decision that killed you. That is much harder to achieve than it sounds and it is why the game sustains hundreds of runs.\n\nThe item identification system deserves specific mention because it drives the tension. An unidentified potion might save your run or end it, and deciding when to gamble is the central skill. Combined with permadeath, this produces the specific roguelike quality where each run teaches you something that makes the next one better.\n\nIt is turn-based and pixel-art, so if you want real-time action or modern visuals, look elsewhere — Veloren is the alternative in this catalog. And permadeath means nothing carries over between runs, which some players find punishing rather than motivating.\n\nThe desktop version is free and open-source. The mobile store listings are the only place any payment exists.",
    whyWePickedIt:
      "Balance is the hardest thing to get right in a roguelike and this one nails it — hundreds of runs in, you are still finding viable builds and still learning. That it is under 100 MB, free, open-source and runs on literally anything makes it the single best value in the catalog by download size.",
    bestFor: [
      "Traditional turn-based roguelikes with permadeath",
      "Exceptional balance and genuinely varied viable builds",
      "Very short sessions — a run fits into a lunch break",
      "The smallest hardware and storage requirements in the catalog",
      "Players who want difficulty that feels fair rather than random",
    ],
    notFor: [
      "You want real-time action combat",
      "You dislike permadeath and losing all progress on a run",
      "You want modern visuals rather than pixel art",
      "You want multiplayer, since this is single-player only",
    ],
    comparableTo: ["Diablo", "Slay the Spire", "NetHack", "Dead Cells"],
    faq: [
      {
        q: "Is Shattered Pixel Dungeon free?",
        a: "The desktop version is entirely free and open-source under GPL-3.0 with no purchases or advertising. The iOS and Android store listings are paid, which is the only place money changes hands.",
      },
      {
        q: "Is Shattered Pixel Dungeon good for roguelike beginners?",
        a: "Yes, unusually so. The rules are transparent, deaths are almost always explicable, and runs are short enough that starting again is cheap. It is one of the better introductions to the genre.",
      },
      {
        q: "How long is a run in Shattered Pixel Dungeon?",
        a: "A full successful run takes roughly an hour or two. Most early runs end much sooner, which is part of the design — each attempt teaches you something.",
      },
      {
        q: "Does Shattered Pixel Dungeon have permadeath?",
        a: "Yes. Death ends the run and nothing carries over except what you have learned. This is central to the design rather than an obstacle to it.",
      },
      {
        q: "How is Shattered Pixel Dungeon different from Pixel Dungeon?",
        a: "Shattered Pixel Dungeon is a long-running, heavily expanded fork of the original Pixel Dungeon, with substantially more content, more classes and far more refined balance. It is the actively developed version.",
      },
    ],
  },

  everquest: {
    qualityBar: {
      genuinelyFree: false,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "EverQuest still earns a place as the foundational fantasy MMO, but Live is free-to-play with a cash shop and All Access — not a no-monetisation title. Community editions are separate worlds with their own rules.",
      lastVerified: "2026-08-13",
    },
    longDescription:
      "EverQuest is the game that taught a generation what an MMO could feel like: a hostile world, a social contract, and the sense that the dungeon down the road might actually kill you. PlayBound lists it as a franchise with three playable editions rather than a single installer, because “EverQuest” now means official Live, Project Quarm, and Project 1999, and those are not interchangeable clients.\n\nEverQuest Live is Daybreak’s current game. You create a Daybreak account, run LaunchPad, and enter a world that has been patched for more than two decades. It is free to download and play, with optional All Access if you want fewer F2P limits. Live is the legal, supported way to play the franchise as it exists in 2026, with modern convenience and a very different pacing from 1999.\n\nProject Quarm is a community era that uses the TAKP classic client. PlayBound can fetch the public base client, but you still need TAKP accounts and the latest Quarm Discord patch. Project 1999 recreates late-classic / early-Velious on community servers and requires a legal Titanium install that PlayBound will copy and overlay — it never redistributes Titanium.\n\nNone of the community editions are affiliated with Daybreak. Install only from the edition pages and the channels those communities publish. If you want official support, pick Live. If you want a specific classic feeling, read the Quarm and P99 guides before you download anything.",
    whyWePickedIt:
      "PlayBound is a catalog of things you can actually launch. EverQuest still has three living ways to do that — official Live plus two community eras with real populations — and pretending they are one download would send people to the wrong login screen.",
    bestFor: [
      "Players who want the original fantasy MMO, not a theme-park sequel",
      "People willing to read an edition guide before installing",
      "Classic-era fans who already own legal Titanium (for Project 1999)",
      "Anyone curious about official Live without paying up front",
    ],
    notFor: [
      "You want a single one-click client that covers every EverQuest server",
      "You expect a modern action combat MMO with a short onboarding",
      "You want a game with no cash shop or subscription options on Live",
      "You are looking for a Daybreak-supported private server",
    ],
    comparableTo: ["World of Warcraft Classic", "Ultima Online", "Dark Age of Camelot", "EverQuest II"],
    installSteps: [
      {
        platform: "all",
        text: "EverQuest on PlayBound is three editions. Choose EverQuest Live for official Daybreak, Project Quarm for TAKP-era community progression, or Project 1999 if you own a legal Titanium client.",
      },
      {
        platform: "all",
        text: "Open that edition’s page and follow its install guide. Live uses Daybreak LaunchPad; Quarm installs a community client plus a Discord patch; P99 copies your Titanium folder and overlays public P99Files.",
      },
      {
        platform: "windows",
        text: "Create the matching account before you click Play: a Daybreak account for Live, a TAKP forum plus login-server account for Quarm, or a Project 1999 forum plus login-server account for P99.",
      },
    ],
    faq: [
      {
        q: "Is EverQuest free?",
        a: "EverQuest Live is free to download and play with a Daybreak account. An optional All Access subscription removes more free-to-play limits. Community editions have their own rules and are not Daybreak products.",
      },
      {
        q: "Which EverQuest edition should I install?",
        a: "Live if you want the official game. Project Quarm if you want a curated classic-style community era and are willing to patch from Discord. Project 1999 if you already own legal Titanium and want that specific recreation.",
      },
      {
        q: "Does PlayBound host EverQuest game files?",
        a: "No. Live downloads Daybreak’s LaunchPad. Quarm uses a public community zip plus patches from Quarm’s own Discord. P99 only copies a Titanium folder you already own and merges public P99Files.",
      },
      {
        q: "Can I play EverQuest solo?",
        a: "Yes. It is still an MMO, so towns and dungeons are shared, but many classes can progress alone at their own pace. Group content remains the historic heart of the game.",
      },
      {
        q: "Are Quarm and Project 1999 official?",
        a: "No. They are community projects and are not affiliated with Daybreak. Use only the websites, forums, and Discord servers linked on each edition page.",
      },
    ],
  },

  flightgear: {
    qualityBar: clearsAll(
      "FlightGear clears the PlayBound Bar: genuinely free, complete enough to fly worldwide, still maintained, serious enough to recommend against paid sims, and high quality for anyone who wants simulation rather than an arcade flyer."
    ),
    longDescription:
      "FlightGear is what you get when a flight simulator is treated as a public research project instead of a storefront. It models aircraft, weather, and a planet-sized scenery set, and it does that without a subscription or a scenery marketplace. The first hour is not a tutorial in the Microsoft Flight Simulator sense — it is closer to sitting down in a real cockpit binder and figuring out which switches matter.\n\nThe payoff is scope. You can fly a Cessna around a local field, line up an airliner on a Canvas glass cockpit, or join multiplayer traffic over published frequencies. Aircraft quality varies because the fleet is a community: some planes are museum pieces, others are the reason people stay. Worldwide scenery via TerraSync is large; plan disk space the way you would for any serious sim, not a casual download.\n\nIt is heavier than a browser flyer and more fiddly than a console racing game with wings. Joysticks help. Reading the wiki helps. If you wanted arcade dogfights, this is the wrong catalog page. If you wanted an open-source sim that still takes the physics seriously in 2026, it is one of the few that does.",
    whyWePickedIt:
      "Most free ‘flight games’ are toys. FlightGear is a simulator with worldwide scenery and a living aircraft library, and it remains the open-source answer when someone asks whether they have to pay for that kind of depth.",
    bestFor: [
      "People who want a real flight sim rather than an arcade flyer",
      "Joystick and yoke users who will read a checklist",
      "Multiplayer flying and exploring real-world airports",
      "Anyone willing to trade polish for an open aircraft and scenery pipeline",
    ],
    notFor: [
      "You want a ten-minute pick-up-and-play flying game",
      "You have a small SSD and no room for scenery",
      "You need a hand-holding career mode like a commercial consumer sim",
      "You expected console-style presentation out of the box",
    ],
    comparableTo: ["Microsoft Flight Simulator", "X-Plane", "Prepar3D", "DCS World"],
    installSteps: [
      {
        platform: "all",
        text: "Install FlightGear with the PlayBound launcher, or download the official Windows/macOS/Linux build from flightgear.org. Avoid third-party mirrors.",
      },
      {
        platform: "windows",
        text: "Finish the official setup wizard, then launch FlightGear. The first run may fetch extra aircraft or scenery — let it finish before judging performance.",
      },
      {
        platform: "all",
        text: "Start with a simple piston aircraft at a familiar airport. Open settings for view, frame rate, and TerraSync before loading a heavy airliner.",
      },
    ],
    faq: [
      {
        q: "Is FlightGear free?",
        a: "Yes. FlightGear is open-source under the GPL. There is no purchase, subscription, or scenery shop required to fly.",
      },
      {
        q: "How much disk space does FlightGear need?",
        a: "The base simulator is a few gigabytes. Worldwide scenery via TerraSync can grow into tens of gigabytes depending on where you fly. Treat recommended storage as a scenery budget, not just the installer size.",
      },
      {
        q: "Does FlightGear work with a joystick?",
        a: "Yes, and it is strongly recommended. Keyboard flying is possible for a first takeoff; a joystick or yoke makes the sim much more usable.",
      },
      {
        q: "Can I fly online in FlightGear?",
        a: "Yes. FlightGear has a multiplayer network. Use published procedures and frequencies, and read the multiplayer guide before joining busy airspace.",
      },
      {
        q: "Is FlightGear as pretty as Microsoft Flight Simulator?",
        a: "Not in the photogrammetry sense. FlightGear’s strength is an open aircraft and scenery pipeline you can inspect and extend, not competing with a paid streaming globe.",
      },
    ],
  },

  freeciv: {
    qualityBar: clearsAll(
      "Freeciv clears the PlayBound Bar: no monetisation, a complete empire-builder, still maintained after decades, good enough to recommend beside paid 4X games, and distinctive because the rulesets are the point."
    ),
    longDescription:
      "Freeciv is the long game of free strategy: a Civilization-inspired empire builder that has been rewritten, re-themed, and re-argued about since the mid-1990s. You settle cities, research a tech tree, wrangle governments, and try not to lose a veteran army to a spearmen joke you walked into. The classic loop is intact. What makes Freeciv itself is that almost none of that loop is frozen.\n\nRulesets are first-class. Classic, Civ2Civ3, experimental, alien, and community packs change what a ‘civ’ even is. Longturn games stretch a match across real-world days. Hotseat still exists for people who share a machine. The GTK and Qt clients are utilitarian in the way serious hobby software is utilitarian — they are there to host a ruleset, not to sell you a season pass.\n\nIt will not look like Civilization VI. It will not hold your hand through a cinematic advisor. It will let you play a 4X on a laptop from 2012, host a server for friends, and still be talking about the same design arguments the project had twenty years ago. That continuity is the feature.",
    whyWePickedIt:
      "If you want Civilization without a storefront, Freeciv is the honest answer: not a clone with a new coat of paint, but a thirty-year ruleset laboratory that is still played online.",
    bestFor: [
      "Civilization fans who want a free, moddable 4X",
      "Longturn and multiplayer diplomacy games",
      "Players who enjoy tinkering with rulesets and tilesets",
      "Low-spec machines that still want a full empire-builder",
    ],
    notFor: [
      "You want AAA 3D presentation and cinematic leaders",
      "You refuse to read a manual or a ruleset description",
      "You need a single ‘official’ balance forever",
      "You only want a two-hour campaign with a scripted story",
    ],
    comparableTo: ["Sid Meier's Civilization", "Civilization II", "Civilization III", "C-evo"],
    installSteps: [
      {
        platform: "all",
        text: "Install Freeciv with the PlayBound launcher, which opens the official Windows GTK4 setup, or download a package from freeciv.org for your OS.",
      },
      {
        platform: "windows",
        text: "Finish the official installer, then launch the GTK4 client. Start a local game against AI before joining a public server so you learn the UI.",
      },
      {
        platform: "all",
        text: "Pick a ruleset you recognise (classic or civ2civ3) for the first match. Custom tilesets and Longturn games can wait until the basics click.",
      },
    ],
    faq: [
      {
        q: "Is Freeciv free?",
        a: "Yes. Freeciv is open-source (GPL) with no purchase or in-game shop. Optional donations support the project; they are not required to play.",
      },
      {
        q: "Is Freeciv the same as Civilization?",
        a: "No. It is inspired by the Civilization series and implements similar empire-building, but it is an independent project with its own rulesets, clients, and multiplayer culture.",
      },
      {
        q: "Can I play Freeciv online?",
        a: "Yes. There are public servers, Longturn games, and you can host your own. PlayBound lists Freeciv server activity where a provider is wired up.",
      },
      {
        q: "Does Freeciv have single-player?",
        a: "Yes. You can play against AI, including hotseat. Multiplayer is a big part of the community, but you never have to go online.",
      },
      {
        q: "Which Freeciv client should I use?",
        a: "The Windows package PlayBound installs is the GTK4 client. Qt is also common. Use whichever your package provides; the ruleset matters more than the toolkit.",
      },
    ],
  },

  openciv3: {
    qualityBar: {
      genuinelyFree: true,
      finished: false,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: false,
      verdict:
        "OpenCiv3 is a genuine open-source Civ III remake in progress: playable standalone with placeholder art, better with a legal Civilization III Complete install, and not a finished commercial-quality 4X yet.",
      lastVerified: "2026-08-13",
    },
    longDescription:
      "OpenCiv3 (the project formerly called C7) is an attempt to rebuild Civilization III in Godot so the game can live on modern machines and, eventually, under a licence that is not locked to 2001 installers. It already runs without owning Civ III: you get placeholder art and a rules sandbox. If you do own Civilization III Complete on Steam or GOG, OpenCiv3 can pick up the original graphics from common install paths.\n\nThat split is the honest product. This is not a polished Definitive Edition. It is a remake with a public GitHub, a roadmap, and the kind of missing edges you expect from an early Godot port of a deep 4X. Combat, civilopedia coverage, and UI will feel unfinished next to Firaxis’s later games — and next to Civ III itself on a good day.\n\nWe list it anyway because the alternative for Civ III on a modern PC is often compatibility theatre. OpenCiv3 is the project that is trying to make the design portable. If you want a finished free 4X tonight, play Freeciv. If you want to follow a Civ III remake and maybe feed it original art you already paid for, this is the page.",
    whyWePickedIt:
      "Civilization III still has a design worth preserving, and OpenCiv3 is the open remake actually shipping builds. We would rather catalog an honest work-in-progress than pretend shareware clones are the same game.",
    bestFor: [
      "Civilization III fans who want a modern, open client",
      "People who already own Civ III Complete and want original art",
      "Modders watching a Godot 4X remake take shape",
      "Players who accept placeholder art in a standalone build",
    ],
    notFor: [
      "You want a finished, campaign-complete 4X this weekend",
      "You expected Firaxis-level UI and civilopedia depth today",
      "You refuse to install a separate game for original graphics",
      "You wanted Freeciv’s thirty-year ruleset stability under another name",
    ],
    comparableTo: ["Civilization III", "Freeciv", "Civilization II", "Call to Power"],
    installSteps: [
      {
        platform: "all",
        text: "Install OpenCiv3 with the PlayBound launcher. The Windows zip from the C7-Game/OpenCiv3 GitHub releases runs standalone with placeholder art.",
      },
      {
        platform: "windows",
        text: "Launch OpenCiv3 and confirm it windowed. If you own Civilization III Complete, keep that install in a normal Steam or GOG folder so OpenCiv3 can detect original graphics.",
      },
      {
        platform: "all",
        text: "This is an early remake. Read the GitHub readme for known gaps before judging it as a finished Civ III replacement.",
      },
    ],
    faq: [
      {
        q: "Do I need Civilization III to play OpenCiv3?",
        a: "No. OpenCiv3 runs standalone with placeholder art. A legal Civilization III Complete install is optional and unlocks original graphics when the remake finds it.",
      },
      {
        q: "Is OpenCiv3 finished?",
        a: "No. It is an actively developed remake. Core loops exist; presentation, completeness, and polish are still behind Civilization III itself.",
      },
      {
        q: "Is OpenCiv3 legal?",
        a: "The engine is an open-source remake. Original Civ III art is still Firaxis/2K property — only use it if you own a legal copy. Placeholder art needs no extra purchase.",
      },
      {
        q: "How is OpenCiv3 different from Freeciv?",
        a: "Freeciv is a mature Civilization-inspired 4X with its own rulesets. OpenCiv3 specifically targets Civilization III’s design and assets. They scratch adjacent itches, not the same one.",
      },
      {
        q: "Where do OpenCiv3 builds come from?",
        a: "Official Windows zips are published on the C7-Game/OpenCiv3 GitHub releases page. PlayBound installs that project, not a third-party fork.",
      },
    ],
  },

  "asphalt-legends": {
    qualityBar: {
      genuinelyFree: false,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Asphalt Legends is a finished, actively updated arcade racer you can play without paying up front, but it is a free-to-play live-service with a prominent shop — not a no-monetisation catalog pick.",
      lastVerified: "2026-08-13",
    },
    longDescription:
      "Asphalt Legends (the PC continuation of Gameloft’s Asphalt arcade line, including the Unite branding) is a licensed-car racer built for short races, nitro, and a garage that never really stops expanding. On PC it is a free Steam/Epic download with controller support and the same live-service loop the mobile games taught a huge audience: race, upgrade, chase events, bump into the shop.\n\nIt is not sim racing. Steering is arcade, tracks are showpieces, and the fantasy is driving cars you will not own. That fantasy is funded by optional spending. You can play without paying; you cannot pretend the economy is a museum piece. If PlayBound’s five-point bar is a filter against pay-to-win treadmills, this title fails the ‘genuinely free’ criterion on purpose — we still list it because people search for a free arcade racer on PC and deserve an honest page rather than a silent omission.\n\nInstall through Steam when you can. The client wants DirectX 12, a 64-bit Windows 10 machine, and a network connection. Solo events and versus-AI exist; the live calendar is the real structure of the game.",
    whyWePickedIt:
      "It is the mainstream free arcade racer on PC. Cataloguing it with an honest quality bar is more useful than pretending the only free racers are open-source kart games.",
    bestFor: [
      "Arcade racers who want licensed cars and short events",
      "Controller play on a mid-range PC or Steam Deck-class handheld",
      "Players who already know Asphalt from mobile",
      "People who will ignore the shop and just race",
    ],
    notFor: [
      "You want a sim with tyre models and no nitro",
      "You want a game with no live-service shop or seasonal grind",
      "You are offline for long stretches",
      "You expected an open-source racing project",
    ],
    comparableTo: ["Need for Speed", "Asphalt 8", "Asphalt 9", "Mario Kart"],
    installSteps: [
      {
        platform: "all",
        text: "The straightforward PC install is Steam: add Asphalt Legends (free) and let Steam keep it updated. Epic also lists the game.",
      },
      {
        platform: "windows",
        text: "Launch from Steam, sign in with a Gameloft account if prompted, and complete the download. A controller is optional but better than keyboard for arcade racing.",
      },
      {
        platform: "all",
        text: "This is a live-service racer. Expect a shop and events. You can race without paying; skip the store if that is why you are here.",
      },
    ],
    faq: [
      {
        q: "Is Asphalt Legends free?",
        a: "It is free to download and race. Optional real-money purchases exist for cars, packs, and battle passes. You do not have to spend, but the shop is part of the design.",
      },
      {
        q: "Is Asphalt Legends the same as Asphalt Legends Unite?",
        a: "Unite was the live-service name on PC and consoles. Store pages now often say Asphalt Legends. PlayBound keeps the catalog slug asphalt-legends and treats Unite as an alias.",
      },
      {
        q: "Does Asphalt Legends work offline?",
        a: "It expects a broadband connection. Treat it as an online live-service, not a LAN kart racer.",
      },
      {
        q: "Can I play Asphalt Legends with a controller?",
        a: "Yes. Controllers are supported and are the better way to play on PC.",
      },
      {
        q: "Is there a single-player mode?",
        a: "Yes. Career-style and versus-AI events exist alongside multiplayer. The calendar of limited events is still the live-service spine.",
      },
    ],
  },

  "tinywind-pixel-pirate-sailing-game": {
    qualityBar: {
      genuinelyFree: true,
      finished: false,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "TinyWind is a genuinely free-to-play-in-browser pirate sailing roguelite with real wind physics and an active solo developer — early, not finished, and not a live-service cash shop.",
      lastVerified: "2026-08-13",
    },
    longDescription:
      "TinyWind looks like a cute pixel boat and then asks you to sail it properly. Wind is not a decoration: points of sail, apparent wind, and the difference between reaching and running show up in a tiny sprite. Voyages are short roguelite runs — British waters, Spanish waters, treasures with encyclopaedia links, the occasional mythic pet — rather than an open-world pirate MMO.\n\nToday the honest way to play is in the browser at tinywind.io (also listed on itch). A Steam Early Access build is planned; until that ships, PlayBound treats this as a browser game, not a desktop installer. Progress may ask you to register. That is friction, not a gacha window.\n\nIt is early. Modes are still landing. Art is modest. The reason it is in the catalog is that the sailing model is more interesting than ninety percent of ‘click to pirate’ games, and you can try it without paying. If you wanted Sea of Thieves with a crew of five, this is not that. If you wanted ten-minute voyages that actually care about the wind, it is.",
    whyWePickedIt:
      "Free pirate games usually fake the water. TinyWind models the wind well enough that a short browser run feels like sailing, and that is rare enough to list while it is still early.",
    bestFor: [
      "Short pirate voyages in a browser",
      "People who like wind, trim, and points of sail even in pixel art",
      "Roguelite runs rather than a persistent MMO sandbox",
      "Players who will give an early solo-dev game some slack",
    ],
    notFor: [
      "You want a finished 1.0 Steam product today",
      "You want a large-crew social pirate MMO",
      "You refuse to create an account to save progress",
      "You expected a downloaded Windows installer from PlayBound",
    ],
    comparableTo: ["Windward", "Sea of Thieves", "Pixel Piracy", "Sid Meier's Pirates!"],
    installSteps: [
      {
        platform: "all",
        text: "TinyWind plays in your browser. Open https://tinywind.io (or the itch.io page) and start a voyage — there is no PlayBound desktop installer yet.",
      },
      {
        platform: "all",
        text: "Create an account if you want progress saved. Keyboard and touch both work; a Steam build with extra platform support is planned, not required to try the game.",
      },
    ],
    faq: [
      {
        q: "Is TinyWind free?",
        a: "The current browser game is free to play. A paid Steam Early Access build is planned. There is no mobile-style gacha attached to the browser client we are describing.",
      },
      {
        q: "Can I install TinyWind on Windows?",
        a: "Not as a PlayBound launcher title yet. Play it in the browser. Wishlist Steam app 4827130 if you want a future desktop build.",
      },
      {
        q: "Is TinyWind finished?",
        a: "No. It is early and still adding modes. The sailing model is already the reason to try it.",
      },
      {
        q: "Does TinyWind have multiplayer?",
        a: "There is a live world with other captains and ranked/ladder features in development. You can still treat a voyage as a short solo run.",
      },
      {
        q: "Why is this in a catalog of installable games?",
        a: "Because people already look for it on PlayBound, it is free to try, and the honest install path today is the official site — not a third-party zip.",
      },
    ],
  },

  warframe: {
    qualityBar: {
      genuinelyFree: false,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Warframe is a huge, well-made co-op shooter you can play without paying, but Platinum-funded progression shortcuts and its dense living economy need a closer value judgement than a simple ‘free-to-play’ label.",
      lastVerified: "2026-08-13",
    },
    longDescription:
      "Warframe is Digital Extremes’ long-running free-to-play looter shooter: space ninja frames, parkour, guns that turn into melee, and a solar map that has been added to for more than a decade. You can play the whole way as a solo player — the game even has an official Solo matchmaking setting — or run squads of four through the same nodes.\n\nIt is generous for a live-service shooter and it is still a live-service shooter. Platinum buys cosmetics and convenience. Founders and deluxe skins exist. The foundry, mods, and Prime vaults are a second game about logistics. None of that makes the shooting bad. It does mean PlayBound will not stamp genuinelyFree on it.\n\nThe Windows client is a substantial download. Official installers come from Warframe.com (MSI) or Steam. PlayBound will not send you to a random ‘free Warframe’ zip. New players should expect a busy UI and a wiki tab. The payoff is one of the few F2P action games that still feels like a crafted co-op shooter rather than a battle-pass template.",
    whyWePickedIt:
      "If someone asks for a free co-op shooter that is actually large, Warframe is the honest answer — with the cash shop named in the assessment instead of hidden behind a slogan.",
    bestFor: [
      "Co-op looter-shooter players who like movement tech",
      "People willing to learn a dense UI and a long quest list",
      "Solo players who will use the official Solo setting",
      "Anyone who wants a huge free download rather than a 200 MB indie",
    ],
    notFor: [
      "You want a campaign with no live-service economy",
      "You refuse any cosmetic shop on principle",
      "You wanted a tiny install and a ten-minute tutorial",
      "You expected an open-source game",
    ],
    comparableTo: ["Destiny 2", "The Division", "Anthem", "Monster Hunter"],
    installSteps: [
      {
        platform: "all",
        text: "Install Warframe from the official site (Warframe.msi) or add the free Steam app. Do not download ‘cracked’ or third-party clients.",
      },
      {
        platform: "windows",
        text: "Run the installer or Steam, let the launcher finish the large content download, then create a Digital Extremes account if you do not have one.",
      },
      {
        platform: "all",
        text: "On first launch, complete the opening quests before shopping. Use Solo matchmaking if you want to play the star chart without a squad.",
      },
    ],
    faq: [
      {
        q: "Is Warframe free?",
        a: "It is free to download and play. Platinum and a large cosmetic/convenience shop exist. You can progress without paying; you will see the shop.",
      },
      {
        q: "Can I play Warframe solo?",
        a: "Yes. Digital Extremes ships an official Solo matchmaking option. Some content is easier in a squad, but the game is not raid-gated at the start.",
      },
      {
        q: "How big is Warframe?",
        a: "Plan on tens of gigabytes. The launcher download is much larger than a typical open-source catalog title.",
      },
      {
        q: "Should I use Steam or the standalone installer?",
        a: "Either official path is fine. Steam is simpler if you already live there. The standalone MSI from warframe.com is the other supported client.",
      },
      {
        q: "Is Warframe on PlayBound an open-source game?",
        a: "No. It is a commercial live-service title listed so free-to-play PC games have accurate pages, not because it matches the FOSS quality bar.",
      },
    ],
  },

  "mega-man-unlimited": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: false,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Mega Man Unlimited is a complete, free NES-style fangame with no shop — unofficial Capcom fan work, last shipped as a finished 2013 build rather than an actively patched live service.",
      lastVerified: "2026-08-13",
    },
    longDescription:
      "Mega Man Unlimited is MegaPhilX’s 2013 tribute to classic Mega Man: eight Robot Masters, original weapons, extra stages, and challenge modes that go well past a weekend ROM hack. It plays like the NES games on purpose — run, jump, learn a pattern, swap a weapon you earned fairly. There is no battle pass. There is no ‘energy tank microtransaction’.\n\nIt is also a fangame. Capcom did not publish it. PlayBound will not pretend it is Mega Man 11, and we will not host the zip. You download it from the creator’s site (megaphilx.com) and you should understand you are playing unofficial fan work that uses the feel of a commercial series.\n\nDevelopment on Unlimited itself is historical at this point; the 1.3.1 build is the one people mean. If you want an officially licensed Mega Man, buy one from Capcom. If you want a free, complete, brutally fair NES-style campaign that the fan community still points at, this is that game — downloaded from the author, not from a random aggregator.",
    whyWePickedIt:
      "It is one of the few Mega Man fangames that feels like a full numbered entry, it costs nothing, and the honest download is still the creator’s own site.",
    bestFor: [
      "Classic Mega Man fans who want another full eight-robot campaign",
      "Players who like NES difficulty with modern quality-of-life options",
      "People willing to download unofficial fan games from the author",
      "Challenge-mode completionists",
    ],
    notFor: [
      "You only play officially licensed Capcom releases",
      "You want a 2026 live-service with patches every season",
      "You need Steam achievements and cloud saves",
      "You wanted Mega Man X movement rather than classic NES physics",
    ],
    comparableTo: ["Mega Man 9", "Mega Man 10", "Mega Man 11", "Mighty No. 9"],
    installSteps: [
      {
        platform: "all",
        text: "Download Mega Man Unlimited only from the creator’s site at megaphilx.com (the Unlimited game page). Do not use random ‘mega man unlimited free’ file hosts.",
      },
      {
        platform: "windows",
        text: "Unzip the 1.3.1 build and run the game executable. If you use an Xbox controller, the author provides an options file to drop in the game folder.",
      },
      {
        platform: "all",
        text: "This is unofficial fan software, not a Capcom product. Start on Easy if you are rusty; Original is the NES-style default.",
      },
    ],
    faq: [
      {
        q: "Is Mega Man Unlimited official?",
        a: "No. It is a fan game by MegaPhilX. Capcom did not publish it. Buy official Mega Man titles if you want a licensed product.",
      },
      {
        q: "Is Mega Man Unlimited free?",
        a: "Yes. The author distributes it without a store. Download it from megaphilx.com rather than a third-party mirror.",
      },
      {
        q: "Does PlayBound install Mega Man Unlimited for me?",
        a: "No. The launcher recipe is an external link to the official fan page. We do not redistribute the zip.",
      },
      {
        q: "Is it still updated?",
        a: "The widely played build is 1.3.1 from the 2010s. Treat it as a finished fangame, not a live-service with weekly patches.",
      },
      {
        q: "Can I play as anyone besides Mega Man?",
        a: "There is a second playable character unlocked by finishing Original mode, plus extra challenge modes after the main campaign.",
      },
    ],
  },
  holocure: {
    qualityBar: clearsAll(
      "An exceptionally polished roguelite bullet-heaven with 47 distinct Hololive characters, creative super-weapon fusions, cozy home-building simulation, and strictly zero microtransactions."
    ),
    longDescription:
      "HoloCure — Save the Fans! is one of the most mechanically inventive and content-rich bullet-heaven roguelites on PC. Created independently by lead animator and developer Kay Yu, the game began as a passionate tribute to Hololive talent and quickly exploded into a genre landmark with tens of thousands of Overwhelmingly Positive community reviews.\n\nBeneath its vibrant, hand-crafted pixel art lies an enormous amount of mechanical depth. Unlike conventional auto-shooters where characters are largely cosmetic stat skins, HoloCure boasts 47 completely distinct playable idols across Hololive English, Japan, and Indonesia branches. Every single character arrives with their own signature starting weapon, three unique passive skills that fundamentally reshape your survival strategy, and a dedicated Special Attack featuring bespoke animations and screen-clearing effects.\n\nBuildcrafting is where HoloCure truly shines. As swarms of mind-controlled fans close in across sprawling stages, players level up a vast arsenal of offensive weapons and passive utility items. Maxing out complementary weapons allows you to forge devastating Collab weapons at the Golden Anvil. Late in a run, Collabs can be elevated further into Super Collabs—such as Blood Lust, Black Plague, and True Infinite BL Works—transforming a modest attack pattern into an unstoppable, room-sweeping fireworks display.\n\nCustomization expands even deeper through the Stamp system. Up to three of the 22 collectible Stamps can be socketed directly onto your character's primary weapon, altering projectile trajectories, attack speed, critical burst damage, knockback force, or area spread. Combined with support items and stat prisms, no two runs ever feel identical.\n\nCrucially, HoloCure is built with a strictly zero-monetization philosophy. There are no microtransactions, premium currencies, battle passes, or paid shortcuts. The in-game character gacha and permanent stat shop are funded entirely through HoloCoins earned by playing—clearing waves, smashing Holozon crates, and defeating stage bosses. Every character, upgrade, and cosmetic unlock is 100% gameplay-funded.\n\nWhen you need a breather from intense combat runs, HoloCure provides an entire secondary simulation mode called Holo House. Here, players can customize and decorate their home, cultivate crops, fish in serene ponds, cook stat-boosting recipes, recruit and interact with characters, scale the challenging Tower of Suffering, or test their luck with minigames in the Usada Casino.\n\nWhether chasing competitive leaderboards in the standardized Time Attack mode (racing to rescue 4,000 fans), surviving deep into Endless Mode, or exploring hundreds of weapon combinations on handheld PCs and Steam Deck, HoloCure delivers a premier, endlessly replayable action experience that costs absolutely nothing.",
    bestFor: [
      "Fans of Vampire Survivors looking for much deeper character buildcrafting, weapon synergies, and super collabs",
      "Players who love permanent progression and minigames (farming, fishing, housing, casino) alongside compact 20-minute action runs",
      "Handheld PC and controller players wanting a lightweight, highly responsive pixel-art bullet heaven with zero microtransactions",
      "Gamers seeking massive replayability across 47 uniquely designed characters with distinct playstyles",
    ],
    notFor: [
      "Players looking for official built-in online multiplayer out of the box (the vanilla game is strictly single-player)",
      "Anyone expecting native mobile (Android/iOS) support—HoloCure is built for Windows and Linux/Steam Deck PCs",
      "Those seeking realistic 3D AAA graphics rather than polished, vibrant 2D pixel art",
    ],
    comparableTo: [
      "Vampire Survivors",
      "Magic Survival",
      "Brotato",
      "Death Must Die",
      "20 Minutes Till Dawn",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Click 'Install with PlayBound Launcher' or download the standalone archive directly from the official itch.io / Steam distribution.",
      },
      {
        platform: "linux",
        text: "On Linux and Steam Deck, PlayBound Launcher extracts HoloCure into your library and launches it seamlessly via Proton / Wine with full controller and Deck support.",
      },
      {
        platform: "all",
        text: "Launch the game and configure your preferred input method. While full keyboard controls are supported, playing with an Xbox, PlayStation, or 8BitDo controller is strongly recommended.",
      },
    ],
    faq: [
      {
        q: "Is HoloCure completely free or does it have microtransactions?",
        a: "HoloCure is 100% free with absolutely zero monetization or microtransactions. The in-game character gacha and shop upgrades use HoloCoins earned strictly through regular gameplay.",
      },
      {
        q: "Can I play HoloCure on Linux, Steam Deck, or with a controller?",
        a: "Yes! HoloCure holds a Platinum rating on ProtonDB and runs flawlessly on Linux desktops and Steam Deck via Wine/Proton. Full gamepad support is built-in.",
      },
      {
        q: "Does HoloCure have multiplayer?",
        a: "The official vanilla game is strictly single-player. While community members have developed unofficial multiplayer and sandbox mods using tools like YYToolkit, the base game contains no official online co-op.",
      },
      {
        q: "What is Holo House?",
        a: "Holo House is a massive secondary life-sim mode within HoloCure where you can decorate your home, cultivate crops, fish, cook recipes, interact with characters, and play minigames at the Usada Casino.",
      },
      {
        q: "How do Collabs and Super Collabs work?",
        a: "By maxing out two compatible base weapons, you can combine them using a Golden Anvil to create a powerful Collab weapon. Fusing a Collab with a specific maxed item creates a screen-clearing Super Collab.",
      },
      {
        q: "Is HoloCure an official Hololive product?",
        a: "No. HoloCure is an unofficial fan game created by Kay Yu under Cover Corp's Hololive Derivative Works Guidelines, featuring original artwork and custom soundtrack remixes by Eufrik.",
      },
    ],
  },
  "quake-champions": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "High-intensity arena combat that pairs Quake's legendary speed and weapon triangle with character-specific movement mechanics and active abilities.",
      lastVerified: "2026-08-15",
    },
    longDescription:
      "Quake Champions is the modern revival of the foundational arena first-person shooter genre, developed by id Software in conjunction with Saber Interactive. Carrying forward the DNA of Quake III Arena and Quake Live, the game centers around blisteringly fast movement, pinpoint weapon accuracy, and map control. It introduces a roster of 16 distinct Champions—ranging from series icons like Ranger, Visor, and Doom Slayer to guest characters like B.J. Blazkowicz—each equipped with tailored active abilities and movement styles like crouch sliding, air control, and rocket jumping.\n\nAt the core of the combat loop is Quake's legendary Holy Trinity of weaponry: the Rocket Launcher for area denial and aerial juggles, the Lightning Gun for close-to-mid-range tracking, and the Railgun for long-range hitscan punishment. Complementing these are the Super Shotgun, Heavy Machinegun, Tri-bolt, and Plasma Gun. Weapons spawn on fixed timers across intricately balanced gothic, elder god, and industrial arenas, requiring players to control mega health, heavy armor, and power-ups like Quad Damage and Protection.\n\nGame modes span casual and competitive playstyles. Casual queues feature classic Deathmatch, 4v4 Team Deathmatch, Instagib, Unholy Trinity (infinite ammo with rockets, rail, and lightning only), and Clan Arena. For competitive purists, the ranked 1v1 Duel ladder tests raw mechanical aim, spatial awareness, and item timing in intense multi-round showdowns.\n\nThe game features dedicated global servers with modern netcode, custom lobby hosting, extensive crosshair and FOV customization, and comprehensive stats tracking. Crossplay between Steam and PC Game Pass ensures healthy matchmaking pools across North America, Europe, and international regions.\n\nQuake Champions remains the most accessible modern gateway into pure, uncompromised arena FPS mechanics: there is no loadout advantage, no sprint penalty, and no bloom—only mechanical skill, speed, and map intelligence.",
    whyWePickedIt:
      "We added Quake Champions because it represents the highest mechanical skill ceiling in competitive first-person shooters. At a time when modern shooters favor automated aim assist, sprint fatigue, and tactical low-mobility positioning, Quake Champions celebrates raw mechanical mastery, rocket jumping acrobatics, and tactical item control—all in a completely free-to-play package.",
    bestFor: [
      "Competitive FPS veterans who love rocket jumping, strafe jumping, and fast arena combat",
      "Duelists looking for the ultimate 1v1 tactical shooter experience",
      "Players wanting pure mechanical aim drills (tracking, flicking, projectile prediction)",
      "Fans of Quake III Arena and Unreal Tournament looking for a modern matchmade title",
      "Gamers with high-refresh-rate monitors seeking responsive uncapped frame rates",
    ],
    notFor: [
      "Players who prefer tactical, slow-paced mil-sims (e.g. CS2, Valorant, or Rainbow Six)",
      "Those looking for a single-player narrative campaign",
      "Casual players frustrated by high initial mechanical skill curves",
      "Pilots wanting modifiable source-port servers (which classic Quake III / OpenArena offer instead)",
    ],
    comparableTo: [
      "Quake III Arena",
      "Quake Live",
      "OpenArena",
      "Unreal Tournament",
      "Diabotical",
      "Team Fortress 2",
      "Splitgate",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Install and launch Quake Champions for free on Steam (App ID 611500). PlayBound connects directly with Steam to launch the client.",
      },
      {
        platform: "windows",
        text: "Adjust mouse raw input, Field of View (105-120 FOV recommended), and uncapped framerate settings in the in-game Video and Controls menus.",
      },
      {
        platform: "linux",
        text: "On Linux and Steam Deck, run through Proton (GE-Proton or Proton Experimental). Enable anti-cheat compatibility for online matchmaking.",
      },
      {
        platform: "all",
        text: "Complete the initial Tutorial in the Practice arena to earn your first Champion unlocks and familiarize yourself with movement mechanics.",
      },
    ],
    faq: [
      {
        q: "Is Quake Champions free?",
        a: "Yes. Quake Champions is completely free-to-play on Steam with full access to all casual and ranked game modes, public matchmaking, and custom games.",
      },
      {
        q: "How do I unlock Champions?",
        a: "Champions can be unlocked permanently with in-game Shards earned from leveling up, completing daily challenges, and battle pass tiers. You can also rent Champions for 24 hours with Favor or purchase the full Champions Pack.",
      },
      {
        q: "What is the Holy Trinity in Quake?",
        a: "The Holy Trinity refers to the three core weapons that define high-level Quake combat: the Rocket Launcher (projectile splash damage and vertical mobility), Lightning Gun (continuous close-range tracking beam), and Railgun (high-damage long-range hitscan rifle).",
      },
      {
        q: "Does Quake Champions run on Linux and Steam Deck?",
        a: "Yes. Quake Champions runs smoothly on Linux distributions and Steam Deck using Valve's Proton compatibility layer.",
      },
      {
        q: "Can I host custom matches with friends?",
        a: "Yes. Custom games allow you to select any arena, configure specific game modes (including Instagib, Duel, TDM, and Unholy Trinity), adjust match timers, and invite friends to private lobbies.",
      },
      {
        q: "How does movement in Quake Champions work?",
        a: "Movement relies on classic Quake physics: hold forward and jump, then alternate strafe keys and smooth mouse turns to build momentum (strafe jumping). Different Champions also feature unique movement traits such as Slash's crouch slide, Visor's uncapped speed, and Anarki's air control.",
      },
    ],
  },
  triplea: {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "TripleA clears the PlayBound Bar by turning a free engine and a huge community map library into the best kind of all-night board-game argument.",
      lastVerified: "2026-08-25",
    },
    longDescription:
      "TripleA is what happens when a board-game group refuses to let setup time, missing pieces, or living in different cities cancel game night. It is a free strategy engine built for maps with a lot of borders, armies with a lot of counters, and players who enjoy arguing about whether the transport fleet should have moved last turn.\n\nThe familiar starting point is Axis & Allies-style global war. You buy units with industrial production, move them across land and sea, then let the dice resolve the plan you were absolutely certain could not fail. Combined arms matter. Aircraft need somewhere to land. Submarines become much less mysterious when destroyers arrive. The rules are readable, but the consequences spread across the whole map.\n\nTripleA's real trick is that the engine is only the table. Its in-game downloader opens a broad community library covering world wars, ancient empires, fantasy settings, alternate histories, and smaller experiments that bend the rules in unexpected directions. You can move from Global 1940 to Middle-earth without installing another game or hunting through abandoned forum attachments.\n\nIt is also unusually flexible about how friends show up. Sit around one computer in hotseat, meet in the online lobby, connect directly through a private network, or stretch a campaign across days with play-by-email. PlayBound Connect is there when a group wants the direct route without router work. Solo players get several AI choices, though the real magic is still another person staring at the same impossible front line.\n\nTripleA is not flashy, and it does not pretend dice are fair because your plan was clever. That is exactly why it works. The interface gets out of the way, the map becomes the story, and one more turn can quietly consume an evening.",
    whyWePickedIt:
      "We picked TripleA because it removes nearly every practical excuse not to start a big strategy night. The engine is free, the maps arrive through the game, and friends can play live, hotseat, direct, or asynchronously. It feels less like a single product and more like a well-kept communal game cupboard—and PlayBound Connect gives private groups one more simple way to reach the same table.",
    bestFor: [
      "Fans of Axis & Allies, Risk, and classic tabletop grand strategy board games",
      "Turn-based wargamers who enjoy macro-economic resource management (IPCs) and combined-arms military logistics",
      "History enthusiasts wanting hundreds of scenarios from Ancient Rome to WWI, WWII, and the Cold War",
      "Multiplayer groups wanting hotseat, online lobby, or asynchronous Play-by-Email (PBEM) matches",
      "Linux, macOS, and Windows gamers looking for a lightweight, cross-platform strategy engine",
    ],
    notFor: [
      "Gamers looking for fast-paced real-time strategy (RTS) or action combat",
      "Players wanting 3D cinematic animations rather than tactical 2D map board representations",
      "Those who dislike dice-based combat probability and attrition calculations",
    ],
    comparableTo: [
      "Axis & Allies 1942 Online",
      "Hearts of Iron IV",
      "Strategic Command: World at War",
      "Gary Grigsby's War in the East",
      "Freeciv",
      "The Battle for Wesnoth",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download and run the official 64-bit Windows installer from PlayBound or the TripleA website. The installer includes bundled Java for zero-configuration setup.",
      },
      {
        platform: "linux",
        text: "On Linux, run the native shell installer or extract the portable tarball with openjdk-11 or higher.",
      },
      {
        platform: "macos",
        text: "On macOS, open the native .dmg package and drag TripleA to your Applications folder.",
      },
      {
        platform: "all",
        text: "Launch TripleA and click 'Download Maps' from the main menu to browse and install over 400 community scenarios including World War II Global 1940.",
      },
    ],
    faq: [
      {
        q: "Is TripleA completely free?",
        a: "Yes! TripleA is 100% free and open source under the GPL-3.0 license. All 400+ community maps, rule engines, and multiplayer features are completely free forever.",
      },
      {
        q: "How do I download more maps in TripleA?",
        a: "From the TripleA main menu, simply click 'Download Maps'. The in-game downloader lets you filter, preview, and download hundreds of community-created historical and fantasy scenarios with one click.",
      },
      {
        q: "Can I play multiplayer with friends?",
        a: "Yes! TripleA supports four multiplayer methods: the built-in Official Online Lobby (finding public matches worldwide), Direct Connect (LAN or IP), Local Hotseat (passing the keyboard/mouse on one PC), and Play-by-Email (PBEM) / Play-by-Forum.",
      },
      {
        q: "Does TripleA require Java to be installed?",
        a: "The official Windows and macOS installers come bundled with an integrated Java Runtime Environment (JRE), so you do not need to install Java manually.",
      },
      {
        q: "Can I play solo against the computer?",
        a: "Yes! TripleA includes multiple AI bot engines—including Fast AI, Hard AI, and Pro AI—capable of managing complex multi-nation economies, naval operations, and combat maneuvers.",
      },
      {
        q: "What is WWII Global 1940 in TripleA?",
        a: "World War II Global 1940 is one of the most popular community scenarios in TripleA, uniting the European and Pacific theaters into a massive worldwide war with accurate starting orders of battle, national objectives, and political rules.",
      },
    ],
  },
  "gradius-remake": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "A flawless, widescreen-enhanced modern tribute to the foundational 1985 arcade side-scrolling shoot 'em up that defined the genre.",
      lastVerified: "2026-08-15",
    },
    longDescription:
      "Gradius Remake is a loving, high-framerate modern PC recreation of Konami's landmark 1985 arcade shoot 'em up. As the pilot of the legendary hyperspace starfighter Vic Viper, players embark on a desperate solo campaign across deep space to destroy the invading bio-mechanical armada of the Bacterian Empire and save Planet Gradius from annihilation.\n\nThe game preserves the revolutionary horizontal power-up gauge that transformed the shoot 'em up genre forever. Slaying red enemy formations releases glowing orange power capsules; collecting each capsule advances an illuminated selection cursor across six upgrade tiers: Speed Up (stackable engine propulsion), Missile (ground-dropping diagonal bombs), Double (angled forward-and-upward cannons), Laser (piercing horizontal plasma beams), Option (glowing satellite drones that duplicate every shot fired), and ? (frontal directional shield barrier).\n\nLevel design tests pure situational awareness and twitch reflexes across classic and reimagined sectors. Navigate deadly cosmic asteroid fields, weave through impenetrable volcanic cavern mazes with churning magma columns, dodge laser-spewing Moai stone monoliths, and breach organic cellular fortresses guarded by pulsing tentacle monstrosities.\n\nEvery stage culminates in a legendary confrontation with the Bacterian mothership Big Core. Players must carefully weave between rotating blue laser volleys, shoot through protective energy shields, and destroy the glowing central core before the mothership charges across the screen.\n\nThis modernized remake features smooth 60 FPS performance, crisp widescreen presentation, optional retro CRT scanline shaders, rearranged stereo arcade soundtracks, and native USB gamepad / arcade stick mapping. A timeless arcade masterclass built for classic shmup veterans and new pilots alike.",
    whyWePickedIt:
      "Gradius established the foundational DNA of horizontal arcade shooters: customizable weapon gauges, iconic Option satellite drones, and memorable boss battles. This remake perfectly preserves the tense challenge of the arcade original while delivering silky 60 FPS widescreen action on modern PCs.",
    bestFor: [
      "Retro arcade and shoot 'em up enthusiasts who love Vic Viper, R-Type, and classic side-scrollers",
      "Players who appreciate customizable weapon bar power-up systems and tactical loadout planning",
      "Gamers seeking intense reflex-driven boss fights and high-score chasing",
      "Steam Deck and PC gamers wanting a lightweight, zero-bloat portable arcade title with gamepad support",
      "Fans of 80s arcade chiptune soundtracks and pixel art aesthetic",
    ],
    notFor: [
      "Gamers looking for modern bullet-hell shmups with microscopic hitboxes and screen-clearing bombs",
      "Players frustrated by 'checkpoint recovery' loops where losing power-ups makes recovery challenging",
      "Those seeking multi-hour narrative-heavy RPG storylines",
    ],
    comparableTo: [
      "R-Type Dimensions",
      "Dariusburst: Chronicle Saviours",
      "Salamander / Life Force",
      "Super Hydorah",
      "ZeroRanger",
      "Thunder Force IV",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download the portable Gradius Remake archive via PlayBound or the official archive. Extract the folder to any directory and launch Gradius.exe.",
      },
      {
        platform: "windows",
        text: "Connect any USB gamepad or arcade stick. Access the in-game Options menu to configure fire buttons and optional CRT scanline filters.",
      },
      {
        platform: "linux",
        text: "On Linux and Steam Deck, run Gradius.exe through Proton or Wine with full gamepad recognition.",
      },
      {
        platform: "all",
        text: "Learn the power-up order: prioritize 1-2 Speed Ups and an initial Option drone before committing to Double or Laser weaponry.",
      },
    ],
    faq: [
      {
        q: "How does the Gradius power-up meter work?",
        a: "Collecting orange power capsules moves your selection cursor from left to right along the bottom bar: Speed Up -> Missile -> Double -> Laser -> Option -> ? (Shield). Pressing the Power-Up button activates whichever upgrade is currently highlighted and resets the cursor to the start.",
      },
      {
        q: "What do the Option shadow drones do?",
        a: "Option drones (also known as Multiples) are glowing orange energy satellites that trail your Vic Viper's exact movement path and duplicate all of your active primary weapons and missiles, multiplying your firepower up to four times.",
      },
      {
        q: "Can I use the Konami Code in Gradius Remake?",
        a: "Yes! Entering the legendary Konami Code (Up, Up, Down, Down, Left, Right, Left, Right, B, A) when paused instantly equips your Vic Viper with a full suite of power-ups.",
      },
      {
        q: "Does Gradius Remake support controllers and arcade sticks?",
        a: "Yes. The game features native XInput and DirectInput support for Xbox, PlayStation, 8BitDo, and arcade fight sticks with remappable action buttons.",
      },
      {
        q: "What is the difference between Double and Laser?",
        a: "Double and Laser are mutually exclusive primary weapons: Double fires one forward shot and one diagonal upward shot (great for ceiling turrets), while Laser fires a continuous piercing horizontal beam that obliterates entire enemy columns.",
      },
      {
        q: "What happens when you lose a life in Gradius?",
        a: "When destroyed, you respawn at the nearest stage checkpoint with a stock Vic Viper and lose all accumulated power-ups. Recovering from a death requires careful dodging to rebuild your Speed and Option drones.",
      },
    ],
  },
  "genshin-impact": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "A masterclass in free-to-play open-world action RPG design, delivering console-grade exploration, intricate elemental combat, and breathtaking orchestral world-building.",
      lastVerified: "2026-08-15",
    },
    longDescription:
      "Genshin Impact is HoYoverse's monumental open-world action role-playing game. Set in the expansive, breathtaking fantasy continent of Teyvat, players awaken as the Traveler—an interdimensional voyager separated from their twin by an unknown god. Guided by the cheerful fairy companion Paimon, your quest leads you across seven distinct elemental nations (Mondstadt, Liyue, Inazuma, Sumeru, Fontaine, Natlan, and Snezhnaya), each ruled by an Archon god and steeped in rich regional lore and distinct musical scores.\n\nCombat centers on a fluid, action-packed elemental reaction system. Characters wield one of seven elements: Pyro (Fire), Hydro (Water), Cryo (Ice), Electro (Lightning), Anemo (Wind), Geo (Earth), and Dendro (Nature). By swapping seamlessly between four characters in active combat, players trigger high-impact elemental chain reactions—such as Vaporize and Melt for catastrophic damage multipliers, Swirl for elemental spreading, Frozen for crowd control, and Bloom/Hyperbloom for automated homing dendro cores.\n\nTeyvat offers one of the most rewarding open worlds in gaming. Players can scale any cliffside, glide across mountain ranges, dive underwater in Fontaine, navigate lava rivers in Natlan, and uncover thousands of environmental puzzles, hidden chests, Seelie guides, and time-trial challenges. Rewarding exploration directly fuels character progression with Primogems, artifact upgrades, and talent materials.\n\nThe game delivers hundreds of hours of fully voiced main Archon Quests, character Story Quests, and intricate world exploration questlines rivaling full-priced single-player RPGs. A deep progression loop includes the Spiral Abyss endgame dungeon, Imaginarium Theater, artifact domain farming, and periodic major seasonal festival events.\n\nWhile featuring a gacha character wish system, all story content, exploration, world quests, and events can be cleared entirely with the free guaranteed starter cast (Traveler, Amber, Kaeya, Lisa, Xiangling, Barbara, Lynette, and Collei). Genshin Impact supports seamless cross-save and cross-play across PC, PlayStation, iOS, and Android.",
    whyWePickedIt:
      "Genshin Impact proved that a free-to-play live-service game could deliver single-player open-world quality on par with the finest prestige console RPGs. Its breathtaking art direction, lush orchestral soundtrack, deep elemental combat, and massive free world make it an extraordinary achievement in PC gaming.",
    bestFor: [
      "Fans of rich open-world exploration, environmental puzzles, and Breath of the Wild-style gliding/climbing",
      "Action RPG players who enjoy character switching and multi-elemental reaction combos",
      "Gamers looking for hundreds of hours of high-production, fully voiced anime narrative and lore",
      "Players wanting cross-platform progression and co-op with friends on PC, mobile, and PlayStation",
      "Free-to-play gamers looking for a complete, high-quality RPG experience without mandatory spending",
    ],
    notFor: [
      "Players looking for competitive PvP multiplayer or server browsers (Genshin is entirely PvE)",
      "Those sensitive to gacha monetization systems or stamina-gated daily artifact farming",
      "Linux/Steam Deck users who cannot run HoYoverse's proprietary anti-cheat without unofficial workarounds",
    ],
    comparableTo: [
      "Honkai: Star Rail",
      "Wuthering Waves",
      "The Legend of Zelda: Breath of the Wild",
      "Granblue Fantasy: Relink",
      "Tower of Fantasy",
      "Zenless Zone Zero",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download and run the official HoYoPlay standalone PC installer from HoYoverse. PlayBound integrates directly with HoYoPlay to detect and launch your installation.",
      },
      {
        platform: "windows",
        text: "Install Genshin Impact through HoYoPlay. An SSD is strongly recommended to ensure smooth open-world asset streaming and fast loading times.",
      },
      {
        platform: "windows",
        text: "Launch Genshin Impact, select your preferred server region (America, Europe, Asia, or TW/HK/MO), and log in with your HoYoverse account.",
      },
      {
        platform: "all",
        text: "Complete the Prologue Archon Quest in Mondstadt to unlock elemental resonance, your glider license, and your first free companion party members.",
      },
    ],
    faq: [
      {
        q: "Can I play Genshin Impact without spending any money?",
        a: "Yes. 100% of the storyline, open world, domains, and limited-time events are completely free with no paywalls. The game regularly awards free Primogems through exploration, quests, daily commissions, and events to let free-to-play players Wish on exclusive 5-star character and weapon banners.",
      },
      {
        q: "How does Co-Op multiplayer work in Genshin Impact?",
        a: "Co-Op unlocks at Adventure Rank (AR) 16. Up to four players on the same server region can explore the host's world together, clear domains and weekly bosses, fight world bosses, and gather resources.",
      },
      {
        q: "Does Genshin Impact support cross-save across devices?",
        a: "Yes. By linking your HoYoverse account, your progress, characters, and inventory seamlessly sync across PC, iOS, Android, and PlayStation platforms on the same regional server.",
      },
      {
        q: "Can Genshin Impact be played on Steam Deck or Linux?",
        a: "Genshin Impact does not officially support Linux or Steam Deck due to its kernel-level anti-cheat. While community compatibility layers exist, official PC support is limited to Windows 10 and 11.",
      },
      {
        q: "What are the best starter characters given for free?",
        a: "You receive Traveler (adaptable across all 7 elements), Amber (Pyro archer), Kaeya (Cryo sword), Lisa (Electro catalyst), Barbara (Hydro healer), Xiangling (one of the strongest Pyro sub-DPS in the game from Spiral Abyss Floor 3), Collei (Dendro bow), and Lynette (Anemo sword).",
      },
      {
        q: "How does the 50/50 and Pity system work in Genshin Impact?",
        a: "Character event banners guarantee a 5-star character within 90 Wishes (Soft Pity starts around 74). If your first 5-star is not the featured promotional character (a '50/50 loss'), your next 5-star character is 100% guaranteed to be the featured character.",
      },
    ],
  },
  "dota-2": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The pinnacle of hardcore competitive MOBA design, featuring complete roster freedom from day one, unparalleled strategic depth, and a rich community Workshop arcade.",
      lastVerified: "2026-08-15",
    },
    longDescription:
      "Dota 2 is Valve's definitive competitive multiplayer online battle arena, originating from the foundational Defense of the Ancients community mod in Warcraft III. Two factions of five players—the Radiant and the Dire—battle across three lanes and a massive dynamic map to breach enemy defenses and shatter the opposing team's Ancient. With over a decade of continuous iteration on the Source 2 engine, Dota 2 stands as one of the most mechanically complex and strategically rewarding competitive games in existence.\n\nUnlike almost every other free-to-play competitive title, Dota 2 provides every single hero—all 124+ and counting—unconditionally unlocked and completely free to play from your very first match. Heroes are organized into Core and Support positions across Strength, Agility, Intelligence, and Universal attributes, with capabilities ranging from global map presence (Invoker, Nature's Prophet) and game-warping ultimates (Enigma's Black Hole, Faceless Void's Chronosphere) to intricate illusion micro-management (Phantom Lancer, Meepo).\n\nGameplay depth is driven by uncompromising mechanics rarely found in other MOBAs. Players can 'deny' their own allied creeps, towers, and even teammates to starve opponents of gold and experience. Elevated terrain imposes high-ground miss chances and vision blockages, trees can be cut or eaten for tactical juking paths, and day/night cycles alter hero vision radii. An extensive item shop includes game-changing active tools like Blink Dagger, Black King Bar (magic immunity), and Aghanim's Scepter which fundamentally alters or grants new hero abilities.\n\nControlling the massive expanded map requires mastery of neutral camp stacking, Lotus Pools, Tormentors for team-wide shard upgrades, Twin Gates for instant cross-map teleports, and the contested Roshan pit for the game-swinging Aegis of the Immortal and Cheese. This tactical sandbox produces endless strategic diversity in both ranked matchmaking and premier esports tournaments like The International.\n\nComplementing the core 5v5 competitive experience is the Steam Workshop Arcade—a thriving community mod ecosystem hosting hit custom game modes like Dota Auto Chess, Ability Draft, Overthrow, and custom RPGs. Dota 2 is fully cross-platform across Windows, Linux, and macOS, with native Steam Deck support and zero pay-to-win mechanics.",
    whyWePickedIt:
      "Dota 2 is the most generous and strategically profound competitive game on PC. By offering every single hero completely free from day one without grinding or paywalls, it sets the standard for consumer-friendly esports while maintaining an unmatched competitive skill ceiling.",
    bestFor: [
      "Competitive players wanting the deepest mechanical and strategic complexity in the MOBA genre",
      "Gamers who appreciate 100% free character rosters with zero grinding or pay-to-unlock heroes",
      "Fans of micro-management, active items, positioning, and tactical creep denying",
      "Players wanting community custom games (Auto Chess, Overthrow, Custom Hero Chaos) via Steam Workshop",
      "Linux and Steam Deck gamers seeking native cross-platform support with Vulkan",
    ],
    notFor: [
      "Players wanting casual, low-complexity drop-in matches with short learning curves",
      "Those frustrated by turn rates, complex active item inventories, or punishing mistake windows",
      "Single-player gamers looking for an offline story campaign",
    ],
    comparableTo: [
      "League of Legends",
      "Heroes of the Storm",
      "Smite",
      "Deadlock",
      "Predecessor",
      "Heroes of Newerth",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Install and launch Dota 2 for free on Steam (App ID 570). PlayBound connects directly with Steam to launch the client.",
      },
      {
        platform: "linux",
        text: "On Linux and Steam Deck, Dota 2 runs natively with full Vulkan graphics acceleration and native gamepad/controller configurations.",
      },
      {
        platform: "macos",
        text: "On macOS, Dota 2 runs through Steam with native Metal graphics support.",
      },
      {
        platform: "all",
        text: "Complete the in-game 'Learn' tab and initial bot matches to familiarize yourself with the courier, neutral items, and basic shop navigation.",
      },
    ],
    faq: [
      {
        q: "Are all heroes in Dota 2 really free?",
        a: "Yes. Every single one of Dota 2's 124+ heroes is 100% free and unlocked from your very first match. There is zero champion grinding, currency unlocking, or paywalling. Microtransactions are strictly cosmetic.",
      },
      {
        q: "What is the deny mechanic in Dota 2?",
        a: "By right-clicking low-health allied creeps (below 50% health), you can deal the killing blow yourself ('deny'). This prevents the enemy hero from receiving gold and cuts the experience they earn from that creep in half. You can also deny low-health allied towers.",
      },
      {
        q: "Can I play custom games and mods in Dota 2?",
        a: "Yes. Dota 2 features a built-in Arcade tab powered by the Steam Workshop. Popular custom games like Dota Auto Chess, Overthrow, Custom Hero Chaos, and Ability Draft can be launched with one click directly inside the client.",
      },
      {
        q: "Does Dota 2 run natively on Steam Deck and Linux?",
        a: "Yes. Valve maintains a native Linux client for Dota 2 with full Vulkan graphics support, native 64-bit binaries, and verified Steam Deck controller support.",
      },
      {
        q: "What is The International (TI)?",
        a: "The International is Dota 2's premier annual world championship tournament, renowned for featuring the largest crowdfunded prize pools in esports history and crowning the world's best Dota 2 team.",
      },
      {
        q: "What is the difference between Core and Support positions in Dota 2?",
        a: "Dota 2 uses a 1-through-5 priority system: Position 1 (Safe Lane Carry) and Position 2 (Mid Laner) receive the highest farm priority; Position 3 (Offlaner) initiates teamfights and creates space; Position 4 (Soft Support) roams and secures objectives; Position 5 (Hard Support) buys team utility items, wards, and protects the carry.",
      },
    ],
  },
  "league-of-legends": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The defining competitive MOBA of the modern era, pairing deep team strategy and 165+ champion toolkits with unmatched tactical nuance and continuous live balance.",
      lastVerified: "2026-08-15",
    },
    longDescription:
      "League of Legends (LoL) is Riot Games' genre-defining 5v5 multiplayer online battle arena. Since its 2009 debut, the game has evolved into one of the most played and watched video games in history. Matches take place on Summoner's Rift—a symmetrical arena with three lanes (Top, Mid, Bot), an extensive neutral jungle, and a river intersecting the map. Two teams of five players select unique champions and work cooperatively to destroy enemy defensive towers, control neutral objectives, and shatter the enemy's Nexus core.\n\nAt the center of League's enduring depth is its monumental roster of over 165 playable champions. Each champion features an asymmetric kit comprising a unique passive and four active abilities, categorized into six primary playstyle classes: durable Tanks who initiate teamfights, burst Assassins targeting priority carries, control Mages dealing sustained magic damage, ranged Marksmen (ADCs) scaling into late-game powerhouses, versatile Fighters brawling on the front line, and utility Supports providing vision, shields, and crowd control.\n\nStrategy hinges on micro-mechanical execution and macro-map decision making. Players earn gold and experience by last-hitting lane minions, clearing jungle camps, and eliminating enemy champions. This economy fuels a comprehensive shop with hundreds of synergistic legendary and mythic items that adapt to situational team comps—countering tank armor, building anti-heal Grievous Wounds, or securing survivability through active items like Zhonya's Hourglass.\n\nControlling neutral objectives dictates the tempo of the late game. Slaying Elemental Drakes grants cumulative elemental buffs culminating in powerful Dragon Souls, while the Elder Dragon provides an execute threshold on low-health enemies. Securing Baron Nashor empowers minion waves with siege capabilities, enabling teams to crack open heavily fortified base inhibitors.\n\nBeyond competitive 5v5 Ranked Draft and Clash tournaments, League offers alternate game modes such as All Random All Mid (ARAM) on the single-lane Howling Abyss for continuous teamfighting, and periodic rotating modes like Arena (2v2v2v2 augments) and URF (Ultra Rapid Fire). Free-to-play with all gameplay-affecting elements earnable via in-game Blue Essence, League of Legends remains the pinnacle of tactical competitive PC gaming.",
    whyWePickedIt:
      "League of Legends is the gold standard of competitive MOBA design. With its bi-weekly balance updates, massive champion variety, intricate teamfight dynamics, and vibrant global esports scene, it offers virtually infinite competitive replayability with zero pay-to-win barriers.",
    bestFor: [
      "Players who love deep strategic teamplay, lane management, and coordinated 5v5 teamfights",
      "Competitive gamers seeking an established, highly active ranked ladder with millions of players",
      "Fans of intricate character mechanics and theorycrafting item synergies across 165+ champions",
      "Players wanting fast, casual teamfighting in ARAM (All Random All Mid)",
      "Low-spec PC owners wanting smooth 60+ FPS performance on modest hardware",
    ],
    notFor: [
      "Players seeking single-player offline campaigns or casual pauseable games",
      "Gamers unwilling to install Riot Vanguard kernel-level anti-cheat on Windows",
      "Those frustrated by steep learning curves and high communicative team dependencies",
      "Linux/Steam Deck users (Vanguard anti-cheat does not support Linux/Proton)",
    ],
    comparableTo: [
      "Dota 2",
      "Heroes of the Storm",
      "Smite",
      "Predecessor",
      "League of Legends: Wild Rift",
      "Battlerite",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download and run the official Riot Games installer (live.na.exe / Install-League-of-Legends-NA.exe). PlayBound integrates directly with the Riot Client to detect and launch your installation.",
      },
      {
        platform: "windows",
        text: "Follow the on-screen prompts to install the Riot Client, League of Legends, and Riot Vanguard anti-cheat. Restart your PC if prompted to initialize Vanguard kernel drivers.",
      },
      {
        platform: "macos",
        text: "On macOS, download the native DMG installer. League of Legends runs natively on Intel and Apple Silicon Macs without requiring Vanguard.",
      },
      {
        platform: "all",
        text: "Complete the initial Tutorial matches to learn lane navigation, last-hitting, turret aggro, and unlock your first starter champion capsules.",
      },
    ],
    faq: [
      {
        q: "Is League of Legends completely free to play?",
        a: "Yes. League of Legends is 100% free-to-play. All champions can be unlocked permanently using Blue Essence earned through level-up capsules, first-win bonuses, and event missions. Microtransactions are strictly limited to cosmetics (skins, emotes, ward skins, and chromas).",
      },
      {
        q: "What is Riot Vanguard and why is it required?",
        a: "Riot Vanguard is Riot Games' custom kernel-level anti-cheat system designed to prevent scripting, vision hacks, and botting in League of Legends. It is mandatory on Windows 10 and 11 (requiring TPM 2.0 and Secure Boot on Windows 11).",
      },
      {
        q: "Can I play League of Legends on macOS or Linux?",
        a: "League of Legends runs natively on macOS (Apple Silicon and Intel). However, due to Vanguard anti-cheat requirements, League of Legends is not supported on Linux or Steam Deck via Proton/Wine.",
      },
      {
        q: "What is the difference between Summoner's Rift and ARAM?",
        a: "Summoner's Rift is the standard 3-lane competitive map featuring a jungle, neutral objectives (Baron and Dragons), and structured strategic phases. ARAM (All Random All Mid) takes place on a single bridge (the Howling Abyss) with random champion assignments, constant 5v5 teamfights, and accelerated gold/XP gain.",
      },
      {
        q: "How do I unlock champions without spending real money?",
        a: "Every time you level up your account, you receive a Champion Capsule containing Champion Shards. You can disenchant unwanted shards into Blue Essence or upgrade them at a discount to permanently unlock that champion.",
      },
      {
        q: "What are the six champion classes in League?",
        a: "The classes are Tanks (high health and crowd control), Fighters/Bruisers (melee damage and durability), Assassins (high mobility and burst damage), Mages (ranged area-of-effect magic abilities), Marksmen/ADCs (sustained ranged physical damage), and Supports (healing, shields, peel, and vision control).",
      },
    ],
  },
  "team-fortress-2": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The undisputed masterpiece of class-based shooters, combining timeless cartoon art direction, expressive rocket-jumping movement, and infinite tactical variety across nine iconic mercenaries.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "Team Fortress 2 is an enduring masterpiece of multiplayer game design. Its asymmetric class balance, rocket jumping mechanics, timeless art direction, and massive community-hosted server scene offer endless tactical variety with zero pay-to-win barriers.",
    longDescription:
      "Team Fortress 2 (TF2) is Valve's legendary class-based first-person shooter. Set in a charming 1960s spy-fi universe, the game pits Reliable Excavation Demolition (RED) against Builders League United (BLU) across objective-driven game modes including Payload, Control Points, King of the Hill, and Attack/Defend.\n\nAt the core of TF2's longevity are its nine distinct mercenary classes, divided into Offense (Scout, Soldier, Pyro), Defense (Demoman, Heavy, Engineer), and Support (Medic, Sniper, Spy). Each class features completely asymmetric movement mechanics, health pools, weapon loadouts, and tactical roles — from the high-flying rocket jumps of the Soldier to the deception and backstabs of the Spy.\n\nBeyond casual and competitive matchmaking, TF2 boasts one of the most vibrant community server ecosystems in PC gaming, hosting classic gamemodes like Saxton Hale (VSH), Zombie Fortress, Prop Hunt, Surf, and Jump training. The game also includes Mann vs. Machine (MvM), an intense 6-player cooperative horde defense mode against waves of robotic invaders with in-depth weapon upgrades.",
    bestFor: [
      "Fans of fast-paced class-based shooters with deep movement physics",
      "Players seeking active community-run servers with custom maps and game modes",
      "Co-op enthusiasts wanting challenging PvE horde modes in Mann vs. Machine",
      "Gamers with low-to-mid spec hardware wanting high frame rates",
    ],
    notFor: [
      "Players looking for modern realistic mil-sim gunplay or sprint/ADS mechanics",
      "Those looking for a single-player narrative story campaign",
    ],
    comparableTo: [
      "Overwatch 2",
      "Paladins",
      "Team Fortress Classic",
      "Open Fortress",
      "Team Fortress 2 Classic",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Install and launch Team Fortress 2 for free on Steam. PlayBound integrates directly with Steam to launch the game and browse community servers.",
      },
      {
        platform: "linux",
        text: "On Linux and Steam Deck, TF2 runs natively or through Proton with native 64-bit binaries and full controller support.",
      },
      {
        platform: "all",
        text: "Join casual matchmaking, jump into community servers, or install custom HUDs and mastercomfig performance presets via PlayBound.",
      },
    ],
    faq: [
      {
        q: "Is Team Fortress 2 genuinely free to play?",
        a: "Yes! TF2 is 100% free to download and play with no paywalls on maps, classes, weapons, or game modes. All unlockable weapons can be earned through random drop timers, milestone achievements, or weapon crafting.",
      },
      {
        q: "What is Mann vs. Machine (MvM)?",
        a: "Mann vs. Machine is TF2's 6-player cooperative PvE horde mode where mercenaries defend a base against waves of robotic armies, upgrading weapon stats, resistances, and canteen power-ups between rounds.",
      },
      {
        q: "How do custom HUDs and Mastercomfig work in TF2?",
        a: "TF2 has native mod folder support (`tf/custom`). Dropping custom HUDs (like ToonHUD or FlawHUD) or Mastercomfig presets directly into your custom folder immediately enhances interface clarity and maximizes frame rate stability.",
      },
      {
        q: "What are Team Fortress 2 Classic and Open Fortress?",
        a: "TF2 Classic and Open Fortress are standalone community Source SDK mods. TF2 Classic restores 2008-era balance with 4-team battles and the Civilian VIP class, while Open Fortress delivers fast-paced 90s arena deathmatch with bunnyhopping and weapon pickups.",
      },
      {
        q: "Does TF2 run well on modern PCs and Steam Deck?",
        a: "Yes! Valve updated TF2 with native 64-bit client binaries, dramatically improving performance, memory headroom, and high refresh rate stability on modern Windows, Linux, and Steam Deck devices.",
      },
    ],
  },
  "wolfenstein-enemy-territory": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The immortal gold standard of objective-based team warfare, where tight engineering, field ops artillery coordination, and stopwatch tournament pacing deliver pure tactical multiplayer perfection.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "Enemy Territory is one of the most influential multiplayer FPS games in PC gaming history. Splash Damage and id Software created a timeless masterpiece of objective warfare, class synergy, and construction mechanics that inspired Dirty Bomb, Brink, and Overwatch — completely free forever.",
    longDescription:
      "Wolfenstein: Enemy Territory is the legendary free multiplayer first-person shooter developed by Splash Damage and id Software. Set during World War II across North Africa and Europe, matches pit Allied and Axis teams against each other in asymmetric, multi-stage objective warfare — repairing tanks, blowing bridge defenses, storming coastal gun batteries, and stealing top-secret war documents.\n\nGameplay centers on five specialized character classes: Soldier (heavy machine guns, panzerfaust, mortars), Medic (healing packs, syringe revives), Engineer (dynamite, landmines, bridge/command post construction, defusing), Field Ops (ammunition supply, artillery strikes, airstrikes), and Covert Ops (sniping, smoke grenades, silenced weapons, stealing enemy uniforms, satchel charges).\n\nThe game is actively maintained and modernized by the open-source ET: Legacy project, bringing 64-bit performance, high-definition widescreen rendering, raw input, cross-platform compatibility (Windows, Linux, macOS), and a vibrant community of active public and competitive stopwatch servers.",
    bestFor: [
      "Fans of objective-driven class-based tactical team shooters",
      "Competitive FPS players who love stopwatch tournament formats and high-skill tracking",
      "Gamers seeking true team synergy with engineers, medics, and field ops",
      "Low-to-mid spec PC and laptop owners wanting 120+ FPS performance",
    ],
    notFor: [
      "Players looking for a single-player narrative campaign",
      "Those who dislike fast-paced strafe jumping and tracking-heavy gunplay",
    ],
    comparableTo: [
      "Team Fortress 2",
      "Dirty Bomb",
      "Brink",
      "Day of Defeat: Source",
      "Return to Castle Wolfenstein",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Install the ET: Legacy client via PlayBound. The installer bundles the latest 64-bit engine and automatically downloads community maps on server connection.",
      },
      {
        platform: "linux",
        text: "Run the native Linux 64-bit binary or AppImage, or play via Proton on Steam Deck with community controller configs.",
      },
      {
        platform: "all",
        text: "Join populated community servers directly from the in-game server browser or through PlayBound's live server list.",
      },
    ],
    faq: [
      {
        q: "Is Wolfenstein: Enemy Territory completely free?",
        a: "Yes! id Software and Splash Damage released Enemy Territory in 2003 as a completely free standalone multiplayer game. There has never been a price tag, subscription, or microtransaction.",
      },
      {
        q: "What is ET: Legacy?",
        a: "ET: Legacy is an open-source continuation of the Enemy Territory GPL code. It fixes hundreds of legacy bugs, adds 64-bit architecture, modern OpenGL rendering, widescreen support, and built-in map/mod auto-downloading.",
      },
      {
        q: "Can I play Wolfenstein: Enemy Territory offline with bots?",
        a: "Yes! With the Omni-Bot mod, you can play offline single-player skirmishes or local co-op with highly capable tactical AI bots that complete complex mission objectives.",
      },
      {
        q: "How does the Stopwatch competitive format work?",
        a: "In Stopwatch mode, teams take turns attacking and defending the same map. The team that completes all objectives in the shortest amount of time wins the match.",
      },
      {
        q: "What are the five classes in Enemy Territory?",
        a: "The classes are Soldier (heavy weapons), Medic (health & revives), Engineer (construction, repairs, dynamite), Field Ops (ammo & artillery), and Covert Ops (stealth, sniping, uniform disguises).",
      },
      {
        q: "Does Enemy Territory work on Steam Deck?",
        a: "Yes! ET: Legacy runs natively on Linux/SteamOS and supports gamepad binding for full handheld play.",
      },
    ],
  },
  "asherons-call": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "A pioneering 1999 MMORPG marvel featuring a seamless 500-square-mile continent with zero zoning screens, classless skill freedom, projectile-dodging combat, and an unforgettable feudal monarchy system.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "Asheron's Call is one of the foundational big-three MMORPGs that defined PC online gaming. Its seamless 500-square-mile continent of Dereth without loading screens between zones, classless skill point system, dynamic projectile-dodging combat, and revolutionary player monarchy allegiance hierarchy remain unmatched to this day.",
    longDescription:
      "Asheron's Call is the legendary 1999 3D fantasy MMORPG originally developed by Turbine and published by Microsoft. Set on the dangerous, seamless continent of Dereth, players explore an uninterrupted open world filled with Olthoi hives, ancient Empyrean ruins, sprawling multi-level dungeon labyrinths, and bustling frontier settlements.\n\nUnlike traditional class-locked MMORPGs, Asheron's Call features a completely freeform skill-point system. Players distribute experience points into Melee, Missile, or Magic skills (War, Life, Creature, and Item Magic) to build custom archetypes. Combat is fast-paced and twitch-sensitive: arrows and spell projectiles travel physically through 3D space and can be sidestepped, while weapon attacks feature variable power bars and swing heights.\n\nDereth's social fabric is powered by the Allegiance system — a pyramidal feudal structure where sworn vassals pass experience up to their patron in exchange for guidance, protection, and rare loot. Following the 2017 retail shutdown, the open-source ACEmulator (ACE) project meticulously recreated server physics, world databases, and live events, allowing thousands of players to experience both classic pre-expansion and End-of-Retail servers completely free.",
    bestFor: [
      "Fans of classic golden-age MMORPGs like EverQuest, Ultima Online, and Dark Age of Camelot",
      "Players who value classless, sandbox character building with deep spellcrafting",
      "Gamers who appreciate immense seamless open-world exploration with zero invisible walls",
      "Those who love player-driven politics, vassal hierarchies, and fellowship hunting",
    ],
    notFor: [
      "Players seeking modern theme-park MMORPGs with quest markers and automated dungeon finders",
      "Gamers who dislike complex spell component reagent management",
    ],
    comparableTo: [
      "EverQuest",
      "Ultima Online",
      "Dark Age of Camelot",
      "Star Wars Galaxies",
      "Project Gorgon",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download and install the Asheron's Call community client and ThwargLauncher via PlayBound.",
      },
      {
        platform: "all",
        text: "Launch ThwargLauncher, pick your preferred community world (such as Coldeve for retail PvE or Levistras for manual no-bot play), and enter your character credentials.",
      },
      {
        platform: "all",
        text: "Optionally install Decal and Virindi Tank from PlayBound's 1-click mod installer for enhanced HUD overlays and navigation waypoints.",
      },
    ],
    faq: [
      {
        q: "Is Asheron's Call completely free to play?",
        a: "Yes! While official retail servers closed in 2017, the game is now 100% free and open-source through community-maintained ACEmulator servers. There are no fees, subscriptions, or cash shops.",
      },
      {
        q: "What is ACEmulator (ACE)?",
        a: "ACEmulator is an open-source C# server emulator built from scratch by the community. It accurately reproduces retail movement physics, spell formulas, dungeon encounters, and quest mechanics.",
      },
      {
        q: "What is the difference between Coldeve, Levistras, and Seedsow?",
        a: "Coldeve is an End-of-Retail PvE server allowing multi-boxing. Levistras is a strictly manual-play PvE server with a zero-tolerance policy on automated macroing. Seedsow is a classic server recreating the 1999–2005 pre-Throne of Destiny era.",
      },
      {
        q: "What is the Allegiance system in Asheron's Call?",
        a: "The Allegiance system is a player-run feudal hierarchy. A vassal swears allegiance to a patron; when the vassal earns experience, a bonus percentage is automatically generated and passed up to the patron, encouraging mentorship and guild loyalty.",
      },
      {
        q: "How does magic work in Asheron's Call?",
        a: "Magic is divided into War, Life, Creature, and Item Magic. Spells require specific herb and mineral reagents (like Brimstone and Mandrake) and scarabs. Spells can be cast as projectiles, self-buffs, or fellowship enchantments.",
      },
      {
        q: "Can I play Asheron's Call on modern Windows and widescreen monitors?",
        a: "Yes! Using ThwargLauncher and modern D3D wrappers, the game runs smoothly in 1080p, 1440p, and 4K resolutions on Windows 10/11.",
      },
    ],
  },
  "tomb-raider-123": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: false,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Tomb Raider 1+2+3 is the sharpest way to own Lara Croft's original trilogy: three foundational adventures, DRM-free, for less than the price of lunch.",
      lastVerified: "2026-08-24",
    },
    whyWePickedIt:
      "The first three Tomb Raiders still deliver a kind of lonely, deliberate exploration modern action games rarely attempt. This $9.99 GOG bundle is DRM-free, keeps all three originals together, and supplies the legal game data that community editions such as OpenLara build on.",
    longDescription:
      "The original Tomb Raider trilogy still feels like an expedition rather than a guided tour. These games ask you to read a room, judge a jump, listen for danger, and commit. Lara moves with deliberate weight, every ledge has consequence, and the best chambers unfold like clockwork puzzles built at impossible scale. This GOG bundle keeps the three Core Design adventures together and provides offline installers you can archive; GOG Galaxy is optional.\n\nTomb Raider begins with a globe-spanning hunt for the Scion. Tomb Raider II widens the route from Venice to the wreck of the Maria Doria, while Tomb Raider III turns the trilogy into a rough-edged world tour with denser traps and some of the series' most ambitious spaces. These are the 1990s originals, not the remastered collection. Tank controls demand patience, saves and configuration feel old-school, and the geometry is blocky enough to make every jump readable.\n\nThe bundle is also the right master copy for OpenLara. PlayBound keeps the modern browser and desktop engines as editions, so you can choose preservation or convenience without pretending the original data files are free. GOG notes that Tomb Raider II is not supported on Windows 10, so some PCs may need compatibility settings or OpenLara. If you want the original trilogy as it was—quiet, demanding, and wonderfully strange—this is an easy vault key to recommend.",
    bestFor: [
      "Players who miss deliberate platforming, secret-heavy levels, and puzzles that trust them to pay attention",
      "Collectors who want DRM-free offline installers and a legal foundation for OpenLara editions",
    ],
    notFor: [
      "Anyone expecting modern camera controls, generous checkpoints, or frictionless first-launch compatibility",
      "Windows 10 players unwilling to troubleshoot Tomb Raider II, which GOG explicitly lists as unsupported",
    ],
    comparableTo: [
      "Tomb Raider I-III Remastered",
      "Prince of Persia 3D",
      "Indiana Jones and the Infernal Machine",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Buy Tomb Raider 1+2+3 from GOG and download the Windows offline backup installers; GOG Galaxy is optional.",
      },
      {
        platform: "windows",
        text: "Run the installers and keep the three game folders together in your PlayBound library location.",
      },
      {
        platform: "all",
        text: "Choose an OpenLara edition for a modern browser or native engine while retaining the legally owned game data.",
      },
    ],
    faq: [
      {
        q: "Is Tomb Raider 1+2+3 free?",
        a: "No. The DRM-free GOG bundle is normally $9.99 and includes Tomb Raider, Tomb Raider II, and Tomb Raider III.",
      },
      {
        q: "How large is the Tomb Raider 1+2+3 install?",
        a: "Allow about 2 GB of storage for the trilogy, plus a little room for installers and community editions.",
      },
      {
        q: "What platforms does this GOG bundle support?",
        a: "GOG lists the bundle for Windows. OpenLara editions add browser and other modern-platform options while still requiring legally owned game data.",
      },
      {
        q: "Do I need GOG Galaxy to play?",
        a: "No. GOG provides offline backup installers, so Galaxy is optional and the installed games remain DRM-free.",
      },
    ],
  },
  "counter-strike-2": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The undisputed pinnacle of tactical first-person shooters, delivering razor-sharp sub-tick gunplay, volumetric reactive smoke physics, and pure skill-based esports competition.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "Counter-Strike 2 is the most popular competitive esport on the planet for a reason: impeccable mechanical depth, perfectly balanced team economy, reactive volumetric smokes that interact with bullets and grenades, and completely free access to all maps, modes, and community workshop content with zero pay-to-win mechanics.",
    longDescription:
      "Counter-Strike 2 (CS2) is Valve's flagship tactical 5v5 multiplayer shooter, marking the largest technical leap in the franchise's twenty-five-year history. Built on Valve's Source 2 engine, CS2 introduces revolutionary sub-tick server architecture where movement, shooting, and utility throws are calculated at the exact millisecond of input rather than waiting for server tick intervals.\n\nMatches pit Terrorists against Counter-Terrorists across iconic bomb defusal and hostage rescue maps in the MR12 (first to 13 rounds) competitive format. Players manage an intricate in-game round economy, purchasing rifles (AK-47, M4A1-S, AWP), SMGs, pistols, and utility grenades (Smoke, Flashbang, HE Grenade, Molotov/Incendiary). In CS2, smoke grenades are dynamic volumetric objects that grow to fill physical spaces, reflect lighting, and can be temporarily cleared with grenade explosions or bullet fire.\n\nBeyond Valve's official Premier rating ladder and competitive matchmaking, Counter-Strike 2 supports an immense ecosystem of community-hosted servers, dedicated training workshops (Aim Botz, Recoil Master), surf/bhop movement courses, and professional third-party tournament hubs like FACEIT.",
    bestFor: [
      "Competitive FPS players seeking pure skill-based tactical gunplay and teamwork",
      "Esports enthusiasts wanting ranked Premier matchmaking with calibrated rating leaderboards",
      "Players who enjoy deep economy management and utility lineup coordination",
      "Gamers wanting thousands of community workshop practice maps, surf courses, and deathmatch servers",
    ],
    notFor: [
      "Casual gamers looking for hero abilities, ultimate powers, or health regeneration",
      "Players looking for a single-player narrative campaign",
    ],
    comparableTo: [
      "Valorant",
      "Counter-Strike: Global Offensive",
      "Tom Clancy's Rainbow Six Siege",
      "Counter-Strike: Source",
      "Crossfire",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Add Counter-Strike 2 to your Steam library for free and launch directly via PlayBound.",
      },
      {
        platform: "linux",
        text: "CS2 runs natively on 64-bit Linux with Vulkan rendering or on Steam Deck with gyro and trackpad aiming profiles.",
      },
      {
        platform: "all",
        text: "Subscribe to essential warmup maps like Aim Botz and Recoil Master from the Steam Workshop to calibrate your crosshair and spray control.",
      },
    ],
    faq: [
      {
        q: "Is Counter-Strike 2 genuinely free to play?",
        a: "Yes! Counter-Strike 2 is 100% free to download and play. All gameplay modes, maps, weapons, and community servers are completely free. Optional cosmetic weapon skins and cases do not alter weapon stats or gameplay balance.",
      },
      {
        q: "What is Prime Status in CS2?",
        a: "Prime Status is an optional one-time upgrade for Counter-Strike 2 that matches players exclusively with other Prime members in competitive matchmaking and unlocks weekly weapon skin and case drops.",
      },
      {
        q: "How does Sub-Tick architecture work?",
        a: "In CS2, sub-tick server architecture captures the exact millisecond you click to shoot, jump, or throw a grenade between server ticks, ensuring your shots register precisely where and when you aimed.",
      },
      {
        q: "What makes CS2 smoke grenades different?",
        a: "Smoke grenades in CS2 are dynamic 3D volumetric objects. They expand to naturally fill corridors, react to environmental lighting, and can be briefly blown open by HE grenade explosions or pierced with rifle fire.",
      },
      {
        q: "Can I still play community servers and Workshop maps?",
        a: "Yes! CS2 fully supports community dedicated servers (FFA Deathmatch, Retakes, Surf, KZ) and the Steam Workshop with hundreds of thousands of custom maps and training modules.",
      },
      {
        q: "Does CS2 run on Linux and Steam Deck?",
        a: "Yes! Valve provides a native Linux binary utilizing Vulkan graphics, and the game is playable on Steam Deck.",
      },
    ],
  },
  valorant: {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "A razor-sharp tactical shooter combining precise Counter-Strike-style gunplay with diverse agent ability synergies and 128-tick competitive servers.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "Valorant masterfully blends tactical search-and-destroy fundamentals with dynamic agent abilities, offering high-fidelity 128-tick servers, robust competitive matchmaking, and unmatched anti-cheat integrity with zero gameplay-affecting paywalls.",
    longDescription:
      "VALORANT is Riot Games' free-to-play 5v5 tactical first-person hero shooter, engineered from the ground up for competitive esports excellence. Set on a near-future Earth, players select from a growing roster of radiant agents divided into four tactical roles: Duelists (aggressive entry fraggers), Initiators (reconnaissance and angle clearers), Controllers (smokes and vision blockers), and Sentinels (defensive anchors and trap planners).\n\nCombat revolves around intense 24-round matches (first to 13) where attackers attempt to plant the Spike and defenders fight to defuse it or eliminate the opposing squad. While agent abilities provide crucial utility—such as Sova's recon darts, Omen's teleporting smokes, and Killjoy's turret crossfires—gunplay is always lethal. Precise crosshair placement, first-bullet accuracy with rifles like the Vandal and Phantom, and recoil discipline dictate the outcome of every firefight.\n\nVALORANT runs exclusively on Riot's dedicated 128-tick server infrastructure with custom server-side hit registration, paired with the kernel-level Riot Vanguard anti-cheat system to maintain the highest competitive integrity across its ranked ladder.",
    bestFor: [
      "Competitive FPS players who love combining tactical gunplay with creative hero ability combos",
      "Fans of 5v5 search-and-destroy seeking ultra-responsive 128-tick ranked matchmaking",
      "Players who appreciate active balance patches, regular agent releases, and new map pools",
      "Teams seeking deep strategic playbooks with coordinated smoke executions and retakes",
    ],
    notFor: [
      "Casual players looking for offline bot campaigns or modded community servers",
      "Players unable or unwilling to run kernel-level anti-cheat (Riot Vanguard on Windows)",
      "Steam Deck / Linux native desktop users (Vanguard requires Windows TPM 2.0 / UEFI)",
    ],
    comparableTo: [
      "Counter-Strike 2",
      "Overwatch 2",
      "Tom Clancy's Rainbow Six Siege",
      "Apex Legends",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download the official Riot Client installer from playvalorant.com or launch directly via PlayBound.",
      },
      {
        platform: "windows",
        text: "Install Riot Vanguard anti-cheat when prompted and perform a system reboot to initialize Vanguard drivers.",
      },
      {
        platform: "all",
        text: "Warm up in The Range to calibrate your mouse sensitivity, test agent abilities, and complete shooting drills.",
      },
    ],
    faq: [
      {
        q: "Is VALORANT completely free to play?",
        a: "Yes! VALORANT is 100% free to play. All weapons, maps, game modes, and competitive ranks are accessible for free. Agents can be unlocked entirely through gameplay XP, and cosmetic weapon skins provide no gameplay advantages.",
      },
      {
        q: "What is Riot Vanguard and why is it required?",
        a: "Riot Vanguard is Riot's proprietary kernel-level anti-cheat system designed to prevent wallhacks, aimbots, and memory injection. It runs at system startup on Windows with Secure Boot and TPM 2.0 enabled.",
      },
      {
        q: "How does the economy work in VALORANT?",
        a: "Players earn Creds each round by winning, losing, getting kills, and planting the Spike. Creds are spent between rounds on armor, secondary/primary firearms (Vandal, Phantom, Operator), and agent ability charges.",
      },
      {
        q: "What are the four agent roles?",
        a: "Duelists (entry fraggers like Jett, Reyna, Raze), Initiators (info gatherers like Sova, Fade, Breach), Controllers (smoke deployers like Omen, Viper, Brimstone, Clove), and Sentinels (area anchors like Killjoy, Cypher, Deadlock).",
      },
      {
        q: "Does VALORANT run on Steam Deck or Linux?",
        a: "No. Because Riot Vanguard requires Windows-specific kernel drivers, UEFI Secure Boot, and TPM 2.0, VALORANT cannot run natively under Linux or SteamOS Proton.",
      },
      {
        q: "Does VALORANT support controllers on PC?",
        a: "On PC, VALORANT requires keyboard and mouse for ranked balance. Dedicated console versions are available natively on PlayStation 5 and Xbox Series X/S.",
      },
    ],
  },
  "war-thunder": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The ultimate combined-arms vehicular combat simulation, commanding thousands of painstakingly detailed tanks, fighter jets, and naval warships across colossal realistic battlefields.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "War Thunder is in a class of its own for vehicular combat depth: over 2,500 meticulously modeled military machines spanning pre-WWII biplanes to modern supersonic jets and composite-armor main battle tanks, combined with realistic ballistics and modular x-ray damage modeling.",
    longDescription:
      "War Thunder is the definitive free-to-play combined-arms vehicular warfare simulation developed by Gaijin Entertainment. Unlike arcade combat games with arbitrary health bars, War Thunder simulates combat through complex physics and component-level damage. Every projectile's penetration is calculated based on striking velocity, armor slope angle, and internal spalling, incapacitating vehicle crews or detonating ammo racks with radiographic X-ray kill cameras.\n\nPlayers fight across three distinct modes catering to different playstyles: Arcade Battles (accessible physics and aim indicators), Realistic Battles (authentic vehicle performance and no enemy markers), and Simulator Battles (full cockpit view with manual engine and trim management). Combined-arms battles seamlessly integrate tanks, self-propelled anti-aircraft guns, attack helicopters, and close-air-support fighter-bombers on the same map.\n\nWith ten major playable military aviation and ground research trees (USA, Germany, USSR, Great Britain, Japan, China, Italy, France, Sweden, and Israel), full Steam Deck support, and native Virtual Reality head-tracking in aircraft cockpits, War Thunder offers an unrivaled military sandbox.",
    bestFor: [
      "Military history and aviation enthusiasts who love deep vehicular technical accuracy",
      "Players seeking realistic ballistics and component-based x-ray damage rather than HP bars",
      "Gamers who want combined-arms warfare integrating tanks, strike fighters, and helicopters",
      "VR flight simulator enthusiasts looking for dogfights with full HOTAS and joystick support",
    ],
    notFor: [
      "Players looking for quick arcade run-and-gun action with instant health regeneration",
      "Gamers unwilling to progress through extensive tech tree research tiers",
    ],
    comparableTo: [
      "World of Tanks",
      "DCS World",
      "IL-2 Sturmovik",
      "Arma 3",
      "World of Warships",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Install War Thunder for free via Steam or the Gaijin standalone launcher directly through PlayBound.",
      },
      {
        platform: "all",
        text: "Select your preferred graphics texture pack (Standard Client for fast downloads, or Ultra HQ Textures for 4K vehicle fidelity).",
      },
      {
        platform: "all",
        text: "Configure your control scheme (Mouse Aim for keyboard/mouse, or dedicated HOTAS joystick profiles for flight simulation).",
      },
    ],
    faq: [
      {
        q: "Is War Thunder really free to play?",
        a: "Yes! War Thunder is 100% free to play. All standard tech trees, research vehicles, realistic and simulator game modes, and seasonal events can be played and unlocked through regular gameplay without paying.",
      },
      {
        q: "How does the damage model work?",
        a: "War Thunder does not use health bars. Damage is determined by internal armor penetration, module destruction (engine, transmission, cannon barrel, turret ring), and crew member incapacitation shown via dynamic X-ray hit cameras.",
      },
      {
        q: "What is the difference between Arcade, Realistic, and Simulator modes?",
        a: "Arcade offers boosted engine physics and target lead reticles. Realistic uses historical flight and armor characteristics without enemy radar markers. Simulator locks players into first-person cockpit views with full manual aircraft trim.",
      },
      {
        q: "Does War Thunder support Virtual Reality (VR)?",
        a: "Yes! War Thunder features native OpenXR and SteamVR support for cockpits and naval bridges, offering full 6DOF head tracking on Meta Quest, Valve Index, and HTC Vive.",
      },
      {
        q: "Can I install custom user skins and sights?",
        a: "Yes! War Thunder natively supports user-created 4K/8K camouflages, custom ballistic gunner sights, and custom sound mods downloaded from the official WT Live portal.",
      },
      {
        q: "Does War Thunder support cross-play?",
        a: "Yes! PC, PlayStation, and Xbox players all share the same matchmaking queues, squads, and multiplayer servers.",
      },
    ],
  },
  "star-wars-galaxies": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The greatest sandbox MMORPG ever conceived, delivering player-built planetary cities, deep non-combat crafting economies, and total galactic roleplaying freedom.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "Star Wars Galaxies represents the pinnacle of virtual world sandbox design: an unconstrained universe where players construct planetary cities, survey resource veins, run player-driven galactic trade, and engage in multi-crew space dogfights without linear quest rails.",
    longDescription:
      "Star Wars Galaxies (SWG) is Sony Online Entertainment and LucasArts' legendary 2003 sandbox MMORPG, celebrated as one of the most ambitious virtual worlds ever engineered. Set during the Galactic Civil War between A New Hope and The Empire Strikes Back, SWG rejected modern theme-park MMO tropes in favor of complete player agency.\n\nRather than locking players into rigid character classes, SWG featured a 250-skill-point matrix across 32 diverse professions. Players could become dedicated Weaponsmiths, Creature Handlers, Droid Engineers, Entertainers, Bounty Hunters, Combat Medics, or elusive Jedi. The crafting system remains unmatched in gaming history: every raw resource (metals, chemicals, ores) possessed fluctuating quality attributes, meaning an Artisan's survey skill and experimentation directly dictated the damage, speed, and durability of their forged blasters and armor.\n\nPlayers shaped the galaxy itself by founding full player-run planetary cities with elected Mayors, civic zoning, shuttleports, hospitals, cantinas, and custom decorated houses. Through the Jump to Lightspeed expansion, players could take to the stars in multi-crew Gunships, X-Wings, and TIE Fighters, walking around ship interiors in real-time space flight.\n\nPreserved today through dedicated community server projects like SWGEmu (Pre-CU classic 14.1), SWG Legends, and SWG Restoration, Star Wars Galaxies remains a vibrant, living virtual galaxy.",
    bestFor: [
      "MMO players craving deep player-driven economies, resource gathering, and artisanal crafting",
      "Star Wars fans wanting an authentic, living galaxy to explore at their own pace",
      "Roleplayers who love building houses, decorating cantinas, and establishing player cities",
      "Space combat enthusiasts looking for multi-crew starships and space dogfights (Jump to Lightspeed)",
    ],
    notFor: [
      "Players who prefer modern linear quest-hub leveling with yellow exclamation points",
      "Gamers looking for modern action-combat with dodge rolls and telegraph indicators",
    ],
    comparableTo: [
      "Eve Online",
      "Ultima Online",
      "Star Wars: The Old Republic",
      "ArcheAge",
      "Mortal Online 2",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Acquire original Star Wars Galaxies 14.1 client files (from original install media or archive).",
      },
      {
        platform: "windows",
        text: "Launch your preferred community edition via PlayBound (SWGEmu Launchpad, SWG Legends, or SWG Restoration).",
      },
      {
        platform: "all",
        text: "Point the launcher to your base game directory to download community server patch files and create your free game account.",
      },
    ],
    faq: [
      {
        q: "Is Star Wars Galaxies free to play today?",
        a: "Yes! Community server emulators (SWGEmu, SWG Legends, SWG Restoration) are 100% free non-profit community projects. You only need the original base game client files to patch and play.",
      },
      {
        q: "What are the differences between SWG Editions (Pre-CU vs NGE)?",
        a: "SWGEmu (Finalizer) preserves the original 2003 Pre-Combat Upgrade 14.1 skill tree system. SWG Legends runs the Post-NGE era with high-level heroic instances and space content. SWG Restoration offers a hybrid custom ruleset.",
      },
      {
        q: "How does player housing and city building work?",
        a: "Players can drop harvesters, build custom houses, and place factories anywhere in the open world. Groups of players can establish official player cities that gain rank, elect a Mayor, and build shuttleports and hospitals.",
      },
      {
        q: "Does Star Wars Galaxies include space combat?",
        a: "Yes! The Jump to Lightspeed expansion allows players to build, customize, and pilot starfighters (X-Wings, TIEs) and multi-crew gunships (YT-1300 Millennium Falcon chassis) in seamless space combat.",
      },
      {
        q: "Can I unlock a Jedi character?",
        a: "Yes! Different editions handle the Jedi path differently: SWGEmu uses the classic holographic mystery progression, while other editions offer dedicated Jedi profession paths.",
      },
      {
        q: "Does SWG run on modern Windows 11 and Steam Deck?",
        a: "Yes! Modern community launchpads include DirectX 9/11 wrappers, widescreen 4K resolutions, 60fps unlocked animations, and Wine/Proton support for Steam Deck.",
      },
    ],
  },
  "gamebuddies-io": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "An effortless, instant-access party gaming hub that turns any browser or mobile phone into a private game night with zero downloads required.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "GameBuddies.io solves the classic friction of group game nights: zero downloads, zero account setup required for guests, instant room code sharing, and a diverse suite of hilarious drawing, trivia, and word games that run flawlessly across PCs, Macs, tablets, and phones.",
    longDescription:
      "GameBuddies.io is an instant-access web-based multiplayer party hub designed for frictionless social play with friends, family, and coworkers. By eliminating client installs, launcher requirements, and mandatory account registration, anyone with a modern web browser can jump into a match in seconds.\n\nPlayers can host private game rooms with custom room codes or jump into public lobbies. The platform features an expanding library of casual party staples:\n- Draw & Guess: Real-time collaborative sketching and guessing game with fast rounds.\n- Word Guess: Secret word association and deducing rounds for verbal strategists.\n- Party Trivia: Competitive general knowledge and themed trivia quizzes.\n- Party Bombs: Rapid-fire hot-potato word association under ticking time pressure.\n- Connect 4 & Tabletop Classics: Quick 1v1 tactical face-offs between party rounds.\n\nWith responsive mobile touch controls, cross-platform synchronization, and integrated room chat, GameBuddies.io makes remote hangouts and discord game nights completely painless.",
    bestFor: [
      "Friends and remote teams wanting instant, zero-friction party games without installs",
      "Discord communities looking for quick browser-based party activities",
      "Casual game nights where players join from mixed devices (phones, laptops, tablets)",
      "Families looking for clean, accessible drawing and trivia games",
    ],
    notFor: [
      "Hardcore gamers seeking deep character progression or complex mechanics",
      "Players wanting an offline single-player story campaign",
    ],
    comparableTo: [
      "Jackbox Party Packs",
      "Skribbl.io",
      "Gartic Phone",
      "Kahoot!",
      "Board Game Arena",
    ],
    installSteps: [
      {
        platform: "all",
        text: "Launch GameBuddies.io directly in your browser through PlayBound.",
      },
      {
        platform: "all",
        text: "Click 'Create Room', select your party game mode, and share the room code or invite link with your friends.",
      },
      {
        platform: "all",
        text: "Friends can join instantly on phone, tablet, or PC by clicking your link.",
      },
    ],
    faq: [
      {
        q: "Is GameBuddies.io completely free?",
        a: "Yes! GameBuddies.io is 100% free to play in your browser with no subscription or mandatory paywalls.",
      },
      {
        q: "Do my friends need to create an account to join?",
        a: "No! Guests can join any private game room simply by clicking your invite link and entering a display nickname.",
      },
      {
        q: "Does GameBuddies work on mobile phones and tablets?",
        a: "Yes! GameBuddies.io is built with responsive HTML5 touch controls, allowing players to sketch and type smoothly on iPhone, Android, iPad, and desktop.",
      },
      {
        q: "How many players can join a room?",
        a: "Most party modes support 2 to 16+ players in a single private lobby, making it ideal for both small friend groups and large office hangouts.",
      },
      {
        q: "Are there custom word lists and trivia settings?",
        a: "Yes! Room hosts can customize round durations, word difficulty, drawing time limits, and custom trivia topics.",
      },
      {
        q: "Can I use GameBuddies inside Discord?",
        a: "Yes! You can share your room link directly in any Discord voice channel or text chat for instant group joins.",
      },
    ],
  },
  pixreveal: {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "An addictive, minimalist daily pixel-guessing challenge that turns image deduction into a satisfying daily ritual for puzzle lovers.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "Pixreveal captures the brilliant 'Wordle-like' daily puzzle energy for visual learners: uncovering concealed pixel mosaics tile-by-tile, testing your pop culture and video game recognition under minimal reveal constraints.",
    longDescription:
      "Pixreveal is a daily web-based visual puzzle game that challenges players to identify iconic artwork, retro gaming sprites, pop culture characters, and famous photographs from heavily pixelated mosaics.\n\nEvery day presents a fresh set of visual puzzles. Players begin with a completely obscured or ultra-low-resolution image and reveal square tiles one by one. With each tile uncovered, more color cues, silhouettes, and distinctive contours appear. The goal is to deduce the subject in as few tile reveals as possible to earn maximum points and preserve your daily winning streak.\n\nFeaturing categories spanning 90s classic gaming, anime icons, movie posters, world landmarks, and nature photography, Pixreveal is the perfect lightweight daily brain workout.",
    bestFor: [
      "Daily puzzle players who love Wordle, Connections, and GeoGuessr",
      "Retro gamers with an eye for iconic pixel art, 8-bit sprites, and game covers",
      "Pop culture and movie trivia buffs who love visual deduction",
      "Casual mobile and desktop players wanting a quick 5-minute morning puzzle ritual",
    ],
    notFor: [
      "Gamers looking for fast-paced action or deep real-time mechanics",
      "Players who dislike trivia and visual deduction games",
    ],
    comparableTo: [
      "Wordle",
      "GeoGuessr",
      "Framed",
      "Gamedle",
      "Heardle",
    ],
    installSteps: [
      {
        platform: "all",
        text: "Open Pixreveal directly in your browser through PlayBound.",
      },
      {
        platform: "all",
        text: "Select today's Daily Challenge puzzle.",
      },
      {
        platform: "all",
        text: "Click tiles to reveal clue pixels and type your guesses into the search box to build your streak.",
      },
    ],
    faq: [
      {
        q: "Is Pixreveal completely free?",
        a: "Yes! Pixreveal is 100% free with no account creation or downloads required.",
      },
      {
        q: "How often do new puzzles appear?",
        a: "A new official Daily Puzzle set releases every 24 hours at midnight UTC, with endless practice modes also available.",
      },
      {
        q: "How does scoring and streaks work?",
        a: "Your score is based on how few pixels you uncover before submitting the correct answer. Daily streaks are saved in your browser.",
      },
      {
        q: "Can I share my results with friends?",
        a: "Yes! Pixreveal includes spoiler-free emoji share grids (similar to Wordle) so you can boast your daily score without ruining the image.",
      },
      {
        q: "What categories of images are in the game?",
        a: "Puzzles include retro video games, classic cartoons, movie posters, celebrity silhouettes, famous landmarks, and album art.",
      },
      {
        q: "Does Pixreveal work on mobile phones?",
        a: "Yes! Pixreveal is fully optimized for mobile touchscreens with responsive pinch-to-zoom and touch tile reveals.",
      },
    ],
  },
  "world-of-sea-battle": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "An exhilarating open-world age-of-sail MMORPG combining realistic wind physics, broadside artillery combat, and massive multi-fleet territory wars.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "World of Sea Battle delivers the pure pirate and naval fantasy that modern gamers crave: captaining dozens of authentic historical wooden warships across a vast seamless ocean, trading across ports, and commanding colossal broadside battles without predatory paywalls.",
    longDescription:
      "World of Sea Battle is an expansive free-to-play open-world naval warfare MMORPG developed by Neptune Games. Set during the golden Age of Sail, players begin with a humble coastal cutter and progress to command first-rate 100-gun ships of the line, nimble pirate corvettes, heavily armed bomb ketches, and swift merchant galleons.\n\nThe game stands out for its realistic sailing physics and tactical broadside combat: wind direction, tacking maneuvers, sail integrity, and rudder angles dictate your ship's maneuverability. Battles require deliberate positioning to unleash port and starboard cannon salvos, chain-shotting enemy masts to immobilize them, or firing grape-shot to clear decks before boarding.\n\nBeyond combat, World of Sea Battle features a living player-driven economic sandbox: players establish trade routes between colonial ports, transport valuable lumber and spices, construct coastal fortress outposts, and wage guild territory wars to control vital maritime trade lanes.",
    bestFor: [
      "Age of Sail and naval warfare enthusiasts who love realistic wooden tall ships",
      "Players seeking broadside tactical combat and realistic wind/tacking physics",
      "Fans of open-world sandbox MMOs with trade routes and port capturing",
      "Gamers who loved Sid Meier's Pirates!, Naval Action, or Sea of Thieves fleet battles",
    ],
    notFor: [
      "Players looking for high-speed modern arcade combat with instant rudder turns",
      "Gamers who dislike ocean navigation and travel time across large map distances",
    ],
    comparableTo: [
      "Naval Action",
      "Sea of Thieves",
      "Sid Meier's Pirates!",
      "World of Warships",
      "Skull and Bones",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download and install World of Sea Battle for free via PlayBound using the official launcher or Steam.",
      },
      {
        platform: "all",
        text: "Launch the game, create your captain profile, and complete the naval maneuvering and broadside tutorial.",
      },
      {
        platform: "all",
        text: "Choose your path: become an independent merchant trader, a naval fleet commander, or a notorious open-sea pirate.",
      },
    ],
    faq: [
      {
        q: "Is World of Sea Battle free to play?",
        a: "Yes! World of Sea Battle is free to download and play, with all ships, cannons, ports, and trade goods accessible through standard gameplay progression.",
      },
      {
        q: "How does the sailing and wind physics work?",
        a: "Your ship's speed and handling depend entirely on wind direction and sail trim (Full, Battle, or Furled Sails). Sailing into the wind requires tacking (zigzagging) to maintain momentum.",
      },
      {
        q: "How many ships are available in the game?",
        a: "Over 60 historical sailing vessels are modeled in the game, spanning sloops, brigs, frigates, galleons, and massive first-rate three-decker ships of the line.",
      },
      {
        q: "Can I play solo or with friends?",
        a: "Both! You can sail the open ocean solo hunting AI trade convoys and completing missions, or join a guild/clan to participate in massive 50+ player fleet sieges and territory battles.",
      },
      {
        q: "Is there boarding combat?",
        a: "Yes! Once you destroy an enemy ship's sails and grapple alongside, you can initiate crew boarding actions to capture the enemy vessel and seize its cargo.",
      },
      {
        q: "Does World of Sea Battle run on Steam Deck?",
        a: "Yes! World of Sea Battle runs well under Proton on Steam Deck with custom controller bindings for rudder, sails, and broadside aim.",
      },
    ],
  },
  "old-school-runescape": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The immortal crown jewel of retro MMORPGs, featuring unrivaled quest writing, infinitely satisfying skill progression, and absolute community democracy.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "Old School RuneScape is the gold standard of sustainable game stewardship: every single piece of content, boss encounter, skill update, and quality-of-life patch must pass a strict 70% community supermajority player poll before it is added to the game.",
    longDescription:
      "Old School RuneScape (OSRS) is Jagex's legendary 2007-era sandbox fantasy MMORPG that has grown into one of the most vibrant online gaming communities in the world. Built on a simple point-and-click grid movement system and a rhythmic 0.6-second server tick, OSRS is easy to learn yet boasts extraordinary mechanical depth at the highest levels of combat.\n\nUnlike theme-park MMOs focused entirely on gear score rat races, OSRS is a true open-ended sandbox: level 23 distinct non-combat and combat skills (Woodcutting, Slayer, Runecraft, Herblore, Fishing), complete master-tier narrative quests with dry British wit (Desert Treasure, Dragon Slayer II, Song of the Elves), tackle high-stakes Wilderness PvP, or team up for four-player endgame raids in the Chambers of Xeric, Theatre of Blood, and Tombs of Amascut.\n\nWith full cross-platform progression between desktop, mobile, and Steam Deck, plus seamless integration with approved community open-source clients like RuneLite, Old School RuneScape offers hundreds of hours of free adventure.",
    bestFor: [
      "Gamers who love long-term goal progression, achievement diaries, and skill grinding",
      "Players looking for witty, puzzle-heavy quests that feel like classic adventure games",
      "Fans of sandbox player economies and real-time Grand Exchange trading",
      "Cross-platform players who want to grind seamlessly between PC, phone, and Steam Deck",
    ],
    notFor: [
      "Players demanding high-fidelity photorealistic graphics or modern action combat",
      "Gamers who dislike point-and-click movement and tile-based positioning",
    ],
    comparableTo: [
      "RuneScape 3",
      "Albion Online",
      "World of Warcraft Classic",
      "Melvor Idle",
      "Ultima Online",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download and install the official Jagex Launcher or RuneLite client via PlayBound.",
      },
      {
        platform: "all",
        text: "Create a free Jagex Account and log in with your character.",
      },
      {
        platform: "all",
        text: "Complete Tutorial Island to master basic skills, combat, and trading before stepping into Lumbridge.",
      },
    ],
    faq: [
      {
        q: "Is Old School RuneScape free to play?",
        a: "Yes! The free-to-play portion of OSRS includes dozens of quests (including the iconic Dragon Slayer), all core combat skills, non-combat resource gathering, and full access to the Grand Exchange.",
      },
      {
        q: "Can I buy membership with in-game gold?",
        a: "Yes! Players can purchase 'Old School Bonds' on the Grand Exchange with in-game gold to redeem for 14 days of full membership without spending real money.",
      },
      {
        q: "What is RuneLite?",
        a: "RuneLite is the officially approved, open-source community client for OSRS. It features graphics enhancements (117 HD plugin, GPU rendering, uncapped FPS), quest helpers, tile indicators, and inventory tracking.",
      },
      {
        q: "How does community polling work?",
        a: "Every major update, new quest, boss, or skill proposal is submitted to an in-game poll booth. Updates only enter the game if they receive at least 70% 'Yes' votes from active players.",
      },
      {
        q: "Does OSRS support cross-play and mobile progression?",
        a: "Yes! You can log into the exact same character and world on Windows, macOS, Linux, Steam Deck, iOS, and Android seamlessly.",
      },
      {
        q: "What are Ironman modes?",
        a: "Ironman is a popular official game mode where players cannot trade with other players or use the Grand Exchange, requiring you to harvest and craft every single item yourself.",
      },
    ],
  },
  "star-wars-the-old-republic": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The ultimate story-driven sci-fi MMORPG, delivering eight full-length cinematic Star Wars class campaigns with full voice acting and meaningful moral choices.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "Star Wars: The Old Republic achieves what no other MMO has ever attempted: eight complete, full-budget BioWare single-player RPG storylines packed with orchestral scores, full voice acting, light/dark side moral decisions, and rich companion romances — 100% free to play.",
    longDescription:
      "Star Wars: The Old Republic (SWTOR) is the premier cinematic MMORPG set thousands of years before the rise of Darth Vader, during an era of open warfare between the Galactic Republic and the Sith Empire. Developed by BioWare and maintained by Broadsword, SWTOR plays like a direct sequel to the beloved Knights of the Old Republic (KOTOR) series.\n\nPlayers choose from eight distinct class storylines across Republic and Imperial factions: Jedi Knight, Jedi Consular, Trooper, Smuggler, Sith Warrior, Sith Inquisitor, Bounty Hunter, and Imperial Agent. Each storyline features hundreds of hours of cinematic dialogue choices that genuinely shape your character's moral alignment, companion relationships, and faction standing.\n\nBeyond the base campaigns, SWTOR features rich group content including four-player tactical Flashpoints, eight-player Operations, Galactic Stronghold player housing, fully customizable personal starships, and Galactic Starfighter 12v12 space dogfights.",
    bestFor: [
      "Star Wars and KOTOR fans wanting an epic, fully voiced cinematic story RPG",
      "Solo players who enjoy narrative RPGs with companion romances and moral choices",
      "MMO fans seeking classic tab-target dungeon Flashpoints and endgame Operations",
      "Roleplayers who love custom outfits, lightsaber color crystals, and galactic player housing",
    ],
    notFor: [
      "Players looking for twitch-based action combat with dodge rolls",
      "Gamers who want an unguided, non-narrative sandbox without story cutscenes",
    ],
    comparableTo: [
      "Star Wars: Knights of the Old Republic",
      "Final Fantasy XIV",
      "World of Warcraft",
      "Guild Wars 2",
      "The Elder Scrolls Online",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download and install Star Wars: The Old Republic for free via Steam or the official launcher through PlayBound.",
      },
      {
        platform: "all",
        text: "Create your free SWTOR account and pick your faction (Galactic Republic or Sith Empire).",
      },
      {
        platform: "all",
        text: "Select your Origin Story (e.g. Jedi Knight, Imperial Agent, Bounty Hunter) and begin your prologue on your starter homeworld.",
      },
    ],
    faq: [
      {
        q: "Is SWTOR really free to play?",
        a: "Yes! All eight complete class storylines from Level 1 to 50, plus the Rise of the Hutt Cartel and Shadow of Revan expansions, are 100% free with no subscription required.",
      },
      {
        q: "Can I play SWTOR entirely solo as a single-player RPG?",
        a: "Yes! All eight origin storylines and most story Flashpoints include dedicated 'Story Mode' with combat droid companions, allowing you to experience the entire narrative solo at your own pace.",
      },
      {
        q: "What makes the Imperial Agent storyline so famous?",
        a: "The Imperial Agent story is widely praised by RPG critics as one of BioWare's finest narratives, featuring complex political espionage, mind games, multiple endings, and spy thriller branching paths.",
      },
      {
        q: "Does SWTOR support space combat?",
        a: "Yes! In addition to on-rails starship missions, SWTOR includes 'Galactic Starfighter', a free 12v12 PvP space dogfight arena with scout, strike fighter, gunship, and bomber classes.",
      },
      {
        q: "Does SWTOR run on Steam Deck and modern Windows 11?",
        a: "Yes! SWTOR has been modernized with a 64-bit client and DirectX 11 support, running smoothly on modern Windows 11 PCs and under SteamOS Proton on Steam Deck.",
      },
      {
        q: "Can Jedi use double-bladed lightsabers or dual wield?",
        a: "Yes! Through the Combat Style system, you can decouple your class story from your combat mechanics, allowing Jedi Knights to dual-wield or use double-bladed sabers freely.",
      },
    ],
  },
  "dune-legacy": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The definitive modernization of the grandfather of real-time strategy, transforming 1992's Dune II into a fluid modern RTS with multi-unit selection, HD widescreen, and online multiplayer.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "Westwood's 1992 Dune II established every convention of modern real-time strategy, but its original one-unit-at-a-time control scheme was painfully dated. Dune Legacy preserves the full charm and planetary warfare of Arrakis while introducing modern right-click drag-box selection, zoomable high-res graphics, and instant modern OS play.",
    longDescription:
      "Dune Legacy is an open-source modernization of Westwood Studios' genre-defining 1992 masterpiece Dune II: Battle for Arrakis. Frank Herbert's desert planet of Arrakis becomes the ultimate battleground where three Great Houses — the noble Atreides, the brutal Harkonnen, and the insidious Ordos — vie for control of the universe's most precious resource: the spice Melange.\n\nWhile the original DOS release forced players to click individual units and select 'Move' commands from sidebars, Dune Legacy overhauls the game with contemporary RTS controls: drag-box multi-unit selection, right-click move and attack orders, build queues, waypoint rallying, and minimap navigation.\n\nThe project features high-definition texture scaling, widescreen display support, smooth scrolling, a built-in map editor, and cross-platform online multiplayer with custom game lobbies.",
    bestFor: [
      "Classic RTS enthusiasts who want to experience the origin of Command & Conquer and StarCraft",
      "Dune and sci-fi fans seeking authentic Arrakis planetary conquest with Sandworms",
      "Retro gamers who love retro pixel art paired with contemporary quality-of-life controls",
    ],
    notFor: [
      "Players looking for 3D cinematic RTS engines like modern StarCraft II or Dawn of War",
      "Gamers who dislike retro base building and resource harvesting mechanics",
    ],
    comparableTo: [
      "Command & Conquer: Remastered",
      "OpenRA",
      "StarCraft",
      "Dune: Spice Wars",
      "Warcraft II",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download and install Dune Legacy for free through PlayBound.",
      },
      {
        platform: "all",
        text: "Select your allegiance: House Atreides (Sonic Tanks), House Harkonnen (Devastators), or House Ordos (Deviators).",
      },
      {
        platform: "all",
        text: "Harvest spice, lay concrete foundations, build outposts, and watch out for massive Sandworms emerging from the dunes.",
      },
    ],
    faq: [
      {
        q: "Is Dune Legacy free to play?",
        a: "Yes! Dune Legacy is completely free and open source under the GPL-2.0 license.",
      },
      {
        q: "What improvements does Dune Legacy add over original Dune II?",
        a: "It adds multi-unit selection, right-click orders, build queues, high-resolution widescreen graphics, smooth zoom, hotkeys, AI skirmish mode, map editor, and online multiplayer.",
      },
      {
        q: "How do Sandworms work in the game?",
        a: "Sandworms roam the open desert terrain, attracted by the vibrations of moving vehicles and spice harvesters. Unwary units can be swallowed whole in a single strike!",
      },
      {
        q: "Are the unique house superweapons included?",
        a: "Yes! Atreides retain their Sonic Tanks and Fremen allies, Harkonnen command heavy Devastator tanks and Death Hand missiles, and Ordos field fast Raider trikes and Deviator gas tanks.",
      },
      {
        q: "Does Dune Legacy support multiplayer?",
        a: "Yes! You can host or join LAN and internet multiplayer matches with custom skirmish maps and selectable starting spice reserves.",
      },
      {
        q: "Does Dune Legacy run on Steam Deck?",
        a: "Yes! Dune Legacy runs flawlessly on Steam Deck and modern Windows 11 with responsive touchscreen and trackpad controls.",
      },
    ],
  },
  mrboom: {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "A joyful, chaotic 8-player open-source tribute to classic Bomberman, packed with classic powerups, bouncy retro tunes, and seamless couch multiplayer.",
      lastVerified: "2026-08-15",
    },
    longDescription:
      "Mr. Boom is an open-source 8-player Bomberman clone originally created in 1999 and modernized for modern platforms. Players drop timed explosives, blast soft blocks, collect game-changing powerups, and attempt to trap and eliminate opponents in fast, frantic grid-based arenas.\n\nGameplay follows the timeless Bomberman arcade formula: shatter destructible maze blocks to uncover critical upgrades including Extra Bombs (laying multiple explosives at once), Bigger Flames (expanding linear blast radius), Speed Skates (increasing movement speed), and Bomb Kicking/Punching gloves to launch live explosives across the arena into enemy paths.\n\nChaotic dynamic mechanics keep every round unpredictable. Ride animal mounts like hopping kangaroos that leap over obstacles, trigger remote-detonation explosives, and dodge sudden illness skull curses that reverse controls or cause frantic involuntary bomb drops. When the countdown timer reaches sudden death, falling perimeter blocks crush the grid, forcing survivors into tight, frantic center-stage duels.\n\nThe game is built from the ground up for instantaneous local couch multiplayer, supporting up to eight simultaneous players on a single PC or Steam Deck with full plug-and-play USB and Bluetooth controller recognition. Intelligent AI bots with adjustable difficulty settings fill empty slots for solo training or co-op skirmishes.\n\nWith both lightweight standalone portable releases and Steam integration, zero loading screens, battery-friendly performance, and tracker chiptune music, Mr. Boom delivers timeless party action with zero paywalls or microtransactions.",
    whyWePickedIt:
      "Mr. Boom is pure party gaming perfection: plug in up to eight gamepads on one PC, add intelligent AI bots, and enjoy instantaneous explosive mayhem without loading screens or microtransactions.",
    bestFor: [
      "Living room party game nights with 2 to 8 players on the same couch",
      "Fans of classic Super Bomberman, Saturn Bomberman, and arcade maze battles",
      "Steam Deck party gaming with multiple connected Bluetooth gamepads",
      "Quick, lighthearted competition suitable for players of all ages",
      "Gamers looking for an instant-action, zero-install portable party title",
    ],
    notFor: [
      "Players seeking complex RPG leveling or lengthy story campaigns",
      "Gamers looking for slow-paced simulation games",
      "Those wanting single-player puzzle narratives",
    ],
    comparableTo: [
      "Super Bomberman",
      "Bomberman '94",
      "Duck Game",
      "TowerFall",
      "Move or Die",
      "Overcooked",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Install Mr. Boom for free via Steam or the standalone portable release directly through PlayBound.",
      },
      {
        platform: "linux",
        text: "On Linux and Steam Deck, Mr. Boom runs natively with full controller and multi-gamepad pairing support.",
      },
      {
        platform: "all",
        text: "Connect up to 8 gamepads or configure keyboard layouts in the options menu.",
      },
      {
        platform: "all",
        text: "Select player and AI bot counts, choose your battle arena, and start blasting!",
      },
    ],
    faq: [
      {
        q: "Is Mr. Boom completely free?",
        a: "Yes! Mr. Boom is 100% free and open source under the GPL-3.0 license with zero ads, paid DLC, or microtransactions.",
      },
      {
        q: "How many players can play simultaneously?",
        a: "Up to 8 players can play together locally on a single machine or over online netplay.",
      },
      {
        q: "Can I play solo against AI bots?",
        a: "Yes! You can fill any empty player slots with intelligent AI bots for solo practice or co-op team battles.",
      },
      {
        q: "What powerups are in the game?",
        a: "Powerups include extra bomb capacity, larger explosion radius, speed skates, bomb punching/kicking gloves, monster mounts, and trigger remotes.",
      },
      {
        q: "Does Mr. Boom support modern game controllers?",
        a: "Yes! Full plug-and-play support for Xbox, PlayStation, Switch Pro, Joy-Cons, and generic USB arcade sticks.",
      },
      {
        q: "Does Mr. Boom work on Steam Deck?",
        a: "Yes! It is lightweight, battery-friendly, and perfect for portable party multiplayer on Steam Deck with multiple Bluetooth controllers.",
      },
    ],
  },
  openmohaa: {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The definitive modernization of Steven Spielberg's cinematic WWII classic, restoring Medal of Honor: Allied Assault with 64-bit architecture, widescreen 4K visuals, and flawless modern OS compatibility.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "Medal of Honor: Allied Assault (designed by the original team that later created Call of Duty) defined the cinematic military shooter with its legendary Omaha Beach D-Day landing. OpenMOHAA modernizes this historic masterpiece on modern 64-bit multi-core PCs with raw mouse input, 144Hz+ refresh rates, and native widescreen rendering.",
    longDescription:
      "OpenMOHAA is a modern open-source re-implementation of 2002's legendary WWII shooter Medal of Honor: Allied Assault and its official expansion packs (Spearhead and Breakthrough). Built upon id Tech 3, OpenMOHAA brings 20+ years of engine advancements to Lt. Mike Powell's historic European theater missions.\n\nFrom the harrowing chaos of Omaha Beach on D-Day to covert infiltration missions behind German lines in Norway and France, Allied Assault remains one of the most atmospheric historical military campaigns ever made. OpenMOHAA resolves original CD-ROM SecuROM DRM lockouts, eliminates FOV stretching on 16:9 and 21:9 monitors, introduces raw mouse input for pinpoint sniper aim, and modernizes audio rendering for contemporary spatial sound.\n\nWith active support for classic multiplayer maps (Stalingrad, V2 Rocket Facility) and community mods, OpenMOHAA is the ultimate way to play this timeless shooter today.",
    bestFor: [
      "Fans of classic WWII military shooters like original Call of Duty, Return to Castle Wolfenstein, and Brothers in Arms",
      "Gamers who want to experience the iconic D-Day Omaha Beach invasion in uncapped framerates",
      "Retro FPS enthusiasts looking for authentic weapon handling without modern regenerating health",
    ],
    notFor: [
      "Players seeking modern sprint-slide-cancel movement or hero abilities",
      "Gamers who dislike classic health pack and medkit resource management",
    ],
    comparableTo: [
      "Call of Duty (2003)",
      "Return to Castle Wolfenstein",
      "Battlefield 1942",
      "Brothers in Arms: Road to Hill 30",
      "Sniper Elite",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Locate your Medal of Honor: Allied Assault game directory (from original CD media or digital copy).",
      },
      {
        platform: "windows",
        text: "Install OpenMOHAA via PlayBound, which automatically links your game assets and installs 64-bit modern engine binaries.",
      },
      {
        platform: "all",
        text: "Launch OpenMOHAA, configure your 4K widescreen resolution and controls, and step onto the transport craft.",
      },
    ],
    faq: [
      {
        q: "Is OpenMOHAA free?",
        a: "Yes! The OpenMOHAA engine is 100% free open-source software under GPL-2.0. You only need the original game asset files (Main/pak*.pk3) to play.",
      },
      {
        q: "Does OpenMOHAA include the Omaha Beach mission?",
        a: "Yes! The entire legendary single-player campaign, including Mission 3: Operation Overlord (Omaha Beach), is fully playable.",
      },
      {
        q: "Does it support the Spearhead and Breakthrough expansions?",
        a: "Yes! OpenMOHAA includes full compatibility with both official expansion packs and their unique weapons (British Lee-Enfield, Italian Carcano).",
      },
      {
        q: "Does OpenMOHAA fix widescreen stretching?",
        a: "Yes! OpenMOHAA provides native horizontal Field of View (FOV) scaling for 16:9, 16:10, 21:9 ultrawide, and multi-monitor setups without stretching the HUD.",
      },
      {
        q: "Does multiplayer work?",
        a: "Yes! OpenMOHAA supports LAN play and direct IP connection to community multiplayer servers for classic Free-for-All, Team Deathmatch, and Objective modes.",
      },
      {
        q: "Does it run on Steam Deck and Linux?",
        a: "Yes! Native Linux and Steam Deck builds are supported with full gamepad mapping profiles.",
      },
    ],
  },
  "metal-slug-remake": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "The peerless masterclass of 2D arcade pixel art and explosive run-and-gun carnage, celebrating SNK's iconic military satire with buttery-smooth gameplay.",
      lastVerified: "2026-08-15",
    },
    whyWePickedIt:
      "Metal Slug represents the absolute zenith of hand-drawn 2D pixel animation: every explosion, mechanical transformation, enemy surrender, and death animation was painstakingly illustrated with staggering detail and irreverent humor.",
    longDescription:
      "Metal Slug: Community Remake delivers the definitive 2D side-scrolling run-and-gun arcade experience originally created by Nazca Corporation and SNK for the Neo Geo. Players control Peregrine Falcon Strike Force veterans Marco Rossi and Tarma Roving as they wage all-out guerrilla war against General Morden's rebel army.\n\nArmed with high-caliber sidearms and legendary weapon drops — Heavy Machine Guns ('HEAVY MACHINE GUN!'), Rocket Launchers, Flamethrowers, and Shotguns — players blast through dense jungle fortresses, snowy mountain passes, and sprawling military complexes.\n\nPilot the iconic SV-001 'Metal Slug' super vehicle tank with vulcan cannons and cannon shells, rescue imprisoned bearded POWs for bonus rewards, and team up with a friend for classic two-player simultaneous co-op action.",
    bestFor: [
      "Arcade purists and retro gamers who love Contra, Gunstar Heroes, and Cuphead",
      "Fans of world-class 2D pixel art and detailed hand-drawn sprite animation",
      "Two-player couch co-op pairs wanting instant pickup-and-play action",
    ],
    notFor: [
      "Players seeking complex 3D environments or modern narrative RPG progression",
      "Gamers easily frustrated by classic arcade difficulty and bullet-dodging reflexes",
    ],
    comparableTo: [
      "Contra",
      "Cuphead",
      "Gunstar Heroes",
      "Broforce",
      "Huntdown",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download and extract Metal Slug: Community Remake in one click via PlayBound.",
      },
      {
        platform: "all",
        text: "Connect one or two gamepads and map your Fire, Jump, and Grenade buttons in the input menu.",
      },
      {
        platform: "all",
        text: "Press Start to drop into Mission 1: Rolling Bubbles.",
      },
    ],
    faq: [
      {
        q: "Is this remake free to play?",
        a: "Yes! This standalone community project is completely free to download and play.",
      },
      {
        q: "Does it support two-player simultaneous co-op?",
        a: "Yes! Two players can play together on the same screen using two gamepads or keyboard + gamepad.",
      },
      {
        q: "Can I enter and drive the Metal Slug tank?",
        a: "Yes! Jump into the SV-001 tank to gain high-armor defense, dual twin-barrel vulcan cannons, and explosive cannon mortar rounds.",
      },
      {
        q: "Are the classic voice lines and sound effects included?",
        a: "Yes! Features all original iconic voice announcements ('Rocket Lawnchair!', 'Thank you!'), military radio cues, and arcade soundtracks.",
      },
      {
        q: "Does it support 60 FPS and modern controllers?",
        a: "Yes! Fully uncapped smooth 60 FPS animation with native XInput controller support for Xbox, PlayStation, and Switch gamepads.",
      },
      {
        q: "Does it run on Steam Deck?",
        a: "Yes! Perfect for portable arcade action on Steam Deck with zero setup required.",
      },
    ],
  },
  "microsoft-allegiance": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "A legendary space combat simulation and real-time strategy hybrid, uniting first-person starfighter dogfights with top-down fleet command in massive online team warfare.",
      lastVerified: "2026-08-15",
    },
    longDescription:
      "Microsoft Allegiance (FreeAllegiance) is a groundbreaking multiplayer space combat simulation and team real-time strategy hybrid originally created by Microsoft Research and released as open source in 2004. Set in the 22nd century amidst the turbulent colonization of the solar system, multiple factions clash for dominance over asteroid-rich sectors connected by interstellar aleph warp gates.\n\nIn every battle, two or more teams compete in real-time coordination. One player on each team ascends to the Commander seat in a top-down RTS command view: managing team resources, constructing orbital space stations (Garrisons, Refineries, Tech Bases), deploying automated Helium-3 harvesting miners, conducting strategic research tech upgrades, and issuing tactical waypoint beacons to the fleet.\n\nSimultaneously, all other teammates fly in full first-person 3D space as active combat pilots. Choose from specialized starfighter classes—stealth scouts for probing enemy systems, agile interceptors for space dogfights, heavy tactical bombers with torpedo payloads, gunships for area denial, and multi-crew capital dreadnoughts.\n\nTeamwork and specialization dictate victory. Stealth scouts slip through enemy warp gates to plant target beacons on enemy refineries, heavy bomber wings coordinate timed torpedo runs while interceptors suppress defense turrets, and capital cruisers lead sector sieges with live gunner seats manned by fellow teammates.\n\nPreserved and actively played on Steam and standalone dedicated servers by the FreeAllegiance community, the game features full flight joystick/HOTAS support, active community squad leagues, rookie training academies, and zero microtransactions.",
    whyWePickedIt:
      "Microsoft Allegiance is one of the most innovative and forward-thinking multiplayer games ever created. Built by Microsoft Research in 2000 and open-sourced to the community in 2004, it seamlessly bridges the gap between first-person space flight simulators and real-time strategy commander mechanics.",
    bestFor: [
      "Flight simulation and space dogfight enthusiasts looking for high-skill Newtonian physics",
      "RTS fans who love commanding actual human pilots in coordinated fleet battles",
      "Team-oriented gamers who enjoy communication, tactical scouting, and role specialization",
      "Sci-Fi gamers who loved Freespace 2, Wing Commander, and Homeworld",
      "Space combat pilots with flight sticks, HOTAS throttles, or precision mouse flight setups",
    ],
    notFor: [
      "Casual solo players looking for brainless run-and-gun action without team communication",
      "Players unwilling to learn Newtonian 6DOF flight physics and energy management",
      "Those looking for offline single-player story campaigns",
    ],
    comparableTo: [
      "Natural Selection 2",
      "Freespace 2",
      "Homeworld",
      "Star Wars: Squadrons",
      "Empires Mod",
      "Savage: The Battle for Newerth",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Install FreeAllegiance for free via Steam or the official community installer through PlayBound.",
      },
      {
        platform: "windows",
        text: "Configure your flight controls (HOTAS, flight joystick, game controller, or mouse flight) in the Allegiance launcher settings.",
      },
      {
        platform: "all",
        text: "Complete the Cadet Flight Training academy missions to learn 6DOF flight, missile locking, and energy management.",
      },
      {
        platform: "all",
        text: "Join an active community server, pick your faction, and follow your Commander's flight orders.",
      },
    ],
    faq: [
      {
        q: "Is Microsoft Allegiance completely free?",
        a: "Yes! Microsoft Research released the entire source code and game assets under a free shared-source license in 2004. FreeAllegiance is 100% free with zero microtransactions.",
      },
      {
        q: "How does the Commander / Pilot hybrid gameplay work?",
        a: "The Commander manages bases, research, and economy in top-down RTS mode, while teammates fly individual starfighters in 3D first-person space combat carrying out strategic objectives.",
      },
      {
        q: "What types of ships can pilots fly?",
        a: "Pilots can fly Scouts, Interceptors, Fighters, Stealth Bombers, Gunships, Troop Transports, and multi-crew Capital Ships with player-manned turrets.",
      },
      {
        q: "Can multiple players crew the same capital ship?",
        a: "Yes! Large cruisers and gunships have dedicated pilot, bombardier, and automated turret gunner seats that teammates can man together.",
      },
      {
        q: "Does Allegiance support flight sticks and joysticks?",
        a: "Yes! Allegiance features full analog support for flight joysticks, HOTAS throttles, rudder pedals, and precision mouse flight.",
      },
      {
        q: "Are active multiplayer matches still played?",
        a: "Yes! The FreeAllegiance community hosts regular community match nights, squad wars, and rookie training academies on community servers.",
      },
    ],
  },

  "strikers-club": {
    qualityBar: clearsAll(
      "Strikers Club clears the PlayBound Bar: 100% free-to-play with zero pay-to-win mechanics, actively maintained by Oddshot Games, fully standalone physics-driven competitive multiplayer, and delivers deep mechanical soccer gameplay."
    ),
    longDescription:
      "Strikers Club is a physics-driven, skill-based multiplayer soccer game developed by Oddshot Games, the indie studio celebrated for the breakout physics hockey title Slapshot: Rebound. Bringing their signature mechanical philosophy to the football pitch, Strikers Club strips away the automated aim assistance, rubber-banding, and scripted magnetic ball animations typical of mainstream sports games in favor of 100% physics-calculated ball physics and direct athlete control.\n\nIn Strikers Club, you control only your own individual player on the pitch. There is no switching between AI teammates or relying on automated defensive positioning. Every step, slide tackle, first touch, and curved strike is governed by your movement momentum, contact angle, and player trajectory. The result is a game where individual skill and tactical team communication are the sole arbiters of victory.\n\nThe game offers exceptional match versatility, supporting casual and competitive lobbies ranging from fast-paced 1v1 duels, 3v3 and 4v4 street soccer cage formats, all the way up to full 11v11 squad matches with dedicated goalkeepers, midfielders, and wingers. High-skill mechanics like lofted through-balls, bicycle kicks, diving headers, and wall bounces create endless creative goal-scoring opportunities.\n\nAt the core of the experience is the Club system. Players can form persistent Strikers Clubs with up to 20 friends, design custom team jerseys and logos, construct their home stadium, and compete across structured seasonal league divisions with promotion and relegation battles against rival clubs worldwide.\n\nPowered by dedicated low-latency multiplayer servers and supporting both gamepads and keyboard/mouse, Strikers Club delivers crisp competitive soccer that runs smoothly on standard gaming rigs.",
    whyWePickedIt:
      "Oddshot Games has crafted a pure physics-first soccer experience that respects player skill above all else. With zero pay-to-win mechanics, direct athlete control, and deep club progression, Strikers Club is the premier skill-based football title for competitive sports fans.",
    bestFor: [
      "Players who want pure physics and manual skill without magnet-ball animations",
      "Co-op groups and clubs wanting to play together as individual teammates",
      "Fans of Rocket League, Slapshot: Rebound, and competitive sports mechanics",
      "Competitive esports players looking for a high mechanical skill ceiling",
      "Anyone tired of pay-to-win card packs in mainstream soccer games",
    ],
    notFor: [
      "Gamers who want to control an entire 11-man team with tactical managerial menus",
      "Players looking for scripted, automated FIFA / EA FC passing and shooting assist",
      "Single-player story career mode enthusiasts",
    ],
    comparableTo: [
      "Rocket League",
      "Slapshot: Rebound",
      "Rematch",
      "Supraball",
      "Kopanito All-Stars Football",
      "Pro Evolution Soccer",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Install Strikers Club for free directly through Steam (App ID 1952920).",
      },
      {
        platform: "windows",
        text: "Connect your Xbox or PlayStation gamepad and customize your analog stick deadzones and shot curve sensitivity in settings.",
      },
      {
        platform: "windows",
        text: "Spend 10 minutes in the solo practice gym mastering manual ball touches, wall rebounds, and power curved shots.",
      },
      {
        platform: "windows",
        text: "Team up with friends to form a persistent Strikers Club and climb the competitive seasonal ladder.",
      },
    ],
    faq: [
      {
        q: "Is Strikers Club free to play?",
        a: "Yes! Strikers Club is 100% free to play with zero pay-to-win mechanics or stat-altering purchases.",
      },
      {
        q: "How does Strikers Club differ from FIFA / EA Sports FC?",
        a: "In Strikers Club, you control only your single athlete on the pitch with 100% manual physics ball controls. There is no automated magnet-ball or aim assist.",
      },
      {
        q: "Can I play with a controller or keyboard and mouse?",
        a: "Both input methods are fully supported! Controllers provide smooth 360-degree analog steering, while keyboard and mouse allow precision directional aiming.",
      },
      {
        q: "What team sizes and match modes are available?",
        a: "Matches range from 1v1 duels, 3v3 and 4v4 cage matches, up to full 11v11 squad formations with dedicated goalkeepers.",
      },
      {
        q: "How does the Strikers Club league system work?",
        a: "You can create or join a persistent club with friends, customize your team kit and stadium, and compete in seasonal divisions with promotion and relegation.",
      },
      {
        q: "What are the hardware requirements?",
        a: "Strikers Club runs smoothly on modest PCs, requiring an Intel Core i3 processor, 4 GB RAM, and a DirectX 11 compatible graphics card.",
      },
    ],
  },

  "trigger-rally": {
    qualityBar: clearsAll(
      "Trigger Rally clears the PlayBound Bar: 100% free and open-source under GPL-2.0, complete with over 100 tracks, actively preserved with 64-bit builds and WebGL browser support, and delivers fast-paced 3D arcade off-road racing."
    ),
    longDescription:
      "Trigger Rally is a fast-paced, open-source 3D arcade rally driving game originally created by Jasmine Langridge and Andrei Borovsky, continuously preserved and enhanced by the Trigger Rally Team. Foregoing sterile asphalt race tracks, Trigger Rally drops players into the raw, unforgiving elements, testing driving precision and drift control across rugged natural terrain.\n\nRather than competing on a crowded circuit grid against aggressive AI traffic, Trigger Rally is built around the pure thrill of the stage time trial. Tracks are demarcated by a sequence of massive pulsating neon rings acting as checkpoints. Players must navigate tight winding paths, launch over natural hill crests, and slide through mud ruts to cross each checkpoint before the ruthless stage countdown timer reaches zero.\n\nThe game features an expressive physics model where surface friction dynamically dictates vehicle handling. Blasting across compacted gravel allows crisp, controlled power slides, while drifting through loose desert sand dunes saps momentum and deep icy snow banks demand delicate throttle modulation to avoid spinning out. An integrated audio co-pilot calls out upcoming sharp turns, crests, and water hazards in real time.\n\nContent is abundant, featuring over 100 hand-crafted stage tracks spanning desert canyons, alpine mountains, snowy tundras, and lush forests. Players can progress through structured single-player rally cups or customize individual stage weather, vehicle colors, and handling characteristics. The entire engine is designed for easy customization, allowing users to create new terrain heightmaps and checkpoint paths via straightforward XML files.\n\nWeighing under 150 MB and rendering smoothly on virtually any hardware with basic OpenGL acceleration, Trigger Rally provides an instant, pure arcade racing fix across desktop PCs and modern web browsers.",
    whyWePickedIt:
      "Trigger Rally captures the quintessential arcade time-trial rally experience. With its snappy physics, challenging checkpoint timer countdowns, and zero installation friction, it remains one of open-source gaming's most enjoyable lightweight racers.",
    bestFor: [
      "Fans of classic arcade rally games like Sega Rally and Colin McRae Rally",
      "Players who love tight time attack time-trial driving",
      "Gamers with older laptops or low-end hardware wanting 60+ FPS 3D racing",
      "Track creators and modders who enjoy editing XML terrain heightmaps",
      "Anyone seeking quick-restart driving sessions without microtransactions",
    ],
    notFor: [
      "Players wanting licensed real-world manufacturer cars (e.g. Ferrari or Porsche)",
      "Those seeking modern photorealistic sim-racing graphics like Forza Horizon or Dirt Rally 2.0",
      "Gamers looking for live online wheel-to-wheel multiplayer grid racing",
    ],
    comparableTo: [
      "Colin McRae Rally",
      "Sega Rally Championship",
      "V-Rally",
      "Rush Rally",
      "Dust Racing 2D",
      "Speed Dreams",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download and extract the Trigger Rally standalone portable zip (v0.6.6.1).",
      },
      {
        platform: "windows",
        text: "Run trigger-rally.exe to launch the game with zero installation footprint.",
      },
      {
        platform: "windows",
        text: "Connect your gamepad or racing wheel and configure your analog steering bindings in the Options menu.",
      },
      {
        platform: "windows",
        text: "Select a rally car and start with the introductory Warm Up Cup to master drifting through checkpoint rings.",
      },
    ],
    faq: [
      {
        q: "Is Trigger Rally completely free?",
        a: "Yes! Trigger Rally is 100% free and open-source software licensed under the GNU General Public License (GPL-2.0). There are no ads, microtransactions, or locked content.",
      },
      {
        q: "Can I play Trigger Rally in a web browser?",
        a: "Yes! The community maintains 'Trigger Rally Online Edition', a WebGL port playable directly inside any modern web browser without downloading files.",
      },
      {
        q: "Does Trigger Rally support gamepads and steering wheels?",
        a: "Yes! Trigger Rally includes full analog input support for standard USB gamepads, Xbox/PlayStation controllers, and USB racing wheels with configurable deadzones.",
      },
      {
        q: "How do I create custom tracks?",
        a: "Tracks in Trigger Rally are defined using plain XML files alongside standard PNG heightmap and terrain texture images in the data/maps folder.",
      },
      {
        q: "Does the game have multiplayer?",
        a: "Trigger Rally is primarily a single-player time trial and cup championship rally game focused on beating stage target times and personal best ghost records.",
      },
      {
        q: "What are the system requirements?",
        a: "Trigger Rally is exceptionally lightweight, running at high framerates on a 1.0 GHz CPU, 512 MB RAM, and any basic OpenGL-capable graphics chip.",
      },
    ],
  },

  brawlhalla: {
    qualityBar: clearsAll(
      "Brawlhalla clears the PlayBound Bar: 100% free-to-play with zero pay-to-win, over 50 uniquely balanced Legends, robust cross-play rollback netcode, and an active global competitive esports circuit."
    ),
    longDescription:
      "Brawlhalla is an acclaimed free-to-play 2D platform fighter developed by Blue Mammoth Games and published by Ubisoft, uniting over 100 million players across the globe in fast-paced arena combat. Drawing core inspiration from classic platform brawlers like Super Smash Bros., Brawlhalla takes the genre's aerial mobility and edge-guarding intensity and pairs it with clean, responsive mechanics engineered for competitive tournament play.\n\nCombat revolves around weapon drops that descend onto the floating battlefield. Every Legend in the game wields a distinct combination of two weapon archetypes—ranging from Swords, Blasters, Scythes, and Gauntlets to Rocket Lances, Bows, Greatswords, and Battle Boots. While light attacks share familiar combo pathways within a weapon class, each fighter features six unique, character-defining signature heavy attacks that deliver massive knockback and stage-control utility.\n\nThe game offers a deep and varied suite of game modes. Competitive players can grind the ranked 1v1 and 2v2 matchmaking ladders from Tin through Diamond and Valhallan rank. For casual play, custom lobbies accommodate up to 8 players for chaotic Free-for-All brawls, Strikeout, Brawlball, Volleybrawl, and special event arcade modes with fully customizable tournament rules and gravity modifiers.\n\nWith over 50 original mythological Legends to master and frequent blockbuster crossover events (including Adventure Time, Street Fighter, WWE, Star Wars, Halo, and SpongeBob SquarePants), roster variety is immense. Crucially, the game's economy is strictly cosmetic—all Legends can be unlocked purely with gold earned from matches, and a weekly rotating free roster ensures everyone can jump in and compete without spending a dime.\n\nEngineered with lightweight cross-platform technology and responsive rollback netcode, Brawlhalla runs at rock-solid 60+ FPS on virtually any modern PC. Full native cross-play and cross-progression unite players across PC, consoles, and mobile devices with seamless parity.",
    whyWePickedIt:
      "Brawlhalla is the gold standard for free-to-play platform fighters. With tight rollback netcode, a completely fair free-to-play model, massive roster depth, and cross-play across every platform, it delivers endless competitive and casual fun.",
    bestFor: [
      "Fans of platform fighters like Super Smash Bros. and Rivals of Aether",
      "Players wanting fast, skill-based 1v1 and 2v2 competitive PvP",
      "Gaming groups looking for seamless cross-play party matches across PC, console, and mobile",
      "Fighters who love high-mobility aerial combos and weapon-based combat",
      "Anyone seeking a fair, genuine free-to-play title with no pay-to-win mechanics",
    ],
    notFor: [
      "Players seeking traditional 2D/3D lane-based footsies fighters like Street Fighter 6 or Tekken 8",
      "Gamers looking for deep single-player story campaigns",
      "Those who dislike floaty aerial movement and ledge-guarding ring-out mechanics",
    ],
    comparableTo: [
      "Super Smash Bros. Ultimate",
      "Rivals of Aether",
      "MultiVersus",
      "Nickelodeon All-Star Brawl",
      "Flash Party",
      "Lethal League Blaze",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Launch Steam and install Brawlhalla (App ID 291550) for free.",
      },
      {
        platform: "windows",
        text: "Connect your gamepad, keyboard, or arcade stick and configure your keybindings in the Options menu.",
      },
      {
        platform: "windows",
        text: "Complete the introductory tutorial and test weapon strings in the offline Training Room.",
      },
      {
        platform: "windows",
        text: "Queue for Ranked 1v1/2v2 or create a custom lobby with friends to start brawling.",
      },
    ],
    faq: [
      {
        q: "Is Brawlhalla truly free to play?",
        a: "Yes! Brawlhalla is 100% free to play. All gameplay features, ranked modes, and Legends can be unlocked using Gold earned from playing matches. Purchases are strictly cosmetic skins, podiums, and emotes.",
      },
      {
        q: "Does Brawlhalla support cross-play?",
        a: "Yes! Brawlhalla features full cross-play and cross-progression across PC (Steam), PlayStation, Xbox, Nintendo Switch, iOS, and Android.",
      },
      {
        q: "Can I play Brawlhalla with a controller or keyboard?",
        a: "Both controllers and keyboards are fully supported and competitive at the highest esports levels. You can completely remap controls in the Settings menu.",
      },
      {
        q: "How does the weapon system work?",
        a: "Each Legend possesses a unique combination of two weapons. During matches, weapon pods drop onto the stage, allowing you to cycle between your character's two weapon styles and unarmed combat.",
      },
      {
        q: "How does the ranked competitive system work?",
        a: "Brawlhalla features competitive 1v1 and 2v2 ranked seasons. Players earn ELO to climb through Tin, Bronze, Silver, Gold, Platinum, Diamond, and the top-tier Valhallan rank.",
      },
      {
        q: "What are the hardware requirements for Brawlhalla?",
        a: "Brawlhalla is extremely lightweight, requiring only a 2.0 GHz processor, 2 GB of RAM, and any basic DirectX 9.0c compatible graphics card.",
      },
    ],
  },

  ysoccer: {
    qualityBar: clearsAll(
      "YSoccer clears the PlayBound Bar: 100% free and open-source under GPL-3.0, completely finished with dozens of international leagues, actively maintained with modern 64-bit builds, stands independently without commercial assets, and delivers the definitive top-down retro football experience."
    ),
    longDescription:
      "Born out of the legendary 16-bit golden era of European sports games, YSoccer is the open-source community's love letter to Sensible World of Soccer (SWOS) and Kick Off. While modern corporate football titles have drifted toward sluggish 3D animation prioritisation and predatory card-collecting modes, YSoccer preserves the pure, immediate rush of top-down arcade football where matches are won on instinctive reflexes, sharp spatial vision, and lightning-fast passing lanes.\n\nAt the heart of YSoccer is its legendary 'aftertouch' ball physics engine. Unlike contemporary simulations where the ball is glued to player sprites through artificial suction, the ball in YSoccer exists as a completely independent, bouncing object. Tapping the pass or shoot button unleashes a strike, while pushing the analog stick or directional pad in mid-air immediately curls the trajectory—letting you bend audacious 30-yard screamers around defenders, execute dipping bicycle kicks, or loop deft chipped lobs over onrushing goalkeepers.\n\nTactical depth runs far deeper than its retro pixel-art presentation suggests. Managers can design custom tactical formations via an interactive pitch grid, dictating precise player positioning during defensive stands, midfield transitions, and offensive overloads. Furthermore, diverse pitch surfaces—from lush wet grass and baked hard dirt to mud-soaked quagmires and frozen snow—drastically affect ball friction, bounce height, and slide tackle distances, with dynamic wind and rain altering crosses in real time.\n\nContent and community customization are front and centre. YSoccer features an expansive built-in database of international tournaments, custom leagues, and domestic cups. A comprehensive visual editor empowers players to customize team kits, shirt patterns, shorts, player skin tones, and individual skill parameters (such as top speed, shot power, heading precision, and passing vision). The entire team structure is saved in clean, transparent JSON files for effortless modding and sharing.\n\nEngineered on a lightweight Java/LibGDX framework, YSoccer runs at buttery-smooth 60+ FPS on virtually any hardware with zero installation friction. Supporting 1 to 4 local players on USB gamepads or keyboards, it provides instantaneous local tournament action, full match replay scrubbers with slow-motion controls, and the unmatched joy of competitive couch multiplayer football.",
    whyWePickedIt:
      "YSoccer captures the joyful, unadulterated essence of 1990s Amiga football. With its lightning pace, authentic aftertouch curving ball physics, and rich open-source team editing, it delivers pure sports gameplay without microtransactions or corporate bloat.",
    bestFor: [
      "Fans of Sensible World of Soccer (SWOS), Kick Off, and classic 16-bit arcade football",
      "Players who appreciate physics-based ball control and manual aftertouch shot curving",
      "Couch multiplayer groups looking for fast-paced 1v1 and 2v2 tournament action",
      "Database and tactics tinkerers who enjoy customizing teams, kits, and player stats",
      "Gamers with low-spec laptops seeking a deep, zero-overhead sports title",
    ],
    notFor: [
      "Players seeking 3D photorealistic broadcast simulations like EA Sports FC or eFootball",
      "Those who prefer modern dual-stick trick controls and magnetic ball-dribbling assists",
      "Gamers looking for deep narrative-driven RPG manager career modes",
    ],
    comparableTo: [
      "Sensible World of Soccer (SWOS)",
      "Kick Off 2",
      "Super Arcade Football",
      "Dino Dini's Goal!",
      "Tiki-Taka Soccer",
      "Natural Soccer",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Download and extract the standalone YSoccer portable zip (v19) to any folder.",
      },
      {
        platform: "windows",
        text: "Run ysoccer19.exe to start playing instantly with zero installation overhead.",
      },
      {
        platform: "windows",
        text: "Connect your USB gamepads and configure one-button or two-button action layouts in the Controls menu.",
      },
      {
        platform: "windows",
        text: "Select Friendly Match, Custom League, or DIY Cup and choose your favorite club or national team.",
      },
    ],
    faq: [
      {
        q: "Is YSoccer completely free?",
        a: "Yes! YSoccer is 100% free and open-source software licensed under the GNU General Public License (GPL-3.0). There are no ads, subscriptions, or microtransactions.",
      },
      {
        q: "How does the 'aftertouch' shooting mechanic work?",
        a: "When you strike the ball, holding a directional input immediately after pressing the button applies spin in mid-air, allowing you to curl shots around goalkeepers or swerve crosses.",
      },
      {
        q: "Does YSoccer support modern gamepads?",
        a: "Yes! YSoccer features plug-and-play support for standard USB controllers, Xbox gamepads, DualShock/DualSense controllers, and keyboards, accommodating up to 4 simultaneous players.",
      },
      {
        q: "Can I edit teams, kits, and player stats?",
        a: "Yes! YSoccer includes full in-game visual editors for team kits, player appearances, and individual skill ratings, saved in human-readable JSON files.",
      },
      {
        q: "Do weather and pitch conditions affect gameplay?",
        a: "Yes! Wet grass increases ball skid speed, muddy pitches create drag, frozen turf causes unpredictable bounces, and strong winds noticeably alter aerial ball flight.",
      },
      {
        q: "What are the system requirements?",
        a: "YSoccer is extremely lightweight, requiring only a 1.5 GHz processor, 1 GB RAM, and any basic OpenGL-compatible graphics card.",
      },
    ],
  },
};

/** Merge editorial content onto a factual catalog entry. */
export function withEditorial(game: Game): Game {
  const extra = editorial[game.slug];
  return extra ? { ...game, ...extra } : game;
}
