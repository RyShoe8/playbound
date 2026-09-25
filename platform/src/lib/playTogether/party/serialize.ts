/** Turning Party documents into the payloads clients read. */
import { createHash } from "crypto";
import { supportsSavedWorlds } from "@/lib/savedWorlds";
import { getGame } from "@/lib/catalog";
import { requiredPlatformsFor } from "@/lib/playTogether/partyPlatforms";
import { PARTY_MAX_SIZE, type PartyStatus, type PartyVisibility, type PartyPayload, type PartyMemberPayload, type ConfigSyncResult, normalizePartyName } from "@/lib/playTogether/types";
import { hostedPayloadFromDoc, hostedPayloadForPublicServer } from "@/lib/gameHost/provision";
import { lanPayloadFromDoc } from "@/lib/virtualLan/provision";
import { serverControlAvailability } from "@/lib/serverControl/partyServer";
import { couchOnlyGameSlugs, couchPayloadFromDoc, hostModeOptions, publicLobbyPortFor, resolvedHostMode, type PartyHostMode } from "@/lib/multiplayer/hostModes";
import { computePartyActions } from "@/lib/playTogether/partyActions";
import { computePartyReadiness } from "@/lib/playTogether/partyReadiness";
import { getPartySlotContext } from "@/lib/entitlements/pool";
import { describeCapacity } from "@/lib/entitlements/slots";
import { ConfigSyncOutcome, checkConfigSync } from "./configSync";
import { serializePublicServer } from "./connect";
import { PartyPeople, resolvePartyPeople } from "./people";
import { PublicServerFields } from "./types";

/**
 * Whether PlayBound can administer this party's server, for the party panel.
 *
 * Both clients need the same answer and neither can work it out: the launcher
 * cannot import the settings profiles at all, and the web panel would have to
 * fetch a second endpoint before it knew whether to mention the in-game
 * overlay. The reason travels with it so a panel can say why there is nothing
 * rather than showing an empty space.
 */
function serverControlPayload(
  doc: Record<string, unknown>,
  hostMode: PartyHostMode | null,
  gameTitle: string | null
): PartyPayload["serverControl"] {
  const availability = serverControlAvailability({
    _id: doc._id as { toString(): string },
    gameSlug: String(doc.gameSlug || ""),
    gameTitle,
    editionSlug: (doc.editionSlug as string) || null,
    hostMode,
    hosted: (doc.hosted as { roomId?: string | null }) || null,
  } as Parameters<typeof serverControlAvailability>[0]);
  return availability.available
    ? { supported: true, phase: availability.phase, reason: null }
    : { supported: false, phase: null, reason: availability.reason };
}

/**
 * The one way a single party doc becomes a payload.
 *
 * Every mutation and read path goes through here so the shape a client gets
 * back never depends on which endpoint produced it. When one path resolved
 * member OS and another did not, `requiredPlatforms` and `members[].os`
 * flipped between populated and empty on alternating responses, and both
 * clients treat that as a real change: the launcher repainted the whole party
 * card (dropping the server list mid-scroll) and the web panel re-rendered on
 * every poll.
 */
export async function partyPayloadForDoc(
  doc: Record<string, unknown>,
  opts: { people?: PartyPeople; gameTitle?: string | null } = {}
): Promise<PartyPayload> {
  const gameSlug = String(doc.gameSlug || "");
  const members = (doc.members as unknown[]) || [];
  const [people, gameTitle, slotCtx] = await Promise.all([
    opts.people ? Promise.resolve(opts.people) : resolvePartyPeople(partyMemberIds(doc)),
    opts.gameTitle !== undefined
      ? Promise.resolve(opts.gameTitle)
      : gameSlug
        ? getGame(gameSlug, { includeTesting: true }).then((g) => g?.title || null)
        : Promise.resolve(null),
    /*
     * Capacity ships with the party rather than from a second endpoint,
     * because it changes for reasons that have nothing to do with this party —
     * someone else's party filling up shrinks it — so a client that fetched it
     * once would show a number that quietly stopped being true. The pool read
     * behind this is memoised per couple of seconds, so a polling screen costs
     * one aggregate, not one per tick.
     */
    getPartySlotContext({ leaderId: String(doc.leaderId), memberCount: members.length }),
  ]);
  return serializeParty(doc, people, gameTitle, describeCapacity(slotCtx));
}

/** Leader plus roster, deduped — the set every payload needs names and OS for. */
export function partyMemberIds(doc: Record<string, unknown>): string[] {
  const ids = [String(doc.leaderId)];
  for (const m of (doc.members as Array<{ userId: unknown }>) || []) {
    ids.push(String(m.userId));
  }
  return ids;
}

export function hashPartyPassword(password: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function serializeParty(
  doc: Record<string, unknown>,
  people: PartyPeople,
  gameTitle: string | null,
  capacity: PartyPayload["capacity"]
): PartyPayload {
  const { nameById, osById } = people;
  const members = (doc.members as Array<Record<string, unknown>>) || [];
  const leaderId = String(doc.leaderId);
  const discord = (doc.discord as Record<string, unknown>) || {};
  const hostMode = resolvedHostMode(
    String(doc.gameSlug || ""),
    doc.hostMode as PartyHostMode | null,
    doc.hosted as { roomId?: string | null } | null
  );
  const publicServer = serializePublicServer(doc.publicServer as PublicServerFields | null);

  return {
    id: String(doc._id),
    capacity,
    leaderId,
    leaderUsername: nameById.get(leaderId) || "Player",
    name: normalizePartyName(doc.name),
    members: members.map(
      (m): PartyMemberPayload => ({
        userId: String(m.userId),
        username: nameById.get(String(m.userId)) || "Player",
        role: (m.role as "leader" | "member") || "member",
        ready: Boolean(m.ready),
        joinedAt: (m.joinedAt as Date)?.toISOString() || new Date().toISOString(),
        os: osById.get(String(m.userId)) || "unknown",
      })
    ),
    /*
     * The desktop platforms every game offered to this party must support.
     * Empty when nobody's OS is known, which the clients read as "no
     * constraint" rather than "nothing qualifies".
     */
    requiredPlatforms: requiredPlatformsFor(
      members.map((m) => osById.get(String(m.userId)))
    ),
    gameSlug: String(doc.gameSlug || ""),
    gameTitle,
    editionSlug: (doc.editionSlug as string) || null,
    modSlugs: (doc.modSlugs as string[]) || [],
    versionSelectedByHost: Boolean(doc.versionSelectedByHost),
    openRaMod: (doc.openRaMod as PartyPayload["openRaMod"]) || null,
    status: (doc.status as PartyStatus) || "forming",
    visibility: (doc.visibility as PartyVisibility) || "friends",
    hasPassword: Boolean(doc.passwordHash),
    voiceEnabled: doc.voiceEnabled !== false,
    maxSize: (doc.maxSize as number) || PARTY_MAX_SIZE,
    /*
     * Resolved server-side and sent down, rather than each client working it
     * out. The launcher cannot import the adapter registry at all, and a
     * second implementation of "which modes does this game have" is a second
     * thing to drift. Null hostMode on an older party reads as the game's
     * default, same as everywhere else.
     */
    hostMode,
    hostModes: doc.gameSlug ? hostModeOptions(String(doc.gameSlug)) : [],
    savedWorldId: doc.savedWorldId ? String(doc.savedWorldId) : null,
    offersSavedWorlds: supportsSavedWorlds(String(doc.gameSlug || "")) && hostMode === "dedicated",
    /*
     * Resolved with the host mode the party is actually on, not the raw field —
     * a null hostMode means the game's default, and the controls follow that
     * same resolution or they would disagree with the panel above them.
     */
    serverControl: serverControlPayload(doc, hostMode, gameTitle),
    couchOnlyGames: couchOnlyGameSlugs(),
    publicServer: hostMode === "public" ? publicServer : null,
    /*
     * Only for a public self-hosted room. Party members reach the host over the
     * overlay and need no mapping at all; this is what the launcher would have
     * to open for someone outside the party to connect, and is null whenever
     * that does not apply.
     */
    selfHostPort:
      doc.gameSlug && hostMode === "self" && doc.visibility === "public"
        ? publicLobbyPortFor(String(doc.gameSlug))
        : null,
    selfHostReady:
      hostMode === "self" && doc.status === "playing" && Boolean(doc.selfHostReady),
    eventId: doc.eventId ? String(doc.eventId) : null,
    discord: {
      voiceChannelId: (discord.voiceChannelId as string) || null,
      textChannelId: (discord.textChannelId as string) || null,
      inviteUrl: (discord.inviteUrl as string) || null,
    },
    hosted:
      hostMode === "public"
        ? hostedPayloadForPublicServer(doc.publicServer as PublicServerFields | null)
        : hostedPayloadFromDoc(
            String(doc.gameSlug || ""),
            hostMode,
            (doc.hosted as Parameters<typeof hostedPayloadFromDoc>[2]) || null
          ),
    lan: lanPayloadFromDoc(
      String(doc.gameSlug || ""),
      hostMode,
      (doc.lan as Parameters<typeof lanPayloadFromDoc>[2]) || null
    ),
    couch: couchPayloadFromDoc(
      String(doc.gameSlug || ""),
      hostMode,
      (doc.couch as Parameters<typeof couchPayloadFromDoc>[2]) || null
    ),
    lastActivity: (doc.lastActivity as Date)?.toISOString() || new Date().toISOString(),
    createdAt: (doc.createdAt as Date)?.toISOString() || new Date().toISOString(),
  };
}

export type PublicPartyPayload = Pick<
  PartyPayload,
  | "id"
  | "leaderUsername"
  | "name"
  | "gameSlug"
  | "gameTitle"
  | "status"
  | "visibility"
  | "maxSize"
  | "hasPassword"
  | "hostMode"
  | "lastActivity"
  | "createdAt"
> & { memberCount: number };

/**
 * Anonymous discovery deliberately receives no capabilities or connection
 * material. Room addresses, Discord invites, roster identities/platforms,
 * config sync, and Couch/LAN state belong only to party members.
 */
export function toPublicPartyPayload(party: PartyPayload): PublicPartyPayload {
  return {
    id: party.id,
    leaderUsername: party.leaderUsername,
    name: party.name,
    gameSlug: party.gameSlug,
    gameTitle: party.gameTitle,
    status: party.status,
    visibility: party.visibility,
    maxSize: party.maxSize,
    memberCount: party.members.length,
    hasPassword: party.hasPassword,
    hostMode: party.hostMode,
    lastActivity: party.lastActivity,
    createdAt: party.createdAt,
  };
}

export async function attachConfigSync(
  party: PartyPayload,
  viewerUserId?: string,
  /*
   * `doc` is the party row the caller already read: config-sync needs the same
   * row the payload came from, and on the polling path that read has just
   * happened, so handing it over saves a findById per poll per viewer.
   *
   * `fresh` is for callers that just changed one of the fields config-sync
   * reports on. Serving them the cached value would answer with the state from
   * before their own write.
   */
  opts: { doc?: Record<string, unknown>; fresh?: boolean } = {}
): Promise<PartyPayload> {
  if (!party.gameSlug || party.status === "ended") {
    return applyConfigSync(party, null, viewerUserId);
  }
  return applyConfigSync(party, await safeConfigSync(party.id, opts), viewerUserId);
}

/**
 * Config-sync read that never fails the payload it belongs to.
 *
 * Split from `attachConfigSync` so a caller that already knows it wants sync
 * can start this read alongside the other ones instead of after them — on the
 * polling path it used to run strictly after the member lookup, which made one
 * poll two serial round trips for data with no dependency between them.
 */
export async function safeConfigSync(
  partyId: string,
  opts: { doc?: Record<string, unknown>; fresh?: boolean } = {}
): Promise<ConfigSyncOutcome | null> {
  try {
    return await checkConfigSync(partyId, opts);
  } catch (err) {
    /*
     * Logged, not recorded.
     *
     * This catch fires on a failed database read, and the panel polls it every
     * second. Writing an event here meant a struggling cluster generated a
     * write per poll per viewer describing the fact that it was struggling —
     * load caused by the reporting of load. trackPartyFailure now filters
     * infrastructure errors for exactly this reason; keeping the call would
     * still be misleading about where the failure gets seen.
     */
    console.warn("[party:sync] config-sync failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * The action bar for one viewer.
 *
 * Viewer-dependent — whether you are the leader, whether you have readied —
 * so it is attached here beside selfPlaying rather than in the shared payload
 * builder, which has no idea who is asking.
 */
function actionsFor(party: PartyPayload, viewerUserId?: string) {
  if (!viewerUserId) return null;
  return computePartyActions({
    viewerId: viewerUserId,
    leaderId: party.leaderId,
    leaderUsername: party.leaderUsername,
    status: party.status,
    gameSlug: party.gameSlug,
    hostMode: party.hostMode,
    selfHostReady: party.selfHostReady,
    members: party.members.map((m) => ({ userId: m.userId, ready: m.ready })),
    hosted: party.hosted,
    lan: party.lan,
    couch: party.couch,
    serverControl: party.serverControl,
  });
}

/** Fold a sync result (or the absence of one) into the payload. */
export function applyConfigSync(
  party: PartyPayload,
  outcome: ConfigSyncOutcome | null,
  viewerUserId?: string
): PartyPayload {
  if (!outcome || "error" in outcome) {
    return {
      ...party,
      readiness: readinessFor(party, null),
      actions: actionsFor(party, viewerUserId),
    };
  }
  const selfPlaying = viewerUserId
    ? Boolean(outcome.sync.members.find((m) => m.userId === viewerUserId)?.playing)
    : false;
  return {
    ...party,
    configSync: outcome.sync,
    selfPlaying,
    readiness: readinessFor(party, outcome.sync),
    actions: actionsFor(party, viewerUserId),
  };
}

/**
 * Both clients render this instead of deciding for themselves, which is what
 * stops the web panel and the launcher panel from disagreeing.
 */
function readinessFor(party: PartyPayload, sync: ConfigSyncResult | null) {
  return computePartyReadiness({
    gameSlug: party.gameSlug,
    status: party.status,
    members: party.members.map((m) => ({ userId: m.userId, ready: m.ready })),
    sync: sync
      ? {
          allInSync: sync.allInSync,
          members: sync.members.map((m) => ({
            userId: m.userId,
            hasGame: m.hasGame,
            hasEdition: m.hasEdition,
            missingMods: m.missingMods,
          })),
        }
      : null,
  });
}

export const OPEN_PARTY_STATUSES = ["forming", "ready", "playing"] as const;

/**
 * Many docs, two people reads and one title read per distinct game.
 *
 * Used for every multi-party list so a browse page cannot fall behind on the
 * payload shape a single party gets — the clients diff these payloads, and a
 * field that only some paths populate reads as a change on every other poll.
 */
export async function serializePartyDocs(
  docs: Array<Record<string, unknown>>
): Promise<PartyPayload[]> {
  if (docs.length === 0) return [];
  const allMemberIds: string[] = [];
  const slugs = new Set<string>();
  for (const d of docs) {
    allMemberIds.push(...partyMemberIds(d));
    if (d.gameSlug) slugs.add(String(d.gameSlug));
  }
  const [people, games] = await Promise.all([
    resolvePartyPeople(allMemberIds),
    Promise.all(
      [...slugs].map(async (s) => {
        const g = await getGame(s, { includeTesting: true });
        return [s, g?.title || null] as const;
      })
    ),
  ]);
  const titleBySlug = new Map(games);
  /*
   * Capacity per party, not one shared figure: it depends on the host's plan
   * and on how many members each already seats. The pool read underneath is
   * memoised, so this is arithmetic per row rather than a query per row.
   */
  return Promise.all(
    docs.map(async (d) => {
      const ctx = await getPartySlotContext({
        leaderId: String(d.leaderId),
        memberCount: ((d.members as unknown[]) || []).length,
      });
      return serializeParty(
        d,
        people,
        titleBySlug.get(String(d.gameSlug)) || null,
        describeCapacity(ctx)
      );
    })
  );
}
