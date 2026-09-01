/**
 * Ranks catalog games by whether you could be playing them right now.
 *
 * Deliberately not a taste recommender. Collaborative filtering wants many
 * users across many items, and with roughly ninety published games it would
 * produce unexplainable noise. What the launcher has instead is eligibility
 * nobody else does: whether a game runs on this machine, whether it is
 * installed, whether a server has people on it, how far away that server is,
 * and whether a friend is already in it.
 *
 * So every score carries the reasons that produced it. A card can say
 * "3 friends online" or "41 players · 22ms", and a ranking that looks wrong can
 * be traced to a number rather than to a latent factor.
 *
 * Pure by design — no DOM, no IPC, no clock except what is passed in — so the
 * scoring can be tested against fixtures. See homeRanking.test.mjs.
 */

/**
 * Tunable in one place so the ordering can be adjusted without touching the
 * scoring code. Raising a weight changes what the page leads with.
 */
export const WEIGHTS = {
  friendsPresent: 4.0,
  installed: 2.5,
  occupancy: 2.0,
  latency: 1.5,
  affinity: 1.0,
  recency: 0.5,
  /** Controller support counts either way; a connected pad makes it count more. */
  controllerIdle: 0.4,
  controllerConnected: 1.8,
};

/** Friends stop adding signal past this many — three in a lobby is already a reason. */
const FRIEND_SATURATION = 3;

/** Occupancy the ranking treats as ideal: busy enough to play, not full. */
const TARGET_OCCUPANCY = 0.75;
/** Below this a server reads as empty rather than quiet. */
const MIN_OCCUPANCY = 0.25;

const LATENCY_GOOD_MS = 50;
const LATENCY_USELESS_MS = 150;

/** How fast "played recently" decays, in days. */
const RECENCY_HALF_LIFE_DAYS = 14;

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * How well a server's population fits someone looking for a game.
 *
 * Peaks at 75% full rather than 100%: a server at capacity may not let you in,
 * and one at a quarter is a lobby you wait in. Mirrors the thresholds
 * pickBestServer already uses on the platform so the row and the join button
 * cannot disagree about what a good server is.
 */
export function occupancyFit(players, maxPlayers) {
  if (!Number.isFinite(players) || players <= 0) return 0;
  if (!Number.isFinite(maxPlayers) || maxPlayers <= 0) return 0.5;
  const ratio = players / maxPlayers;
  if (ratio < MIN_OCCUPANCY) return clamp01(ratio / MIN_OCCUPANCY) * 0.5;
  if (ratio <= TARGET_OCCUPANCY) return 1;
  // Past the target it falls away rather than dropping off a cliff — a full
  // server is still better than an empty one.
  return clamp01(1 - (ratio - TARGET_OCCUPANCY) / (1 - TARGET_OCCUPANCY)) * 0.6 + 0.4;
}

/** 1 below 50ms, 0 at 150ms, linear between. Unknown latency scores neutral. */
export function latencyFit(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 0.5;
  if (ms <= LATENCY_GOOD_MS) return 1;
  if (ms >= LATENCY_USELESS_MS) return 0;
  return clamp01(1 - (ms - LATENCY_GOOD_MS) / (LATENCY_USELESS_MS - LATENCY_GOOD_MS));
}

/**
 * How confident the launcher is that a controller works, and what to call it.
 *
 * The catalog's "Controller Support" feature is the publisher's claim and
 * covers most of the catalog. controllerSupportFor() knows something stronger —
 * whether a pad works untouched, whether we write the mapping, and whether that
 * mapping was checked on real hardware. Badging the difference is the one thing
 * here a storefront cannot do.
 */
export function controllerFit(support, features) {
  const kind = support?.kind;
  if (kind === "native") {
    return { score: 1, label: "Plug in and play", confidence: "native" };
  }
  if (kind === "config") {
    return support.verified
      ? { score: 0.8, label: "Controller ready — we set it up", confidence: "verified" }
      : { score: 0.6, label: "Controller setup available", confidence: "config" };
  }
  const claimed = Array.isArray(features)
    ? features.some((f) => String(f).toLowerCase().includes("controller"))
    : false;
  if (claimed) {
    return { score: 0.4, label: "Controller support", confidence: "claimed" };
  }
  return { score: 0, label: null, confidence: "unknown" };
}

/** Exponential decay on last-played, halving every fortnight. */
export function recencyScore(lastPlayed, now = Date.now()) {
  const t = Date.parse(lastPlayed || "");
  if (!Number.isFinite(t)) return 0;
  const days = (now - t) / 86_400_000;
  if (days < 0) return 1;
  return clamp01(Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS));
}

/** Lowercased genre + tag set, used for the overlap score below. */
function traitsOf(game) {
  const out = new Set();
  for (const list of [game?.genres, game?.tags]) {
    if (Array.isArray(list)) for (const v of list) if (v) out.add(String(v).toLowerCase());
  }
  return out;
}

/**
 * Overlap between a candidate and the games already played, as a fraction of
 * the candidate's own traits. A game sharing every trait with your history
 * scores 1; one sharing none scores 0.
 *
 * Deliberately asymmetric — normalising by the candidate rather than the union
 * stops a game with a long tag list being penalised for being well described.
 */
export function affinity(game, history) {
  const traits = traitsOf(game);
  if (traits.size === 0 || !Array.isArray(history) || history.length === 0) return 0;
  const seen = new Set();
  for (const played of history) for (const t of traitsOf(played)) seen.add(t);
  if (seen.size === 0) return 0;
  let shared = 0;
  for (const t of traits) if (seen.has(t)) shared += 1;
  return clamp01(shared / traits.size);
}

/**
 * Score one candidate, and record why.
 *
 * `compatible` and `tierVisible` multiply rather than add, so no amount of
 * signal elsewhere can surface a game that will not run on this machine or that
 * the viewer's discovery mode excludes. In practice both arrive already applied
 * by filterCatalogGames; they stay here as an explicit gate so this module is
 * correct on its own terms.
 */
export function scorePlayable(candidate, opts = {}) {
  const {
    game,
    installed = false,
    friendsPresent = 0,
    server = null,
    controllerSupport = null,
    lastPlayed = null,
    compatible = true,
    tierVisible = true,
  } = candidate;

  const { history = [], padConnected = false, now = Date.now() } = opts;

  if (!compatible || !tierVisible) {
    return { slug: game?.slug, score: 0, reasons: [], dominant: null, controller: controllerFit(null, null) };
  }

  const friends = clamp01(friendsPresent / FRIEND_SATURATION);
  const occ = server ? occupancyFit(server.players, server.maxPlayers) : 0;
  const lat = server ? latencyFit(server.ping) : 0;
  const aff = affinity(game, history);
  const rec = recencyScore(lastPlayed, now);
  const controller = controllerFit(controllerSupport, game?.features);
  const padWeight = padConnected ? WEIGHTS.controllerConnected : WEIGHTS.controllerIdle;

  const parts = [
    { key: "friends", value: WEIGHTS.friendsPresent * friends },
    { key: "installed", value: installed ? WEIGHTS.installed : 0 },
    { key: "occupancy", value: WEIGHTS.occupancy * occ },
    { key: "latency", value: server ? WEIGHTS.latency * lat : 0 },
    { key: "affinity", value: WEIGHTS.affinity * aff },
    { key: "recency", value: WEIGHTS.recency * rec },
    { key: "controller", value: padWeight * controller.score },
  ];

  const score = parts.reduce((sum, p) => sum + p.value, 0);
  const dominant = parts.reduce((best, p) => (p.value > best.value ? p : best), parts[0]);

  /*
   * Reasons are ordered by how much they moved the score, so a card can show
   * the top one or two and always be showing the truth about its own ranking.
   */
  const reasons = [];
  if (friendsPresent > 0) {
    reasons.push({
      key: "friends",
      weight: WEIGHTS.friendsPresent * friends,
      text: friendsPresent === 1 ? "1 friend online" : `${friendsPresent} friends online`,
    });
  }
  if (server && server.players > 0) {
    const ping = Number.isFinite(server.ping) ? ` · ${Math.round(server.ping)}ms` : "";
    reasons.push({
      key: "servers",
      weight: WEIGHTS.occupancy * occ + WEIGHTS.latency * lat,
      text: `${server.players} playing${ping}`,
    });
  }
  if (controller.label) {
    reasons.push({ key: "controller", weight: padWeight * controller.score, text: controller.label });
  }
  if (aff > 0 && opts.affinitySource) {
    reasons.push({
      key: "affinity",
      weight: WEIGHTS.affinity * aff,
      text: `Because you play ${opts.affinitySource}`,
    });
  }
  if (installed && reasons.length === 0) {
    reasons.push({ key: "installed", weight: WEIGHTS.installed, text: "In your library" });
  }
  reasons.sort((a, b) => b.weight - a.weight);

  return { slug: game?.slug, game, score, reasons, dominant: dominant.key, controller, server, installed };
}

/**
 * Score a set of candidates and return them best-first, dropping anything a
 * gate zeroed out.
 */
export function rankPlayableNow(candidates, opts = {}) {
  return candidates
    .map((c) => scorePlayable(c, opts))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || String(a.slug).localeCompare(String(b.slug)));
}
