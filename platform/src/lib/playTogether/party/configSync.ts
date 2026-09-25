/** Whether every member has the same game, edition and mods before launch. */
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import Presence from "@/lib/models/Presence";
import { getGame } from "@/lib/catalog";
import { listEditionsForGame } from "@/lib/editions";
import { type ConfigSyncMember, type ConfigSyncResult } from "@/lib/playTogether/types";
import { STALE_AFTER_MS } from "@/lib/presence/types";
import { sharedCacheGet, sharedCacheSet } from "@/lib/realtime/sharedCache";
import { modBaseGameSlugsForCatalogGame } from "@/lib/catalogGameAliases";
import { BASE_EDITION_KEY, isBaseEditionSlug, libraryHasRequiredEdition } from "@/lib/playTogether/editionMatch";
import { preferredPartyEditionSlug, requiredPartyEditionSlug } from "@/lib/playTogether/partyEdition";
import { editionsFromRow, primaryEditionFromRow } from "@/lib/library/installedEditions";
import { resolveUsernames } from "./people";

/* ─── config sync (4H, 4I) ──────────────────────────────────────────────── */

export type { ConfigSyncMember, ConfigSyncResult } from "@/lib/playTogether/types";
;

export type ConfigSyncOutcome =
  | { sync: ConfigSyncResult; status: 200 }
  | { error: string; status: 404 };

/*
 * Every party member's client polls its own party at 1-5s intervals (see
 * partyStore.ts), and each poll recomputes config-sync from scratch: a party
 * doc read plus three collection scans across every member. For a party of
 * four all polling at once that is the same read cluster four times over in
 * the same couple of seconds, for output that is identical across viewers —
 * config-sync has no per-viewer branching, only `selfPlaying` is derived
 * from it afterward, in `attachConfigSync`.
 *
 * A short TTL collapses concurrent pollers of the same party onto one read.
 * It is per-lambda-instance only — this does not dedupe across Vercel
 * instances, so it will not fully absorb a burst spread across many cold
 * function invocations. A distributed cache (Vercel KV / Upstash) would; this
 * is the zero-infra version that still helps within a warm instance and costs
 * nothing to ship. The bound is the same 2s a party's own polling interval
 * already tolerates, including immediately after a mutation — a leader who
 * just changed the edition sees the field itself update from the mutation's
 * own response; only the supplementary "is everyone ready" indicator can lag
 * by up to the TTL, self-correcting on the next poll.
 */
const CONFIG_SYNC_CACHE_TTL_MS = 2000;
/*
 * A lambda instance can stay warm across thousands of polls for parties that
 * have long since ended, so the map is swept rather than left to grow. Entries
 * are only ever valid for the TTL, which makes eviction free: anything expired
 * is dead weight, not a cache miss waiting to happen.
 */
const CONFIG_SYNC_CACHE_MAX = 500;
const configSyncCache = new Map<string, { expires: number; value: ConfigSyncOutcome }>();

/*
 * Versioned so a change to the payload shape cannot be served stale entries
 * written by the previous deploy, which share the store across rollouts.
 */
const configSyncCacheKey = (partyId: string) => `pb:cfgsync:v1:${partyId}`;

/**
 * Concurrent pollers of the same party share one in-flight computation.
 *
 * The TTL alone does not help a burst that arrives before the first read
 * finishes — four members polling within the same 50ms all miss the cache and
 * all run the read cluster. Keyed on the party, so a second caller awaits the
 * first caller's promise instead of starting its own.
 */
const configSyncInFlight = new Map<string, Promise<ConfigSyncOutcome>>();

function pruneConfigSyncCache(now: number) {
  for (const [key, entry] of configSyncCache) {
    if (entry.expires <= now) configSyncCache.delete(key);
  }
  // Still oversized after dropping the expired: evict oldest insertions.
  while (configSyncCache.size > CONFIG_SYNC_CACHE_MAX) {
    const oldest = configSyncCache.keys().next();
    if (oldest.done) break;
    configSyncCache.delete(oldest.value);
  }
}

export async function checkConfigSync(
  partyId: string,
  /**
   * `doc` is an already-read party row, when the caller has one this fresh.
   * `fresh` skips the cached value — for callers reading back their own write.
   */
  opts: { doc?: Record<string, unknown>; fresh?: boolean } = {}
): Promise<ConfigSyncOutcome> {
  const { doc: preloadedDoc, fresh } = opts;
  const now = Date.now();
  if (!fresh) {
    const cached = configSyncCache.get(partyId);
    if (cached && cached.expires > now) return cached.value;

    const pending = configSyncInFlight.get(partyId);
    if (pending) return pending;
  }

  const run = (async (): Promise<ConfigSyncOutcome> => {
    /*
     * Second tier: a cache shared across function instances.
     *
     * The Map above only helps when the next poll lands on the same warm
     * instance. Four party members polling at once usually do not — and under
     * a burst almost never do, because that is exactly when Vercel scales out
     * and every new instance starts empty. The shared entry means they share
     * one database read instead of doing four identical ones.
     *
     * Checked after the local Map (which is free and faster) and skipped
     * entirely for `fresh` reads. Every failure mode here — unconfigured,
     * unreachable, slow, malformed — returns null and falls through to the
     * read below, so this can only ever save work, never block it.
     */
    if (!fresh) {
      const shared = await sharedCacheGet<ConfigSyncOutcome>(configSyncCacheKey(partyId));
      if (shared) {
        // Populate the local tier so this instance skips the hop next time.
        configSyncCache.set(partyId, {
          expires: Date.now() + CONFIG_SYNC_CACHE_TTL_MS,
          value: shared,
        });
        return shared;
      }
    }

    const value = await checkConfigSyncUncached(partyId, preloadedDoc);
    /*
     * Only successful reads are shared. Publishing a "party not found" would
     * hand that answer to every other instance for the full TTL, and a
     * transient failure would look like a deleted party across the fleet.
     */
    if (!("error" in value)) {
      void sharedCacheSet(configSyncCacheKey(partyId), value, CONFIG_SYNC_CACHE_TTL_MS);
    }
    return value;
  })().then((value) => {
    configSyncCache.set(partyId, { expires: Date.now() + CONFIG_SYNC_CACHE_TTL_MS, value });
    if (configSyncCache.size > CONFIG_SYNC_CACHE_MAX) pruneConfigSyncCache(Date.now());
    return value;
  });
  configSyncInFlight.set(partyId, run);
  // A `fresh` run can replace a pending one; only the current entry is cleared.
  void run
    .finally(() => {
      if (configSyncInFlight.get(partyId) === run) configSyncInFlight.delete(partyId);
    })
    .catch(() => {});
  return run;
}

async function checkConfigSyncUncached(
  partyId: string,
  preloadedDoc?: Record<string, unknown>
): Promise<ConfigSyncOutcome> {
  await dbConnect();

  const doc = (preloadedDoc ??
    (await Party.findById(partyId).lean())) as Record<string, unknown> | null;
  if (!doc) return { error: "Party not found", status: 404 };

  const memberIds = (doc.members as Array<{ userId: unknown }>).map((m) =>
    String(m.userId)
  );
  const hostId = doc.leaderId ? String(doc.leaderId) : null;
  const memberObjectIds = memberIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  const memberLookup = [...new Set([...memberIds, ...memberObjectIds])];

  const [nameById, libraryEntries, modEntries, presences] = await Promise.all([
    resolveUsernames(memberIds),
    LibraryEntry.find({
      userId: { $in: memberLookup },
      gameSlug: doc.gameSlug,
    })
      .select("userId gameSlug editionSlug installedEditions installed")
      .lean(),
    LibraryModEntry.find({
      userId: { $in: memberLookup },
      baseGameSlug: { $in: modBaseGameSlugsForCatalogGame(String(doc.gameSlug || "")) },
      installed: true,
    })
      .select("userId modSlug")
      .lean(),
    Presence.find({
      userId: { $in: memberLookup },
      lastHeartbeat: { $gte: new Date(Date.now() - STALE_AFTER_MS) },
    })
      .select("userId currentGameId status")
      .lean(),
  ]);

  /*
   * userId → every installed edition slug, plus the default they launch.
   *
   * Reads `installedEditions` rather than the single `editionSlug`, because a
   * player can have several builds of one game and the row only ever recorded
   * one of them. That is what made config-sync tell people they were missing an
   * edition already on their disk.
   */
  const installedByUser = new Map<string, Set<string>>();
  const primaryByUser = new Map<string, string>();
  for (const entry of libraryEntries) {
    const uid = String(entry.userId);
    if (!installedByUser.has(uid)) installedByUser.set(uid, new Set());
    const editions = editionsFromRow(entry);
    for (const slug of editions) installedByUser.get(uid)!.add(slug);
    if (editions.size > 0) primaryByUser.set(uid, primaryEditionFromRow(entry));
  }

  // userId → set of installed mod slugs for this game.
  const modsByUser = new Map<string, Set<string>>();
  for (const entry of modEntries) {
    const uid = String(entry.userId);
    if (!modsByUser.has(uid)) modsByUser.set(uid, new Set());
    modsByUser.get(uid)!.add(String(entry.modSlug));
  }

  /*
   * Which of this game's editions are even eligible for a party. A party is
   * inherently a multiplayer context — a singleplayer-only edition can never
   * be what the group actually launches together, no matter who has it
   * installed, so it should never win as the reference build. Null means no
   * such filtering is needed (one edition, or none tagged multiplayer at all,
   * which is stale catalog data rather than something to enforce here).
   */
  const gameForEditions = await getGame(String(doc.gameSlug || ""), { includeTesting: true });
  const gameEditions = gameForEditions ? await listEditionsForGame(gameForEditions) : [];
  const requiredEdition = requiredPartyEditionSlug(String(doc.gameSlug || ""));
  const multiplayerSlugs =
    gameEditions.length > 1
      ? requiredEdition && gameEditions.some((edition) => edition.slug === requiredEdition)
        ? new Set([requiredEdition])
        : new Set(
            gameEditions.filter((e) => e.features?.includes("Multiplayer")).map((e) => e.slug)
          )
      : null;
  const qualifies = (slug: string) => !multiplayerSlugs || multiplayerSlugs.has(slug);

  /*
   * The host's actual install is the reference, not the party's declared
   * fields. Someone who picks a game and launches a heavily modded copy of it
   * is what everyone else has to match; the declared editionSlug is only a
   * label and is frequently empty.
   *
   * When the host has nothing installed — or only a singleplayer edition
   * installed for a game where multiplayer means something else — there is
   * nothing to match, so the declared (multiplayer-defaulted) field stands
   * in. Without that fallback a host who has not installed the right build
   * yet would mark every other member incompatible with an empty config, or
   * worse, point the whole party at a build with no netcode.
   */
  const hostEditionsAll = hostId ? installedByUser.get(hostId) : undefined;
  const hostEditions = hostEditionsAll
    ? new Set([...hostEditionsAll].filter(qualifies))
    : hostEditionsAll;
  const hostHasGame = Boolean(hostEditions && hostEditions.size > 0);
  const referenceSource: "host" | "party" = hostHasGame ? "host" : "party";

  const declaredEdition = preferredPartyEditionSlug(
    gameEditions,
    (doc.editionSlug as string) || null,
    String(doc.gameSlug || "")
  );
  const declaredMods = (doc.modSlugs as string[]) || [];

  /*
   * The host's *default* build, not whichever edition happens to sort first.
   * With several installed, an arbitrary pick would point the party at a build
   * the host is not actually launching — but it still has to be one of the
   * qualifying editions above, so a host with both GZDoom and Zandronum
   * installed cannot have their GZDoom pick override Zandronum for everyone.
   */
  const hostPrimary = hostId ? primaryByUser.get(hostId) : undefined;
  const hostEdition =
    hostHasGame && hostId
      ? (hostPrimary && hostEditions?.has(hostPrimary) ? hostPrimary : [...(hostEditions ?? [])][0]) ??
        BASE_EDITION_KEY
      : null;

  const editionSlug = hostHasGame
    ? isBaseEditionSlug(hostEdition)
      ? null
      : hostEdition
    : declaredEdition;

  const editionName =
    editionSlug && gameEditions.length
      ? gameEditions.find((e) => e.slug === editionSlug)?.name || editionSlug
      : null;

  const modSlugs = hostHasGame
    ? [...(hostId ? modsByUser.get(hostId) ?? new Set<string>() : new Set<string>())].sort()
    : declaredMods;

  const playingThisGame = new Set(
    presences
      .filter((row) => {
        const status = String(row.status || "");
        if (status !== "playing") return false;
        return Boolean(doc.gameSlug) && String(row.currentGameId || "") === String(doc.gameSlug || "");
      })
      .map((row) => String(row.userId))
  );
  const currentlyPlaying = new Set(
    presences
      .filter((row) => String(row.status || "") === "playing")
      .map((row) => String(row.userId))
  );

  const members: ConfigSyncMember[] = memberIds.map((uid) => {
    const editions = installedByUser.get(uid) || new Set<string>();
    const inThisGame = playingThisGame.has(uid);
    const playing = currentlyPlaying.has(uid);
    const hasGame = editions.size > 0 || inThisGame;
    const isHost = uid === hostId;
    const theirMods = modsByUser.get(uid) || new Set<string>();
    return {
      userId: uid,
      username: nameById.get(uid) || "Player",
      hasGame,
      hasEdition: Boolean(hasGame && (inThisGame || libraryHasRequiredEdition(editions, editionSlug))),
      // Only meaningful once they have the game; otherwise the game is the ask.
      missingMods: hasGame ? modSlugs.filter((slug) => !theirMods.has(slug)) : modSlugs,
      isHost,
      playing,
      installedEditionSlug: hasGame
        ? primaryByUser.get(uid) ?? BASE_EDITION_KEY
        : null,
    };
  });

  const everyoneInSync = members.every(
    (m) => m.hasGame && m.hasEdition && m.missingMods.length === 0
  );

  return {
    sync: {
      gameSlug: String(doc.gameSlug),
      editionSlug,
      editionName,
      modSlugs,
      members,
      allInSync: everyoneInSync,
      // Same value, old name — see the deprecation note on ConfigSyncResult.
      allReady: everyoneInSync,
      referenceSource,
      hostUserId: hostId,
      hostUsername: hostId ? nameById.get(hostId) || "Host" : null,
    },
    status: 200,
  };
}
