/**
 * Active party rows for the Connect admin dashboard — MongoDB parties with
 * live presence, not VPS room processes alone.
 */

import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import Presence from "@/lib/models/Presence";
import User from "@/lib/models/User";
import { getGame } from "@/lib/catalog";
import { applyPresenceFreshness } from "@/lib/friends/presenceMask";
import { STALE_AFTER_MS } from "@/lib/presence/types";
import { isHostableGame } from "@/lib/gameHost/catalog";
import type { PartyStatus, PartyVisibility } from "@/lib/playTogether/types";

export type ConnectAdminPartyRow = {
  id: string;
  name: string;
  leaderUsername: string;
  gameSlug: string;
  gameTitle: string | null;
  status: PartyStatus;
  visibility: PartyVisibility;
  memberCount: number;
  readyCount: number;
  inGameCount: number;
  hostedStatus: string;
  hostedHost: string | null;
  hostedPort: number | null;
  hostedError: string | null;
  vpsRoomActive: boolean;
  vpsPort: number | null;
  lastActivity: string;
};

export type ConnectAdminPartySummary = {
  partyCount: number;
  /** Everyone listed on an active party roster. */
  playersInParties: number;
  /** Members with fresh presence showing they are in the party's game. */
  playersInGame: number;
  /** Sum of in-parties + in-game counts (requested for the dashboard header). */
  totalPlayers: number;
};

export type ConnectAdminPartiesPayload = {
  parties: ConnectAdminPartyRow[];
  summary: ConnectAdminPartySummary;
};

type VpsRoomRef = { partyId: string; port: number };

function countInGameMembers(
  memberIds: string[],
  gameSlug: string,
  presenceByUser: Map<
    string,
    { status: string; currentGameId: string | null; lastHeartbeat: Date }
  >,
  now: number
): number {
  if (!gameSlug) return 0;
  let n = 0;
  for (const uid of memberIds) {
    const row = presenceByUser.get(uid);
    if (!row) continue;
    const fresh = applyPresenceFreshness(
      {
        status: row.status,
        lastHeartbeat: row.lastHeartbeat,
        currentGameId: row.currentGameId,
      },
      now
    );
    if (fresh.status === "playing" && String(fresh.currentGameId || "") === gameSlug) {
      n += 1;
    }
  }
  return n;
}

export async function listActivePartiesForConnectAdmin(
  vpsRooms: VpsRoomRef[] = []
): Promise<ConnectAdminPartiesPayload> {
  await dbConnect();

  const docs = await Party.find({ status: { $ne: "ended" } })
    .sort({ lastActivity: -1 })
    .limit(200)
    .lean();

  if (docs.length === 0) {
    return {
      parties: [],
      summary: {
        partyCount: 0,
        playersInParties: 0,
        playersInGame: 0,
        totalPlayers: 0,
      },
    };
  }

  const vpsByParty = new Map<string, VpsRoomRef>();
  for (const room of vpsRooms) {
    if (room.partyId) vpsByParty.set(String(room.partyId), room);
  }

  const allMemberIds = new Set<string>();
  const leaderIds = new Set<string>();
  const gameSlugs = new Set<string>();
  for (const doc of docs) {
    leaderIds.add(String(doc.leaderId));
    for (const m of (doc.members as Array<{ userId: unknown }>) || []) {
      allMemberIds.add(String(m.userId));
    }
    if (doc.gameSlug) gameSlugs.add(String(doc.gameSlug));
  }

  const memberObjectIds = [...allMemberIds].filter((id) => /^[a-f0-9]{24}$/i.test(id));
  const now = Date.now();
  const heartbeatCutoff = new Date(now - STALE_AFTER_MS);

  const [users, presences, gameTitles] = await Promise.all([
    User.find({ _id: { $in: [...leaderIds] } })
      .select("username")
      .lean(),
    Presence.find({
      userId: { $in: [...allMemberIds, ...memberObjectIds] },
      lastHeartbeat: { $gte: heartbeatCutoff },
    })
      .select("userId status currentGameId lastHeartbeat")
      .lean(),
    Promise.all(
      [...gameSlugs].map(async (slug) => {
        const g = await getGame(slug, { includeTesting: true });
        return [slug, g?.title || null] as const;
      })
    ),
  ]);

  const nameById = new Map(users.map((u) => [String(u._id), String(u.username || "Player")]));
  const titleBySlug = new Map(gameTitles);
  const presenceByUser = new Map<
    string,
    { status: string; currentGameId: string | null; lastHeartbeat: Date }
  >();
  for (const p of presences) {
    const uid = String(p.userId);
    presenceByUser.set(uid, {
      status: String(p.status || "offline"),
      currentGameId: p.currentGameId ? String(p.currentGameId) : null,
      lastHeartbeat: p.lastHeartbeat as Date,
    });
  }

  const parties: ConnectAdminPartyRow[] = [];
  let playersInParties = 0;
  let playersInGame = 0;

  for (const doc of docs) {
    const id = String(doc._id);
    const members = (doc.members as Array<{ userId: unknown; ready?: boolean }>) || [];
    const memberIds = members.map((m) => String(m.userId));
    const gameSlug = String(doc.gameSlug || "");
    const hosted = (doc.hosted as Record<string, unknown>) || {};
    const vps = vpsByParty.get(id);
    const inGameCount = countInGameMembers(memberIds, gameSlug, presenceByUser, now);

    playersInParties += memberIds.length;
    playersInGame += inGameCount;

    parties.push({
      id,
      name: String(doc.name || "").trim() || "Party",
      leaderUsername: nameById.get(String(doc.leaderId)) || "Player",
      gameSlug,
      gameTitle: gameSlug ? titleBySlug.get(gameSlug) || null : null,
      status: (doc.status as PartyStatus) || "forming",
      visibility: (doc.visibility as PartyVisibility) || "friends",
      memberCount: memberIds.length,
      readyCount: members.filter((m) => m.ready).length,
      inGameCount,
      hostedStatus: isHostableGame(gameSlug)
        ? String(hosted.status || "none")
        : "n/a",
      hostedHost: hosted.host ? String(hosted.host) : null,
      hostedPort: typeof hosted.port === "number" ? hosted.port : null,
      hostedError: hosted.error ? String(hosted.error) : null,
      vpsRoomActive: Boolean(vps),
      vpsPort: vps?.port ?? null,
      lastActivity: (doc.lastActivity as Date)?.toISOString?.() || new Date().toISOString(),
    });
  }

  return {
    parties,
    summary: {
      partyCount: parties.length,
      playersInParties,
      playersInGame,
      totalPlayers: playersInParties + playersInGame,
    },
  };
}
