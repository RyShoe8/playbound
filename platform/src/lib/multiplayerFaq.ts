import { supportsLauncherParty, supportsMultiplayer } from "@/lib/multiplayer/support";
import { hostModesFor } from "@/lib/multiplayer/hostModes";

/**
 * The "Does {game} have multiplayer?" answer, written from what PlayBound can
 * actually do for that game.
 *
 * It used to read "Yes, with public servers you can join for free" for every
 * game with a server browser and was absent for everything else. That named
 * neither PlayBound Connect (the party system that launches a group into the
 * same game) nor PlayBound's dedicated servers, and it said nothing true for a
 * game whose multiplayer is peer-hosted, co-op, couch-only or run entirely by
 * the publisher. Each sentence below is added only when the matching
 * capability exists, so the answer cannot promise a mode the game lacks.
 */

export type MultiplayerFaqInput = {
  slug: string;
  title: string;
  features?: string[];
  tags?: string[];
  launchMethods?: string[];
  maxPlayers?: number | null;
  qualityBar?: { genuinelyFree?: boolean } | null;
  launcherInstall?: { enabled?: boolean; kind?: string; url?: string | null; knownExePaths?: string[] } | null;
};

/**
 * Deus Ex's multiplayer is the HX co-op edition, not the base game, and the
 * host-mode table keys it that way. Without this the parent game would read as
 * having no PlayBound multiplayer at all.
 */
const FAQ_EDITION_HINT: Record<string, { edition: string; label: string }> = {
  "deus-ex-goty-edition": { edition: "playbound-hx-coop", label: "the PlayBound HX Co-op edition" },
};

const EXTRA_FEATURES: [RegExp, string][] = [
  [/^co-?op$/i, "co-op play"],
  [/^cross-?play$/i, "cross-play"],
  [/^lan support$/i, "LAN play"],
  [/^(split-screen co-?op|couch co-?op)$/i, "local split-screen or couch co-op"],
  [/^hotseat$/i, "hotseat play"],
  [/^ranked ladder$/i, "a ranked ladder"],
  [/^spectator mode$/i, "spectating"],
];

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function multiplayerFaqQuestion(title: string): string {
  return `Does ${title} have multiplayer?`;
}

export function multiplayerFaqAnswer(game: MultiplayerFaqInput): string {
  const t = game.title;
  if (!supportsMultiplayer(game)) {
    return `No. ${t} is a single-player game, so there is no multiplayer mode to join or host.`;
  }

  const hint = FAQ_EDITION_HINT[game.slug];
  const modes = hostModesFor(game.slug, hint?.edition ?? null);
  const parts: string[] = [];
  parts.push(
    game.maxPlayers && game.maxPlayers > 1
      ? `Yes. ${t} supports up to ${game.maxPlayers} players.`
      : `Yes. ${t} has multiplayer.`
  );

  const ways: string[] = [];
  if (modes.includes("public")) ways.push("join a public community server from the PlayBound server browser");
  if (modes.includes("dedicated")) ways.push("have PlayBound start a dedicated server for your group");
  if (modes.includes("self")) ways.push("host a game on your own PC");
  if (modes.includes("couch")) ways.push("play together on one PC with phones or extra gamepads as controllers");

  if (ways.length > 0) {
    parts.push(`You can ${joinList(ways)}.`);
    if (hint) parts.push(`Multiplayer comes through ${hint.label}, which every player installs.`);
    if (supportsLauncherParty(game) || hint) {
      parts.push(
        "PlayBound Connect handles the setup: start a party with your friends, pick how you want to play, and everyone launches into the same game from the PlayBound launcher" +
          (modes.includes("dedicated") ? ", with the dedicated server started for you if you choose one." : ".")
      );
    }
  } else {
    parts.push(
      `Its multiplayer runs through the game's own online service or menus, so PlayBound Connect parties and PlayBound dedicated servers are not available for it.`
    );
  }

  const featureNames = [...(game.features ?? [])];
  const extras = EXTRA_FEATURES.filter(([re]) => featureNames.some((f) => re.test(f))).map(([, label]) => label);
  if (extras.length > 0) parts.push(`It also supports ${joinList(extras)}.`);
  if (ways.length === 0 && featureNames.some((f) => /^dedicated servers$/i.test(f))) {
    parts.push("The game can run its own dedicated servers.");
  }

  if (game.qualityBar?.genuinelyFree) {
    parts.push("There is no subscription and no paid multiplayer tier.");
  }
  return parts.join(" ");
}

/**
 * Put the accurate multiplayer answer into a game's stored FAQ.
 *
 * Stored FAQs are derived once at import and never refreshed, so rewriting
 * deriveFaq alone would leave every existing game with the old answer. This
 * replaces that one entry wherever games are loaded. A game with no stored FAQ
 * is returned untouched: an empty FAQ makes the page derive a full one (which
 * uses this same answer), and adding a single entry here would suppress that.
 */
export function withAccurateMultiplayerFaq<T extends MultiplayerFaqInput & { faq?: { q: string; a: string }[] }>(game: T): T {
  if (!game.faq?.length) return game;
  const q = multiplayerFaqQuestion(game.title);
  const entry = { q, a: multiplayerFaqAnswer(game) };
  const index = game.faq.findIndex((item) => item.q.trim().toLowerCase() === q.toLowerCase());
  const faq = [...game.faq];
  if (index >= 0) faq[index] = entry;
  else faq.push(entry);
  return { ...game, faq };
}
