/**
 * Reviewed editorial and factual corrections for the fifteen named Dedicated
 * drafts. The catalog wave takes only the fields named for each slug in its
 * allowlist. No media, installation recipe, status, or publication field is
 * supplied here. Dates/credits/platforms are from the official Steam app pages
 * (app IDs in the map below), the studios' sites, and the original BF1942
 * Anthology packaging. Editorial is original PlayBound copy, not store prose.
 */

type DraftPatch = Readonly<Record<string, unknown>>;

const qualityBar = (verdict: string, genuinelyFree = false) => ({
  genuinelyFree,
  finished: true,
  activelyMaintained: false,
  standsAlone: true,
  highQuality: false, // Hands-on PlayBound testing has not happened yet.
  verdict,
  lastVerified: "2026-10-01",
});

const installFrom = (store: string, note: string) => [
  { platform: "all", text: `Get your own copy from ${store}, then install it with that store's client or installer. ${note}` },
  { platform: "windows", text: "Return to PlayBound and use Locate if the launcher does not discover the installed executable automatically." },
];

export const DEDICATED_DRAFT_EDITORIAL: Readonly<Record<string, DraftPatch>> = {
  "battlefield-1942-anthology": {
    tagline: "A World War II battlefield big enough for infantry, tanks, ships, and the pilot who absolutely cannot land.",
    description: "DICE's landmark combined-arms shooter bundles Battlefield 1942 with The Road to Rome and Secret Weapons of WWII. Capture flags across enormous maps, switch between infantry and vehicles, and bring friends who know when to repair a tank.",
    developerSlug: "dice", developerName: "DICE", releaseYear: 2004, license: "Proprietary commercial game",
    access: { priceType: "PAID", purchaseRequired: true },
    website: "https://www.ea.com/games/battlefield/battlefield-1942",
    genres: ["FPS", "Shooter", "Action"], platforms: ["Windows"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("A jeep bounces over a ridge, a fighter cuts across the sky, and suddenly a flag fight becomes an entire war story."),
    thatOneThing: "You can leave a firefight, steal an aircraft, and change the outcome of the same battle from above.",
    longDescription: `Battlefield 1942 did not invent the large multiplayer shooter, but it gave the idea a shape that still makes sense the moment a transport plane passes overhead. DICE set World War II battles across broad maps where the infantry fight matters and the vehicles are more than scenery. The Anthology brings the original game together with The Road to Rome and Secret Weapons of WWII, widening the map and equipment selection without turning the base game into a separate sequel.

The important unit of play is the flag. Two teams push across a map, capturing points that change where reinforcements arrive and where the next fight will happen. A player can defend a position with a rifle, hop into a tank to break a roadblock, or spend the match trying to become useful in an aircraft. Some of those attempts end in triumph. Others end with a plane in the sea and your entire squad watching. That freedom is the appeal: the match keeps producing stories that no one could have scripted in advance.

The maps give vehicles room to breathe. A ship or bomber feels powerful because the opposing team can see it coming and has time to respond. The same scale makes a coordinated squad valuable. Repairing armor, keeping a route open, and holding a forward spawn can matter as much as the kill count. The expansions add more settings and hardware, but the simple capture-point tug-of-war remains the reason to gather a group.

This is also an old PC game. Expect an interface built for a mouse and keyboard, compatibility work on modern Windows, and online play that does not rely on the original GameSpy service. Players need compatible versions and a working server route. PlayBound can help with installation and parties, but it cannot make a mismatched client join a server or grant rights to a copy you do not own.

There is a specific pleasure in learning a map as a team. The bridge that looked optional last match becomes the route that gets armor behind the enemy. The empty jeep matters because it can move a squad before the other side resets its defense. None of these small decisions appear on a skill tree. They happen because the match is large enough to make logistics, timing, and a little trust useful.

We keep Battlefield 1942 here because the big, messy multiplayer night is still worth preserving. It is a game where a single friend driving the jeep can be more memorable than any progression reward.`,
    whyWePickedIt: "We picked Battlefield 1942 Anthology because a good multiplayer game is more than a matchmaking queue. Its flags, vehicles, and enormous maps give friends room to coordinate, improvise, and laugh at terrible plans. The original services have aged; the play itself has not.",
    bestFor: ["Groups that want large team battles with vehicles", "Players curious about the roots of modern Battlefield"],
    notFor: ["Players who need modern matchmaking and anti-cheat conveniences", "Anyone expecting native controller support or effortless compatibility"],
    comparableTo: ["Battlefield 2", "Battlefield 1943"],
    faq: [
      { q: "What does the Anthology include?", a: "Battlefield 1942, The Road to Rome, and Secret Weapons of WWII." },
      { q: "Does the original server browser still work?", a: "The original GameSpy service is gone. Use a compatible server or direct connection where available." },
      { q: "Can I play with a controller?", a: "There is no native PC gamepad support. Keyboard and mouse are the default controls." },
      { q: "Do all players need the same version?", a: "Yes. Server and clients need matching game versions and compatible expansion content." },
    ],
    installSteps: [{ platform: "windows", text: "Install from a copy you are entitled to use. PlayBound's installer handles the staged Anthology package where available; use Locate if an existing installation is not detected." }],
  },
  "counter-strike-source": {
    tagline: "One bombsite, a few grenades, and no second chance until the round ends.",
    description: "Valve's Source-engine Counter-Strike keeps the buy-round rhythm and lethal team play that make a good callout matter. Pick a side, learn the angles, and join a server where everyone knows the map just a little better than you do.",
    developerSlug: "valve", developerName: "Valve", releaseYear: 2004, license: "Proprietary commercial game",
    genres: ["FPS", "Shooter", "Action"], platforms: ["Windows", "Linux"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("A missed flash costs the round; a patient teammate can win it with one clean angle."),
    thatOneThing: "Every round turns a few seconds of information and positioning into a decision the whole team has to live with.",
    longDescription: `Counter-Strike: Source takes the original Counter-Strike's team-based bomb defusal and hostage rescue and runs it through Valve's Source engine. The result looks different from the older versions, but the match still hinges on familiar choices: which route to take, when to spend your cash, when to trust a teammate's call, and whether to hold an angle for one more heartbeat.

The attackers and defenders have different jobs. On bomb maps, one side must get a device planted while the other tries to stop them or defuse it before the timer runs out. Death takes you out of that round, which makes even a quiet corner tense. You buy weapons and equipment at the start, and the economy carries mistakes forward. Saving a rifle for the next round can be wiser than charging a defended site with five seconds left.

The Source version adds physics and a visual facelift, but its best trick is still the clarity of the format. A flashbang forces someone off an angle. A smoke can cut a sightline long enough to cross. Sound gives away an impatient rotation. None of that requires a progression grind; a friend who learns to communicate has gained something more useful than a new unlock. Community servers extend the game beyond the standard competitive rotation, with custom maps and rules that can make a familiar shooter feel surprisingly different.

This is deliberately demanding. There is no long respawn loop to soften a bad peek, and experienced players know map geometry down to the pixel. Valve Anti-Cheat is part of the official online ecosystem. Controller play is not a native selling point on PC; keyboard and mouse remain the expected input, especially on serious servers.

The community-server scene gives the game a second kind of longevity. A favorite server can become a familiar meeting place, with regulars who recognize one another and maps that are not in the official rotation. That also means the experience depends on the server's rules and population. Finding the right one takes more care than clicking a universal matchmaking button, but the payoff is a multiplayer space that feels like it belongs to its players.

We keep Source in the catalog because it is still an easy way to see why round-based team shooters work. Bring people who are willing to talk, pick a server, and let the next round be your chance to do the first one better.`,
    whyWePickedIt: "We picked Counter-Strike: Source because its simple rules leave enormous room for teamwork and community servers. It rewards a useful callout and a well-timed smoke more than a paid advantage, which is exactly the sort of multiplayer value PlayBound wants to keep accessible.",
    bestFor: ["Friends who like deliberate round-based shooters", "Players exploring custom Source community servers"],
    notFor: ["Players who want instant respawns after every mistake", "Controller-first players looking for native gamepad support"],
    comparableTo: ["Counter-Strike 1.6", "Counter-Strike 2"],
    faq: [
      { q: "Is Counter-Strike: Source free?", a: "No. Each player needs a legitimate copy on Steam." },
      { q: "Can I join a community server?", a: "Yes. Use the in-game server browser or a direct server address." },
      { q: "Does it have native controller support?", a: "The PC release is designed around keyboard and mouse; no native full-controller claim is made here." },
      { q: "What modes are included?", a: "Bomb defusal and hostage rescue are the classic core, and community servers can run custom maps and modes." },
    ],
    installSteps: installFrom("Steam", "The game remains tied to your Steam library."),
  },
  factorio: {
    tagline: "The conveyor belt works. Then the copper runs out. Then it's three in the morning.",
    description: "Build an automated factory from hand-fed drills to sprawling rail and logistics networks. Factorio makes every bottleneck visible and gives you a hundred ways to fix it, alone or with friends who have very different ideas about belt etiquette.",
    developerSlug: "wube-software", developerName: "Wube Software", releaseYear: 2020, license: "Proprietary commercial game",
    website: "https://factorio.com/",
    genres: ["Strategy", "Simulation", "Sandbox"], platforms: ["Windows", "macOS", "Linux"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("You solve one jam on the iron line and immediately notice three more opportunities to make the factory smarter."),
    thatOneThing: "A production line is a physical machine you can walk through, debug, rebuild, and eventually admire from the edge of a speeding train.",
    longDescription: `Factorio begins with a small indignity: you have to collect the raw materials yourself. Soon you place a mining drill, route ore into a furnace, and start asking a dangerous question: what if this step happened without me? Wube Software turns that question into an entire factory-building game, one where belts, inserters, power lines, trains, and robots become parts of a system you can understand because you assembled every piece of it.

The early hours are about basic dependencies. Iron and copper become plates. Plates become circuits and gears. Those become machines that make more machines. Space is not just decoration; a badly placed belt can cut off an expansion, and a tidy design can save you repeated rebuilds. The goal of launching a rocket provides direction, but the satisfaction lives in diagnosing an empty assembler or discovering why one side of a bus cannot keep up.

Factorio is unusually good at making complexity legible. The machines have simple jobs and obvious inputs and outputs. When production slows, you can trace the problem backward until you find the missing resource. Later, trains move materials between distant outposts, logistics robots take over awkward transfers, and circuit networks let ambitious players build controls that look suspiciously like software engineering. You can keep it simple or spend an evening optimizing a single intersection.

Multiplayer makes the factory both faster and funnier. One friend can explore while another expands power and a third quietly redesigns the smelters. Shared projects need some coordination, because a helpful-looking shortcut can starve the entire line. The game supports public and LAN sessions and dedicated servers, but everyone must run compatible versions and mods. Its controller support is partial on PC, so some menus still favor a mouse.

The mod scene gives experienced builders another way to revisit the problem. A new production chain can overturn the layout you thought was perfect, while quality-of-life tools can make a sprawling save easier to run. Start with the original rules before adding a large overhaul; learning the factory's logic is what makes changing it interesting. On a shared server, agreeing on a mod list first saves everyone the unpleasant surprise of a world they cannot join.

Factorio earns its place here because the value is in the thinking it invites. It can be a focused solo puzzle or a long-running group project, and each improvement feels like something you built rather than something you bought.`,
    whyWePickedIt: "We picked Factorio because few games make a shared project this compelling. The factory gives every player a useful job, every mistake a visible consequence, and every clever fix a story to tell. Its mod scene stretches that value even further without replacing the strength of the original game.",
    bestFor: ["Players who enjoy automation and finding bottlenecks", "Groups that want a persistent cooperative project"],
    notFor: ["Players who dislike planning layouts and rebuilding systems", "Anyone expecting full native controller navigation on PC"],
    comparableTo: ["Satisfactory", "Dyson Sphere Program"],
    faq: [
      { q: "Can friends work on the same factory?", a: "Yes. Factorio supports online and LAN multiplayer as well as dedicated servers." },
      { q: "Do mods need to match?", a: "Yes. Players joining a modded server need compatible game versions and mod sets." },
      { q: "Is controller support complete?", a: "Steam lists partial controller support, so some interactions still work best with keyboard and mouse." },
      { q: "Does Factorio require Steam?", a: "No. It is also sold through GOG and the developer's own site; each player still needs a legitimate copy." },
    ],
    installSteps: installFrom("GOG, Steam, or Factorio.com", "Use the edition matching the copy you purchased."),
  },
  necesse: {
    tagline: "Build a village above the dungeon you keep promising to explore tonight.",
    description: "Necesse mixes top-down exploration, boss fights, crafting, and a settlement whose residents can keep the place running while you leave for another expedition. Play alone or build a world with friends.",
    developerSlug: "fair-games-aps", developerName: "Fair Games ApS", releaseYear: 2025, license: "Proprietary commercial game",
    genres: ["Sandbox", "Survival", "RPG", "Adventure"], platforms: ["Windows", "macOS", "Linux"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("One more dungeon trip turns into a supply run, then a new workshop, then a village that almost runs itself."),
    thatOneThing: "Settlers can farm, craft, and defend your home while you and your friends disappear into the next dungeon.",
    longDescription: `Necesse gives the familiar survival-crafting loop a useful twist: your home can become a working settlement rather than a chest room with nicer walls. Fair Games ApS built a top-down world where you mine, craft, explore islands, fight bosses, and recruit residents who take on real jobs. The result sits somewhere between an adventure with a home base and a management game that keeps sending you out into danger.

An expedition might start with a plan to find ore and end with your party chasing a boss across an unfamiliar biome. Combat has room for different equipment and roles, so a group can divide the work between gathering, building, fighting, and keeping supplies flowing. Back at the settlement, residents help make that work less repetitive. Assigning jobs, expanding workshops, and protecting the village turn the hours between boss fights into their own set of decisions.

The world is broad, but it does not insist that every session be a grand campaign. A friend can drop in to help build a road, gather supplies, or tackle one difficult fight. Dedicated servers make a persistent world possible, and Necesse supports both online and LAN play. Its own difficulty and world settings let a group decide how punishing a night should be. As with most shared survival worlds, compatible game versions and mods matter more than the invitation link.

There is an honest catch to the generosity: this is a game about collecting materials and maintaining a home. Players who want a straight line of boss fights may tire of the trips between them. The top-down presentation is readable, but it is also busy when a settlement grows and several systems overlap. Give it room to unfold rather than expecting the first ten minutes to show the whole game.

The settlement also makes it easier to return after a break. A world with recognizable paths, workstations, and residents has a memory that a run-based game cannot quite offer. You can log in with only a short window, gather a few resources, repair a wall, or prepare supplies for the next shared expedition. Those small contributions count, and they help a server feel like a place rather than a lobby you abandon after one fight.

Necesse belongs on PlayBound because it makes cooperative time feel productive without turning every player into the same job. One person can organize the village while another returns with an improbable story and just enough resources to build something new.`,
    whyWePickedIt: "We picked Necesse because its multiplayer world gives friends distinct ways to contribute. The settler system respects your time between adventures, while bosses and exploration give the group a reason to come back. That combination is unusually good value for a persistent party game.",
    bestFor: ["Friends who want a shared survival world and a useful home base", "Players who enjoy crafting and top-down boss fights"],
    notFor: ["Players who want only combat without resource gathering", "Groups unwilling to coordinate game and mod versions"],
    comparableTo: ["Terraria", "Core Keeper"],
    faq: [
      { q: "Can Necesse run on a dedicated server?", a: "Yes. The game supports persistent dedicated worlds and direct-IP joining." },
      { q: "Does it have native controller support?", a: "Yes. The Steam release lists full controller support." },
      { q: "Can I play alone?", a: "Yes. The same world and settlement systems work in single-player." },
      { q: "Do friends need their own copy?", a: "Yes. Each player needs a legitimate copy and a compatible game version." },
    ],
    installSteps: installFrom("Steam", "Each player needs their own copy."),
  },
  "dont-starve-together": {
    tagline: "A campfire, a suspiciously quiet forest, and friends who ate the last berries.",
    description: "Klei's standalone multiplayer survival game turns hunger, seasons, monsters, and strange discoveries into a shared problem. Build a camp, divide the chores, and try to make it through the night without becoming a ghost.",
    developerSlug: "klei-entertainment", developerName: "Klei Entertainment", releaseYear: 2016, license: "Proprietary commercial game",
    genres: ["Survival", "Adventure", "Sandbox"], platforms: ["Windows", "macOS", "Linux"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("A good camp feels safe right up to the moment winter arrives and everyone remembers the food plan was imaginary."),
    thatOneThing: "Everyone can have a job around camp, but the world keeps finding new ways to make the whole group improvise.",
    longDescription: `Don't Starve Together takes the uneasy wilderness of Don't Starve and lets other people share the consequences of your decisions. Klei built this as a standalone multiplayer game, so nobody needs to own the original single-player release. The Constant is full of resources, creatures, seasons, and strange structures that reward curiosity while punishing the sort of curiosity that walks into danger without a torch.

The basic survival loop is immediate. Gather food and materials, make tools, establish a camp, then venture farther when your supplies can support it. Hunger, health, and sanity all demand attention. Darkness is a real threat rather than a change in scenery. As the days pass, weather and seasonal bosses put pressure on a camp that looked perfectly organized yesterday. A friend might spend the evening farming while another scouts a coastline; both are contributing to the same fragile plan.

Characters bring different strengths and problems, which is why a group is more interesting than a row of identical survivors. Cooperation helps, but it does not remove the game's bite. Someone still has to decide whether that distant ruin is worth the risk before winter. Public and private servers can keep a world running between sessions, and the game supports online and LAN play. A dedicated world needs the owner's Klei cluster token and compatible server mods.

The art looks like an illustrated storybook, but this is not a gentle crafting sandbox. Early deaths can feel abrupt, and learning what the world wants often involves losing supplies you worked hard to gather. Players who dislike experimentation or a little chaos should know that going in. There is no paid shortcut that replaces an understanding of seasons, food, and where not to stand during a boss fight.

The game's expansions of its world matter because they create fresh reasons to leave the safety of a working base. A coast, a cave, or a distant island can offer resources the group needs and a threat it does not yet understand. Choosing when to take that risk is a shared decision. The best nights are not necessarily the ones where everything goes right; they are the ones where somebody makes it home carrying exactly what the camp needed.

We value it because a good survival game gives friends stories that belong to their own world. The camp can fail spectacularly, and the next attempt begins with everyone knowing one thing they did not know before.`,
    whyWePickedIt: "We picked Don't Starve Together because its best moments come from cooperation under pressure. The game is a complete standalone multiplayer experience, the world can persist on a dedicated server, and its hazards make every group's survival story feel earned.",
    bestFor: ["Friends who like difficult shared survival", "Groups willing to learn seasons and build a lasting camp"],
    notFor: ["Players seeking a relaxed, consequence-free crafting game", "Anyone who dislikes losing progress while learning a world"],
    comparableTo: ["Project Zomboid", "Valheim"],
    faq: [
      { q: "Do I need the original Don't Starve?", a: "No. Don't Starve Together is a standalone purchase." },
      { q: "Can friends use a persistent server?", a: "Yes. Dedicated worlds are supported; the owner supplies a Klei cluster token." },
      { q: "Does the PC version support controllers?", a: "Yes. Steam lists full controller support." },
      { q: "Do server mods need to match?", a: "Clients must have the content and version required by the server." },
    ],
    installSteps: installFrom("Steam", "Each player needs their own copy; the original Don't Starve is not required."),
  },
  barotrauma: {
    tagline: "The submarine is leaking, the reactor is hot, and someone insists this was the safe route.",
    description: "Crew a submarine beneath Europa's ice in a co-op game of repair, navigation, monsters, and very bad timing. Barotrauma gives every player a job, then makes the whole boat depend on whether they do it.",
    developerSlug: "fakefish-undertow", developerName: "FakeFish & Undertow Games", releaseYear: 2023, license: "Proprietary commercial game",
    genres: ["Survival", "Simulation", "Horror", "Adventure"], platforms: ["Windows", "macOS", "Linux"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("A quiet sonar ping becomes a flooded corridor, and suddenly the mechanic is the most popular person aboard."),
    thatOneThing: "The boat is a shared machine: a single broken pump can turn everybody's plan into damage control.",
    longDescription: `Barotrauma asks a group of players to operate a submarine under the ice of Jupiter's moon Europa. FakeFish and Undertow Games built a two-dimensional vessel that feels like a place with real systems, not a moving backdrop. There are doors, pumps, wiring, medical supplies, weapons, and a reactor that somebody has to monitor. Outside is a hostile ocean. Inside is a crew whose idea of a routine trip is usually about to be corrected.

Players can take different jobs: captain, engineer, mechanic, medic, security, or assistant. Each role can help the vessel survive, but no one is exempt from emergencies. A breach floods compartments while creatures push from outside; someone repairs the hull, someone treats injuries, and someone else tries to keep the submarine off the seabed. The memorable part is how these jobs collide. A good decision in one room can become a problem in another if nobody explains what they are doing.

The campaign gives that pressure a longer shape. Crews take missions, buy supplies, improve equipment, and move between outposts. The workshop and custom submarine tools create plenty of room to reshape a voyage. A dedicated server can host a crew of up to sixteen, although a smaller group is often easier to manage while everyone learns the machinery. Online multiplayer is the heart of the game; it is not a promise of couch play or native gamepad support.

The learning curve is real. The controls are dense, the systems can fail together, and a new player may spend their first voyage unsure where to put a wrench. Some groups enjoy the possibility of sabotage; others should set clear expectations before starting. Barotrauma is at its best when the crew is willing to communicate and treat a disaster as part of the evening rather than a wasted run.

Custom submarines make that cooperation feel even more personal. A layout can be optimized for a disciplined crew or become a maze that new recruits will need to learn under pressure. The submarine's design changes where a breach is most dangerous, how quickly supplies can reach an injured teammate, and whether the captain can get useful information before giving an order. Building or choosing the right vessel is part of preparing the whole group, not just picking a cosmetic skin.

We keep it here because a cooperative game should give everyone agency. Barotrauma makes a mechanic's quick repair as dramatic as a captain's order, and it gives a party stories that would be impossible to plan.`,
    whyWePickedIt: "We picked Barotrauma because the submarine turns multiplayer into genuine interdependence. Its roles, systems, and persistent voyages reward people who solve problems together, while workshop content gives a committed crew new reasons to launch again.",
    bestFor: ["Groups who enjoy role-based cooperation and shared emergencies", "Players who like tinkering with complex simulated machines"],
    notFor: ["Players who need quick, low-pressure sessions", "Controller-first groups expecting native full gamepad support"],
    comparableTo: ["We Need to Go Deeper", "Space Station 14"],
    faq: [
      { q: "How many people can crew one submarine?", a: "Barotrauma supports up to sixteen players in a multiplayer crew." },
      { q: "Can I host a persistent server?", a: "Yes. Dedicated servers are supported." },
      { q: "Is controller support native?", a: "The PC version does not advertise native gamepad support; keyboard and mouse are the expected controls." },
      { q: "Can I use workshop content?", a: "Yes, but players must install content required by the server." },
    ],
    installSteps: installFrom("Steam", "The server's required content must match the client."),
  },
  "stardew-valley": {
    tagline: "A little farm, a whole town, and a calendar that makes one more day dangerously easy.",
    description: "ConcernedApe's farming RPG lets you turn a neglected plot into a home, meet the neighbors, mine, fish, and build a farm with friends. The seasons keep moving; how you spend them is up to you.",
    developerSlug: "concernedape", developerName: "ConcernedApe", releaseYear: 2016, license: "Proprietary commercial game",
    website: "https://www.stardewvalley.net/",
    genres: ["Simulation", "RPG", "Sandbox"], platforms: ["Windows", "macOS", "Linux"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("You set out to water three plants and come home with a fish, a new friend, and plans for a much bigger farm."),
    thatOneThing: "The farm can be shared, but each friend is free to make a day of fishing, mining, or finally organizing those chests.",
    longDescription: `Stardew Valley begins with a patch of overgrown land and a decision to leave a less satisfying life behind. Eric Barone, known as ConcernedApe, made a farming RPG that gives that decision texture. Your farm is a practical project, but Pelican Town is full of people, routines, festivals, and small surprises that make it feel like more than a list of crops to harvest.

Days have a simple rhythm. Clear a little ground, plant something, water it, and decide what to do with the hours left. The mines offer combat and materials; the river and ocean offer fishing; town offers relationships and the slow work of becoming part of a community. Seasons change what grows and what you can find. That calendar gives choices weight without insisting that there is one efficient way to play. A missed opportunity usually becomes a reason to look forward to next year.

Co-op is where the game's generous design becomes particularly clear. Friends can share a farm and divide responsibilities naturally. One player can raise animals while another rebuilds the fields or spends an evening chasing rare fish. Online farms on desktop support up to eight people, and split-screen co-op is available for players sharing a PC. The host owns the farm save, so agree on when the group will play before everyone starts designing a corner of it.

The game does ask for patience. Early days can feel short, storage fills quickly, and some players will spend more time planning layouts than they expected. There is no need to speedrun the community center to have a good time. Controller support is native on PC, and the game is available on multiple storefronts, including GOG and Steam, but each player needs their own legitimate copy for online play.

The town gives the farm a reason to exist beyond optimization. A new season brings different visitors, festivals, and opportunities to know the neighbors better. You can spend a day trying to earn money or take a slower route and make a gift for someone who has become important to your character. That choice is not a failure to play efficiently. Stardew Valley works because the calendar makes progress visible while still leaving space for ordinary, unplanned days.

Stardew Valley belongs on PlayBound because it is a remarkable example of a paid game giving people years of worthwhile play. It is small enough to begin together and broad enough for a group to keep finding its own rhythm.`,
    whyWePickedIt: "We picked Stardew Valley because it respects the player's time and imagination. A shared farm makes cooperation feel natural rather than mandatory, and its steady updates and mod community keep a modestly priced game valuable long after the first harvest.",
    bestFor: ["Friends who want a low-pressure shared world", "Players who enjoy farming, town life, and small self-set goals"],
    notFor: ["Players who want constant combat or urgent objectives", "Groups that cannot agree who owns and opens the farm save"],
    comparableTo: ["Harvest Moon", "Sun Haven"],
    faq: [
      { q: "How many friends can join an online farm on PC?", a: "Current desktop versions support up to eight players on one farm." },
      { q: "Does it have split-screen?", a: "Yes. Split-screen co-op is available on one PC." },
      { q: "Can I use a controller?", a: "Yes. Stardew Valley supports controllers on PC." },
      { q: "Is GOG supported?", a: "Yes. Stardew Valley is sold on GOG as well as Steam; install the copy you own." },
    ],
    installSteps: installFrom("GOG or Steam", "Choose the store where you own the game."),
  },
  "aneurism-iv": {
    tagline: "A dying city asks you to pick a side; the other players get a vote too.",
    description: "ANEURISM IV is a multiplayer dystopia about working within, resisting, or exploiting a decaying city's systems. Other players can help your plan or make the street feel very different by the time you return.",
    developerSlug: "vellocet", developerName: "Vellocet", releaseYear: 2025, license: "Proprietary commercial game",
    genres: ["Simulation", "Adventure", "Sandbox"], platforms: ["Windows", "macOS"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("The city feels uneasy even before another player makes a choice that changes the street you were counting on."),
    thatOneThing: "The other people in the city are real players, so the fate of a district is never entirely yours to decide.",
    longDescription: `ANEURISM IV places players in a dense, decaying metropolis where work, power, and resistance are more interesting than a clean hero-villain choice. Vellocet's multiplayer game asks what you will do inside a city that already seems to be coming apart. Your actions can support its systems, undermine them, or simply help you survive another day. Other players are trying to answer the same question, sometimes in ways that collide with yours.

Its appeal lies in social friction. A familiar route through a district may feel different after the people there make new choices. Conversations, observation, and the decision to trust someone can carry as much weight as a straightforward objective. The atmosphere is deliberately uncomfortable: industrial spaces, decayed institutions, and the sense that the city has a life outside your immediate plan. It is not a tidy campaign where the next marker explains exactly what to do.

Online and LAN multiplayer are advertised by the developer's Steam listing. That matters because the city is not only a backdrop for one player's story. What you see is partly a consequence of the people sharing the session. For a party, the best first step is to agree whether you want to work together, pursue different roles, or simply explore the city and see how its systems react. PlayBound's party tools can bring players to the same game, but they cannot script an outcome or guarantee a particular social experience.

This is a more unusual recommendation than a familiar co-op shooter. It asks for patience with ambiguity and for a willingness to inhabit a strange place before you understand its rules. Controller support is not advertised as native on PC, so keyboard and mouse are the honest default. Players wanting a linear story with clear success screens may find its openness frustrating.

This also means the people around you are part of the game, not just background noise in a lobby. A player who seems helpful may have reasons you do not understand, and a district that felt stable can become tense when a group changes its priorities. That uncertainty asks for a different kind of attention than a combat scoreboard. Listen, watch, and give the city time to show how its rules and its residents fit together.

We include it because multiplayer can be about shared places and conflicting motives, not only shared damage numbers. ANEURISM IV has room for the kind of evening a group will talk about afterward because nobody could have predicted exactly what the others would do.`,
    whyWePickedIt: "We picked ANEURISM IV because it tests a rarer kind of multiplayer value: a city shaped by the people inside it. Its atmosphere and social choices are compelling enough to make a session feel distinct, even when the group does not follow a neat mission script.",
    bestFor: ["Players who like social, systemic multiplayer worlds", "Groups willing to explore without a strict objective list"],
    notFor: ["Players seeking a conventional mission-based co-op game", "Anyone who needs native PC controller support"],
    comparableTo: ["Space Station 14", "Pathologic 2"],
    faq: [
      { q: "Is ANEURISM IV multiplayer?", a: "Yes. The Steam listing advertises online and LAN multiplayer." },
      { q: "Is there native controller support?", a: "No native controller category is advertised for the PC version." },
      { q: "Does each player need a copy?", a: "Yes. Each player should own and install the game." },
      { q: "Is this a linear co-op campaign?", a: "No. It is a shared city with systemic and social play rather than a fixed co-op campaign." },
    ],
    installSteps: installFrom("Steam", "Every player needs their own copy."),
  },
  "risk-of-rain-2": {
    tagline: "A small landing party becomes an absurd storm of items, monsters, and bad ideas.",
    description: "Hopoo Games' 3D action roguelike throws survivors into hostile stages where every item can bend a build in a new direction. Fight, collect, activate the teleporter, and decide how greedy the team can afford to be.",
    developerSlug: "hopoo-games", developerName: "Hopoo Games", releaseYear: 2020, license: "Proprietary commercial game",
    genres: ["Action", "Shooter", "Roguelike"], platforms: ["Windows"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("A cautious first stage grows into a screen full of effects, airborne monsters, and friends shouting for the teleporter."),
    thatOneThing: "Items stack into wildly different builds, so the same survivor can become a different kind of disaster every run.",
    longDescription: `Risk of Rain 2 takes the escalating danger of the original Risk of Rain and turns it into a fully three-dimensional action roguelike. Hopoo Games drops a survivor onto an alien world with a small kit and a simple goal: find the teleporter, survive its event, and move on. The catch is that time matters. Stay on a stage to collect more gear and the difficulty keeps climbing while you shop.

Each survivor has a distinct movement and combat rhythm. Some want to fight close, others work best at range, and all of them feel different once items begin to stack. A single pickup can add a useful effect; twenty pickups can turn an ordinary attack into a chain reaction. The pleasure of a run is partly mechanical and partly experimental. You see an unfamiliar item, take it, and discover whether it rescues your plan or makes the screen even harder to read.

Co-op gives those decisions a social edge. Teammates can help clear a teleporter event, share a little breathing room, and disagree about when to leave. A good group learns to call out valuable items and pay attention to who needs a particular effect. That generosity does not make the game easy. Enemies scale, bosses can arrive at inconvenient moments, and a promising run can end quickly when everyone loses track of the same threat.

The base game stands on its own. Alloyed Collective is an optional DLC edition, not the definition of Risk of Rain 2 and not something every player must buy before they can play the base game. Steam lists full controller support on PC. Online co-op is native, although a group should check version and content compatibility before joining a modded session. Players who dislike repeated runs or visual clutter should know that both are central to the experience.

Movement is as important as damage. A survivor who stands still to admire an item pickup may discover how quickly the world has moved on. Learning when to sprint, dodge, or use a character's escape tool is part of surviving the later stages. The shifting balance between staying for another chest and leaving before the difficulty rises too far gives a team its own running argument. It is a very good argument to have when everybody still has a chance to make it out.

We keep Risk of Rain 2 here because few multiplayer games produce such different nights from such a compact premise. A party can start with a clear plan and end with a build nobody would have designed on purpose.`,
    whyWePickedIt: "We picked Risk of Rain 2 because its item combinations and character kits make repeated co-op sessions feel genuinely different. The base game is substantial without optional DLC, and its best moments are the decisions a group makes together under a rapidly rising clock.",
    bestFor: ["Friends who like fast co-op runs and build experiments", "Players comfortable learning by failing and trying again"],
    notFor: ["Players who want a persistent campaign with permanent gear", "Anyone sensitive to very busy combat effects"],
    comparableTo: ["Risk of Rain Returns", "Gunfire Reborn"],
    faq: [
      { q: "Is Alloyed Collective required?", a: "No. It is optional DLC; the base Risk of Rain 2 game stands on its own." },
      { q: "Does the PC game support controllers?", a: "Yes. Steam lists full controller support." },
      { q: "Can I play alone?", a: "Yes. Single-player and online co-op are both supported." },
      { q: "Do mods need to match in co-op?", a: "Modded groups should align their game versions and required mod sets before joining." },
    ],
    installSteps: installFrom("Steam", "Choose the base game; Alloyed Collective is optional DLC."),
  },
  starbound: {
    tagline: "Fix the ship, beam down, and come back with a story that was not on the mission list.",
    description: "Chucklefish's spacefaring sandbox sends you between planets to explore, build, craft, and fight. A damaged ship is only the beginning; the fun is finding what each new world does to your plans.",
    developerSlug: "chucklefish", developerName: "Chucklefish", releaseYear: 2016, license: "Proprietary commercial game",
    website: "https://playstarbound.com/",
    genres: ["Sandbox", "Adventure", "Survival"], platforms: ["Windows", "macOS", "Linux"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("A routine resource trip becomes a strange village, a new weapon, and another planet on the map."),
    thatOneThing: "Your spaceship turns an enormous collection of planets into one shared adventure with a home you can keep rebuilding.",
    longDescription: `Starbound begins after you leave home and find yourself aboard a damaged ship. Chucklefish uses that ship as the anchor for a sprawling two-dimensional sandbox: repair what you can, beam down to a planet, collect supplies, and find a reason to travel farther. Each world can have different terrain, creatures, settlements, and materials. The structure gives exploration a practical purpose without reducing it to a checklist.

There is a story path, but much of the game's identity lies between its missions. You can build a base, craft gear, investigate an unfamiliar settlement, or keep moving until a planet's horizon offers something worth bringing home. The pixel art is dense with small details, and the change from one biome to another helps the galaxy feel larger than a simple sequence of levels. Combat can be rougher than the building tools; preparation and equipment matter when you head into a dangerous place.

Friends can join a shared journey through online multiplayer. One player might work on a colony while another gathers fuel or explores a dungeon. Dedicated servers can keep a world available, though a server still needs matching clients and compatible mods. Starbound has a substantial workshop and community mod scene, which can deepen the game considerably but also makes version discipline important. A heavily modded group should decide what belongs in the shared universe before anyone presses Join.

The sandbox's freedom is also its limitation. Players who want a tightly paced adventure may feel pulled between story missions and endless side projects. Inventory management, crafting dependencies, and occasional backtracking are part of the trip. The PC release does not advertise native controller support, so keyboard and mouse are the safe expectation. Starbound is a paid game, available on GOG and Steam; each player needs their own copy.

Colonies and construction give that travel a sense of return. Finding a remarkable planet is one pleasure; leaving a settlement there and coming back later is another. A group may remember a place because of its resources, an odd village, or a house built during a long night of gathering materials. Those personal landmarks make the procedural galaxy easier to care about. They also make server backups and a stable mod set worth thinking about before the next big expedition.

We picked it because the premise leaves room for a group to make the universe theirs. A shared ship, a surprising planet, and a base slowly built from scavenged pieces can keep friends playing long after the formal objective is done.`,
    whyWePickedIt: "We picked Starbound because its planets and building systems turn multiplayer into collaborative exploration. It offers a big canvas for friends and a deep mod community, while its paid base game still gives a group plenty to do without any expansion purchase.",
    bestFor: ["Friends who want a shared exploration and building sandbox", "Players who enjoy large mod ecosystems"],
    notFor: ["Players who want a tightly directed story at every step", "Controller-first players expecting native PC gamepad support"],
    comparableTo: ["Terraria", "Aground"],
    faq: [
      { q: "Can Starbound run on a dedicated server?", a: "Yes, but the server needs the game files and clients need compatible versions and mods." },
      { q: "Is there native controller support?", a: "The PC store listing does not advertise native controller support." },
      { q: "Can I play without friends?", a: "Yes. The story and sandbox can be played solo." },
      { q: "Where can I buy it?", a: "Starbound is sold on GOG and Steam; use the copy you own." },
    ],
    installSteps: installFrom("GOG or Steam", "PlayBound can locate an installed copy afterward."),
  },
  terraria: {
    tagline: "Dig a little deeper and your quiet house becomes the staging ground for a boss fight.",
    description: "Re-Logic's two-dimensional adventure makes a world out of mining, building, discovery, and increasingly ambitious fights. Start with a pickaxe; end up wondering how much arena a single boss really needs.",
    developerSlug: "re-logic", developerName: "Re-Logic", releaseYear: 2011, license: "Proprietary commercial game",
    website: "https://terraria.org/",
    genres: ["Sandbox", "Adventure", "Action"], platforms: ["Windows", "macOS", "Linux"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("One cave opens into another, the bag fills with discoveries, and suddenly the surface feels very far away."),
    thatOneThing: "The same world can be a building project, an exploration map, and a boss-fight arena, depending on who logs in tonight.",
    longDescription: `Terraria starts small. You have a few tools, a patch of ground, and night approaching faster than the first shelter comes together. Re-Logic gradually turns that modest survival scene into an enormous two-dimensional adventure. Digging reveals materials and structures; materials become equipment; equipment makes a new region or boss possible. Each improvement changes what you are brave enough to attempt next.

Exploration does not follow a single corridor. A cave may lead to a chest, a trap, an underground biome, or a problem you cannot yet solve. Above ground, you build homes for NPCs, arrange crafting stations, and decide how much of the world should become your own project. Boss encounters punctuate that freedom. Preparing an arena, gathering potions, and coordinating weapons can matter as much as the fight itself. The game can reward a clever build or expose the one gap you forgot to cover.

Multiplayer makes all three rhythms coexist. One friend can mine, another can build, and a third can insist tonight is finally the night to summon that boss. Host-and-play and dedicated servers both exist; a server owner chooses its player limit. Friends joining a modded world need compatible versions and content. Terraria also has native controller support, which makes it one of the more approachable PC sandboxes for a group using different input preferences.

There is a lot to learn. The crafting tree is broad, the world can be punishing early, and progression sometimes depends on discovering the right item or event rather than following a quest marker. Players who want a guided campaign may need a wiki or a patient friend. That openness is also why a world can hold so many different evenings without feeling finished after the first victory.

The world also records your learning in a very visible way. The first shelter may still be standing when the group has built an elaborate network of arenas, farms, and travel routes around it. You can look back at a tunnel that once felt dangerous and see a shortcut you now cross without thinking. That physical history is why a persistent server matters. It keeps the evidence of everyone's experiments in one place, ready for the next session.

Terraria belongs on PlayBound because it gives extraordinary value to a shared world. The base game keeps expanding what players can attempt, and its community makes it easy to imagine coming back with a new goal long after the credits.`,
    whyWePickedIt: "We picked Terraria because one affordable game can support years of building, exploration, boss fights, and shared servers. It makes room for different kinds of friends in the same world and gives every return trip a reason to dig a little farther.",
    bestFor: ["Groups who like shared worlds and self-directed goals", "Players who enjoy crafting, exploration, and boss preparation"],
    notFor: ["Players who want a narrow, guided campaign", "Anyone who dislikes looking up crafting or progression hints"],
    comparableTo: ["Starbound", "Core Keeper"],
    faq: [
      { q: "Can Terraria run on a dedicated server?", a: "Yes. Dedicated and host-and-play multiplayer are both supported." },
      { q: "Does it have native controller support?", a: "Yes. Terraria's PC version supports controllers." },
      { q: "How many players can join?", a: "The server owner configures the player limit; there is no single fixed cap for every world." },
      { q: "Can GOG and Steam copies play together?", a: "Check that everyone uses compatible game versions and matching mods before joining the same server." },
    ],
    installSteps: installFrom("GOG or Steam", "Install the version matching your copy."),
  },
  "vintage-story": {
    tagline: "Survive the first night, then spend a season learning how to make a single good tool.",
    description: "Anego Studios' demanding voxel survival game makes food, weather, pottery, metalworking, and shelter feel like skills you earn. Bring friends for a long-lived world where every reliable workshop is an achievement.",
    developerSlug: "anego-studios", developerName: "Anego Studios", releaseYear: 2016, license: "Proprietary commercial game",
    website: "https://www.vintagestory.at/",
    genres: ["Survival", "Sandbox", "Simulation"], platforms: ["Windows", "macOS", "Linux"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("The first clay vessel feels like a breakthrough because almost every useful thing has a process behind it."),
    thatOneThing: "Pottery, food preservation, and metalworking are hands-on processes, so a group's first proper workshop feels genuinely earned.",
    longDescription: `Vintage Story is a survival sandbox that treats the journey from wilderness to workshop as the point of the game. Anego Studios built its own voxel world and filled it with systems that ask for observation and patience. You do not simply click a recipe and receive a finished civilization. You gather, shape, fire, store, and eventually refine the materials that keep a settlement alive.

Early survival is a matter of reading the landscape. Find food and shelter, watch the weather, and learn where useful materials appear. Pottery gives storage and cooking a practical shape. Food preservation makes seasons matter. Metalworking turns resource gathering into a sequence of real steps, from finding ore to building the tools that allow more ambitious work. Each improvement feels meaningful because it changes what a group can do tomorrow.

The world also has an unsettling side. Storms, ruins, and Lovecraftian elements interrupt the idea that this is only a tranquil homestead simulator. Exploration can reveal resources and history, but preparation matters. Multiplayer lets friends divide the work: one person farms and cooks, another searches for ore, and another builds a place worth returning to. Dedicated servers can keep that world available between sessions, with owners deciding the rules and required mods.

This is not a game for anyone who wants instant access to advanced tools. The learning curve is steep, and the slower processes are intentional. There is no official native controller support claim for the base PC game. Vintage Story is also paid: its official store sells game accounts, and players need an account to download and play. The server files and client access have their own ownership requirements, so PlayBound should never imply that a free server binary makes the game free.

That attention to process makes roles emerge naturally. Someone who enjoys exploring can search for a distant source of ore while another tends food stores and a third improves the workshop. These are not classes chosen from a menu; they are skills the group develops together. A reliable supply of meals makes a long trip possible, and a well-made tool can repay the hours spent preparing it. The satisfaction comes from seeing the whole settlement grow more capable.

We include it because the depth gives a committed group something rare: a shared place whose progress is visible in every kiln, field, and carefully stocked shelf. That place is worth protecting.`,
    whyWePickedIt: "We picked Vintage Story because its detailed survival systems make cooperation meaningful. A shared world can be a genuine long-term project, and its careful approach to crafting and seasons offers a different kind of value from faster, shallower sandboxes.",
    bestFor: ["Groups that want a demanding, persistent survival world", "Players who enjoy deliberate crafting and historical processes"],
    notFor: ["Players who want fast progression and simple recipes", "Anyone expecting the game client to be free or natively controller-first"],
    comparableTo: ["Minecraft", "TerraFirmaCraft"],
    faq: [
      { q: "Is Vintage Story free?", a: "No. Each player needs a purchased game account from an official seller." },
      { q: "Can friends use a dedicated server?", a: "Yes. Dedicated multiplayer servers are supported, subject to server-file access and ownership requirements." },
      { q: "Does it support controllers natively?", a: "The base PC game does not advertise native gamepad support." },
      { q: "Is it sold on Steam?", a: "No. The official Vintage Story store and its listed partners sell game accounts." },
    ],
    installSteps: installFrom("the official Vintage Story store", "A purchased game account is required to download the client."),
    access: { priceType: "PAID", purchaseRequired: true },
  },
  "core-keeper": {
    tagline: "The cave keeps getting bigger; so does the pile of reasons to go back down.",
    description: "Pugstorm's underground sandbox mixes mining, farming, crafting, and boss fights in a world built for up to eight friends. Light a path, make a base, and find out what is making that sound beyond the wall.",
    developerSlug: "pugstorm", developerName: "Pugstorm", releaseYear: 2024, license: "Proprietary commercial game",
    genres: ["Sandbox", "Survival", "Adventure", "Action"], platforms: ["Windows", "Linux"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("A thin tunnel becomes a whole underground expedition when the next glowing chamber opens up."),
    thatOneThing: "Up to eight friends can turn the same underground world into a farm, a workshop, and a route toward the next boss.",
    longDescription: `Core Keeper wakes you in a vast underground world with a few basic tools and a great deal of dark around you. Pugstorm's top-down sandbox makes a simple loop unusually inviting: mine a passage, bring back resources, build a safer home, and push farther next time. The world expands as you gain the equipment and confidence to reach new biomes and confront the creatures waiting there.

The cave is not just a corridor between bosses. You can plant food, cook meals, organize storage, automate parts of the base, and shape the routes that connect discoveries. Light and layout matter because they make a sprawling underground map feel like a place you know. Exploration has a satisfying pace: a small improvement to a pickaxe or weapon can open up a region that felt impossible earlier. Boss fights give a group a reason to prepare together rather than simply wandering forever.

Multiplayer is one of Core Keeper's best features. Up to eight players can share a world, and a dedicated server can keep it available when the original host is offline. Different friends can take useful roles without being locked into rigid classes. Someone builds a farm, someone scouts the next biome, and someone lays down a path so the rest can find their way home. That freedom is also why a group should agree before someone moves the entire storage room.

There are limits. Much of the progression depends on resource gathering, and players who dislike repeated mining trips will feel that early. The game can become visually busy during boss fights or in a crowded base. Steam lists full controller support, which makes the PC version approachable with a pad. The game is paid and available through official storefronts; each player needs a legitimate copy for online play.

The world becomes easier to navigate as a group leaves its own marks on it. A row of torches can turn a frightening tunnel into the route everyone uses to reach a distant biome. A base that began as a few chests can become the place where friends meet to prepare for a boss. That history gives a persistent server value beyond convenience: the work of every player is still visible when the next person arrives.

We keep Core Keeper on PlayBound because it gives a group a compact, readable world that can grow into a long-running project. A new tunnel, a repaired route, or a well-stocked kitchen can be as valuable to the evening as the next boss kill.`,
    whyWePickedIt: "We picked Core Keeper because its eight-player world gives every friend a way to help. The base game makes exploration, building, and boss fights feed one another, and a persistent server lets the group's underground home keep its history between sessions.",
    bestFor: ["Small groups that want a persistent exploration and crafting world", "Players who like top-down boss fights and useful base building"],
    notFor: ["Players who dislike mining and gathering materials", "Groups expecting every session to follow a guided campaign"],
    comparableTo: ["Terraria", "Necesse"],
    faq: [
      { q: "How many players can share a world?", a: "Core Keeper supports up to eight players in online co-op." },
      { q: "Can a world stay online on a dedicated server?", a: "Yes. Core Keeper has dedicated-server support." },
      { q: "Does it work with a controller?", a: "Yes. The Steam release lists full controller support." },
      { q: "Is the game free?", a: "No. Every player needs a legitimate purchased copy." },
      { q: "Does GOG multiplayer need Galaxy?", a: "Yes. The GOG listing says GOG Galaxy is required for Core Keeper's online features." },
    ],
    installSteps: installFrom("GOG or Steam", "Choose the store where you own the game. GOG's online features require GOG Galaxy."),
  },
  rimworld: {
    tagline: "Three crash survivors, one bad harvest, and a story nobody meant to write.",
    description: "Ludeon Studios' colony sim gives you people with needs, histories, injuries, and a remarkable talent for making a sensible plan complicated. Build shelter, manage crises, and watch the colony become its own story.",
    developerSlug: "ludeon-studios", developerName: "Ludeon Studios", releaseYear: 2018, license: "Proprietary commercial game",
    genres: ["Simulation", "Strategy", "Sandbox"], platforms: ["Windows", "macOS", "Linux"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("A simple food shortage becomes a chain of human decisions that nobody in the colony handles quite as planned."),
    thatOneThing: "The colonists have traits and relationships, so the story is what happens when your tidy systems meet imperfect people.",
    longDescription: `RimWorld calls itself a story generator, which is more useful than calling it a traditional strategy game. Ludeon Studios begins with a few survivors on an unfamiliar planet and lets your colony's systems create the drama. The building tools are important, but so are the people who must live with what you build. A bedroom, a meal schedule, or a medical bed can decide what happens when the next crisis arrives.

Colonists bring skills, traits, histories, and relationships. You assign work priorities and try to keep food, shelter, health, and morale from becoming emergencies at the same time. The environment offers different problems depending on where you settle. Heat, cold, disease, animals, raids, and scarce resources can each expose a flaw in an otherwise comfortable base. The AI storyteller changes the tempo, but it is your own decisions that make a setback feel personal.

There is plenty of room for creativity. Some players design a highly efficient workshop and defensive perimeter; others build around the people and accept a more chaotic settlement. The Steam Workshop and broader mod community extend the simulation in many directions. That variety is a major part of RimWorld's long-term value, but it also means mod compatibility deserves attention before adding a large collection to a save.

Vanilla RimWorld is single-player. PlayBound's separate RimWorld Together edition is where multiplayer belongs; the base game's page should not imply native online co-op. Steam lists partial controller support on PC, so keyboard and mouse remain useful for dense management screens. The game is paid, and its expansions are optional purchases rather than prerequisites to understand the original colony sim.

The most revealing moments are often small. A skilled doctor may be unavailable when a patient needs help; a colonist's mood may change the outcome of an otherwise manageable raid; a meal stockpile can disappear at exactly the wrong time. None of these events is impressive in isolation. Together they make a settlement feel like a fragile society rather than a spreadsheet. Learning to absorb those surprises is the real skill the game asks you to develop.

We keep RimWorld here because the replay value is not a promise of endless content drops. It comes from systems that create a different problem every time you think the colony is finally stable. A single evening can produce a story worth retelling, usually because somebody had a very human reason to do the wrong thing.`,
    whyWePickedIt: "We picked RimWorld because its systems turn management into memorable stories, and its mod community gives players years of ways to reshape those stories. The base game stands on its own; we keep multiplayer clearly attached to the separate RimWorld Together edition.",
    bestFor: ["Players who enjoy deep colony management and emergent stories", "Mod-curious builders willing to tune a complicated world"],
    notFor: ["Players who require native multiplayer in the base game", "Anyone looking for a light, controller-only management game"],
    comparableTo: ["Dwarf Fortress", "Oxygen Not Included"],
    faq: [
      { q: "Does vanilla RimWorld have multiplayer?", a: "No. The base game is single-player; multiplayer requires a separate mod or edition such as RimWorld Together." },
      { q: "Do I need DLC to play?", a: "No. The base game is complete without optional expansions." },
      { q: "Is controller support complete on PC?", a: "Steam lists partial controller support; a mouse and keyboard are still useful for detailed management." },
      { q: "Can I use mods?", a: "Yes. RimWorld has a large mod ecosystem, but compatibility with your game version and save matters." },
    ],
    installSteps: installFrom("Steam or the official RimWorld store", "Install the base game before adding any separate multiplayer edition."),
  },
  unturned: {
    tagline: "A free zombie sandbox where the scariest thing near the loot might be another player.",
    description: "Smartly Dressed Games' open-world survival game lets you scavenge, craft, build, and negotiate with friends or strangers on public and private servers. The base game is free; surviving a careless supply run is not.",
    developerSlug: "smartly-dressed-games", developerName: "Smartly Dressed Games", releaseYear: 2017, license: "Proprietary free-to-play game",
    access: { priceType: "FREE", purchaseRequired: false },
    genres: ["Survival", "Shooter", "Sandbox"], platforms: ["Windows", "macOS", "Linux"], launchMethods: ["install"], browserPlayable: false,
    qualityBar: qualityBar("A quick scavenging stop can become a tense escape when the zombies are easier to predict than the people nearby." , true),
    thatOneThing: "The same map can be a cooperative survival trip or a player-driven standoff depending on who arrives first.",
    longDescription: `Unturned puts a colorful, blocky face on a survival game that can become surprisingly tense. Smartly Dressed Games gives you a world full of abandoned places, supplies, zombies, vehicles, and other players. The first minutes are about finding enough food and equipment to stay alive. After that, the real question is what kind of session you and the server's community want to create.

Scavenging has a clear rhythm. Search a settlement, watch the threat around it, bring useful materials home, and improve your gear before trying somewhere more dangerous. Crafting and base building give long-running groups a place to store progress, while vehicles make travel and resource runs more ambitious. Combat with zombies is only one source of risk. On a public PvP server, another player may be the difference between a successful trip and returning with nothing.

Server rules can change the tone substantially. Friends can create a private cooperative world, join a public survival community, or choose a mode with more direct competition. Online and LAN play are both supported, and dedicated servers let a group keep its world online. Workshop maps and mods add plenty to explore, although a modded server requires matching client content. Server owners should configure visibility and access intentionally rather than assuming every world will remain friendly by default.

The base game is free to play on Steam, with optional purchases around it. Its size and systems may be surprising to anyone expecting a tiny free download. Steam does not list full native controller support for the PC release, so keyboard and mouse are the reliable option. The look is deliberately simple, and some players will find the interface rough compared with a newer survival game.

The mod and map community adds another reason to return. A server can use a familiar survival map, experiment with a different setting, or establish rules that make cooperation more important than combat. The best choice depends on who you want to play with. A group that enjoys tense encounters may want public PvP; friends who are learning together may have a better first night behind a password. The game gives server owners room to make that decision explicit.

We keep Unturned because it offers real server-based multiplayer without a purchase gate. A small group can start a world, decide its rules, and build stories out of their own choices. That is a strong kind of free-game value.`,
    whyWePickedIt: "We picked Unturned because its free base game supports meaningful online and LAN sessions, including dedicated servers. The workshop and server settings give a group room to make the game theirs without requiring everyone to buy in first.",
    bestFor: ["Friends who want a free persistent survival server", "Players who enjoy scavenging, crafting, and community maps"],
    notFor: ["Players who need polished native controller support", "Anyone who dislikes the possibility of PvP on public servers"],
    comparableTo: ["Project Zomboid", "7 Days to Die"],
    faq: [
      { q: "Is Unturned free?", a: "Yes. The base game is free to play on Steam; optional purchases exist." },
      { q: "Can friends host a private server?", a: "Yes. Dedicated servers and LAN sessions are supported." },
      { q: "Does Unturned have native full-controller support?", a: "The PC Steam listing does not advertise full native controller support." },
      { q: "Do mods need to match the server?", a: "Players need any maps or workshop content required by the server." },
    ],
    installSteps: [{ platform: "all", text: "Add the free base game to your Steam library and install it. Return to PlayBound; use Locate if the installed executable is not found automatically." }],
  },
};

export function dedicatedDraftEditorialFor(slug: string): DraftPatch | undefined {
  return DEDICATED_DRAFT_EDITORIAL[slug];
}
