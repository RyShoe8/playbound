import type { PlatformEvent } from "./types";

export const events: PlatformEvent[] = [
  {
    slug: "xonotic-arena-cup-12",
    title: "Xonotic Arena Cup #12",
    type: "Tournament",
    gameSlug: "xonotic",
    startsIn: "in 15 minutes",
    when: "Today · 8:00 PM",
    description:
      "Weekly 1v1 duel bracket. All skill tiers welcome — seeded groups mean you'll fight people at your level. Winner takes the golden nickname glow for a week.",
    registered: 128,
    host: "PlayBound Esports",
  },
  {
    slug: "openra-community-night",
    title: "OpenRA Community Night",
    type: "Community Night",
    gameSlug: "openra",
    startsIn: "in 2 days",
    when: "Sat, Jul 26 · 7:00 PM",
    description:
      "Casual team games all evening with rotating maps and silly rulesets. Naval-only hour at 9 PM. Beginners loudly encouraged — vets will be shuffled onto mixed teams.",
    registered: 214,
    host: "OpenRA Team",
  },
  {
    slug: "veloren-dev-livestream",
    title: "Veloren Dev Livestream: The Airships Update",
    type: "Dev Livestream",
    gameSlug: "veloren",
    startsIn: "in 3 days",
    when: "Sun, Jul 27 · 5:00 PM",
    description:
      "The Veloren team demos the upcoming airship overhaul live on a public server, then opens the floor for Q&A. Join the server and fly along.",
    registered: 542,
    host: "Veloren Team",
  },
  {
    slug: "pixel-dungeon-speedrun-gauntlet",
    title: "Shattered Pixel Dungeon Speedrun Gauntlet",
    type: "Speedrun",
    gameSlug: "shattered-pixel-dungeon",
    startsIn: "in 5 days",
    when: "Tue, Jul 29 · 6:00 PM",
    description:
      "Same seed, one hour, deepest floor wins. Live leaderboard on the event page and commentary from last season's champion.",
    registered: 89,
    host: "PlayBound Community",
  },
  {
    slug: "stk-lan-weekend",
    title: "SuperTuxKart LAN Weekend",
    type: "LAN Weekend",
    gameSlug: "supertuxkart",
    startsIn: "in 9 days",
    when: "Sat, Aug 2 – Sun, Aug 3",
    description:
      "A whole weekend of hosted kart lobbies: grand prix marathons, soccer mode brackets, and a community map premiere. Drop in any time.",
    registered: 176,
    host: "PlayBound Community",
  },
  {
    slug: "bar-summer-offensive",
    title: "Beyond All Reason: Summer Offensive",
    type: "Seasonal Challenge",
    gameSlug: "beyond-all-reason",
    startsIn: "ongoing",
    when: "All of July",
    description:
      "Season-long challenge: win ranked games to push your faction's front line on the global map. Top contributors earn the seasonal commander badge.",
    registered: 1893,
    host: "BAR Team",
  },
  {
    slug: "gridlock-royale-launch-bash",
    title: "Gridlock Royale Launch Bash",
    type: "Tournament",
    gameSlug: "gridlock-royale",
    startsIn: "in 6 days",
    when: "Wed, Jul 30 · 9:00 PM",
    description:
      "Celebrate launch month with a 60-player invitational — qualify all week in public matches. Finals streamed on the PlayBound channel.",
    registered: 347,
    host: "PlayBound Studios",
  },
];

export const eventsBySlug = new Map(events.map((e) => [e.slug, e]));
