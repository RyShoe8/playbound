/**
 * Party history queries for the Connect admin dashboard.
 *
 * Retrieves past ended parties with host identity, participants,
 * individual member durations, games played, and overall party duration.
 */

import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import User from "@/lib/models/User";
import { getGame } from "@/lib/catalog";

export type PartyHistoryMember = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  isHost: boolean;
  role: string;
  joinedAt: string;
  leftAt: string | null;
  durationMs: number;
  durationFormatted: string;
};

export type PartyHistoryGame = {
  slug: string;
  title: string;
  coverUrl: string | null;
};

export type ConnectAdminPartyHistoryRow = {
  id: string;
  name: string;
  host: {
    userId: string;
    username: string;
    avatarUrl: string | null;
  };
  totalPeople: number;
  members: PartyHistoryMember[];
  gamesPlayed: PartyHistoryGame[];
  durationMs: number;
  durationFormatted: string;
  startedAt: string;
  endedAt: string;
  status: string;
};

export type ConnectAdminPartyHistorySummary = {
  totalEndedParties: number;
  avgDurationMs: number;
  avgDurationFormatted: string;
  totalUniquePlayers: number;
};

export type ConnectAdminPartyHistoryPayload = {
  parties: ConnectAdminPartyHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: ConnectAdminPartyHistorySummary;
};

export function formatDuration(ms: number): string {
  if (ms <= 0) return "< 1m";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "< 1m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export type ListPartyHistoryOptions = {
  page?: number;
  limit?: number;
  search?: string;
  gameSlug?: string;
};

export async function listPartyHistoryForConnectAdmin(
  options: ListPartyHistoryOptions = {}
): Promise<ConnectAdminPartyHistoryPayload> {
  await dbConnect();

  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
  const search = typeof options.search === "string" ? options.search.trim() : "";
  const gameSlug = typeof options.gameSlug === "string" ? options.gameSlug.trim() : "";

  // Base filter: ended parties or parties that have endedAt set
  const baseFilter: Record<string, unknown> = {
    $or: [{ status: "ended" }, { endedAt: { $ne: null } }],
  };

  const andConditions: Array<Record<string, unknown>> = [baseFilter];

  // Filter by game if provided
  if (gameSlug) {
    andConditions.push({
      $or: [{ gamesPlayed: gameSlug }, { gameSlug }],
    });
  }

  // Filter by search query if provided (matches party name or host/member username)
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedSearch, "i");

    // Search users matching username
    const matchedUsers = await User.find({ username: searchRegex })
      .select("_id")
      .limit(50)
      .lean();
    const matchedUserIds = matchedUsers.map((u) => u._id);

    const orClauses: Array<Record<string, unknown>> = [{ name: searchRegex }];
    if (matchedUserIds.length > 0) {
      orClauses.push(
        { leaderId: { $in: matchedUserIds } },
        { "members.userId": { $in: matchedUserIds } },
        { "historicalMembers.userId": { $in: matchedUserIds } }
      );
    }
    andConditions.push({ $or: orClauses });
  }

  const query = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

  const [total, docs] = await Promise.all([
    Party.countDocuments(query),
    Party.find(query)
      .sort({ endedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  if (docs.length === 0) {
    return {
      parties: [],
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit) || 1,
      summary: {
        totalEndedParties: total,
        avgDurationMs: 0,
        avgDurationFormatted: "—",
        totalUniquePlayers: 0,
      },
    };
  }

  // Collect all user IDs and game slugs across all returned documents
  const allUserIds = new Set<string>();
  const allGameSlugs = new Set<string>();

  for (const doc of docs) {
    if (doc.leaderId) allUserIds.add(String(doc.leaderId));

    const historical = (doc.historicalMembers as Array<{ userId: unknown }>) || [];
    for (const hm of historical) {
      if (hm.userId) allUserIds.add(String(hm.userId));
    }

    const members = (doc.members as Array<{ userId: unknown }>) || [];
    for (const m of members) {
      if (m.userId) allUserIds.add(String(m.userId));
    }

    const gamesPlayed = (doc.gamesPlayed as string[]) || [];
    for (const g of gamesPlayed) {
      if (g) allGameSlugs.add(g);
    }
    if (doc.gameSlug) allGameSlugs.add(String(doc.gameSlug));
  }

  const userObjectIds = [...allUserIds].filter((id) => /^[a-f0-9]{24}$/i.test(id));

  // Batch query users and catalog games
  const [users, gamesData] = await Promise.all([
    User.find({ _id: { $in: userObjectIds } })
      .select("username avatarUrl")
      .lean(),
    Promise.all(
      [...allGameSlugs].map(async (slug) => {
        try {
          const game = await getGame(slug, { includeTesting: true });
          return [
            slug,
            {
              slug,
              title: game?.title || slug,
              coverUrl: game?.coverImage || null,
            },
          ] as const;
        } catch {
          return [slug, { slug, title: slug, coverUrl: null }] as const;
        }
      })
    ),
  ]);

  const userById = new Map(
    users.map((u) => [
      String(u._id),
      {
        username: String(u.username || "Player"),
        avatarUrl: u.avatarUrl ? String(u.avatarUrl) : null,
      },
    ])
  );

  const gameBySlug = new Map(gamesData);

  const parties: ConnectAdminPartyHistoryRow[] = [];
  let totalDurationMs = 0;
  const globalUniqueUsers = new Set<string>();

  for (const doc of docs) {
    const id = String(doc._id);
    const leaderIdStr = String(doc.leaderId || "");
    const hostUser = userById.get(leaderIdStr) || {
      username: "Host",
      avatarUrl: null,
    };

    // Calculate party duration
    const startedAtTime = new Date(doc.createdAt || Date.now()).getTime();
    const endedAtTime = doc.endedAt
      ? new Date(doc.endedAt).getTime()
      : doc.lastActivity
        ? new Date(doc.lastActivity).getTime()
        : doc.updatedAt
          ? new Date(doc.updatedAt).getTime()
          : startedAtTime;

    const partyDurationMs = Math.max(0, endedAtTime - startedAtTime);
    totalDurationMs += partyDurationMs;

    // Resolve participants and their durations
    const participantMap = new Map<string, PartyHistoryMember>();

    // 1. Process historical members if recorded
    const rawHistorical = (doc.historicalMembers as Array<{
      userId: unknown;
      role?: string;
      joinedAt?: Date | string;
      leftAt?: Date | string | null;
    }>) || [];

    for (const hm of rawHistorical) {
      const uid = String(hm.userId || "");
      if (!uid) continue;
      globalUniqueUsers.add(uid);

      const uInfo = userById.get(uid) || {
        username: uid === leaderIdStr ? hostUser.username : "Player",
        avatarUrl: null,
      };

      const joinTime = hm.joinedAt ? new Date(hm.joinedAt).getTime() : startedAtTime;
      const leaveTime = hm.leftAt ? new Date(hm.leftAt).getTime() : endedAtTime;
      const stintDurationMs = Math.max(0, Math.min(leaveTime, endedAtTime) - joinTime);

      const existing = participantMap.get(uid);
      if (existing) {
        // Accumulate duration if user joined/left multiple times
        existing.durationMs += stintDurationMs;
        existing.durationFormatted = formatDuration(existing.durationMs);
        if (hm.leftAt == null) existing.leftAt = null;
      } else {
        participantMap.set(uid, {
          userId: uid,
          username: uInfo.username,
          avatarUrl: uInfo.avatarUrl,
          isHost: uid === leaderIdStr,
          role: String(hm.role || (uid === leaderIdStr ? "leader" : "member")),
          joinedAt: new Date(joinTime).toISOString(),
          leftAt: hm.leftAt ? new Date(leaveTime).toISOString() : null,
          durationMs: stintDurationMs,
          durationFormatted: formatDuration(stintDurationMs),
        });
      }
    }

    // 2. Process current members (fallback for legacy records or ongoing snapshot)
    const rawMembers = (doc.members as Array<{
      userId: unknown;
      role?: string;
      joinedAt?: Date | string;
    }>) || [];

    for (const m of rawMembers) {
      const uid = String(m.userId || "");
      if (!uid) continue;
      globalUniqueUsers.add(uid);

      if (!participantMap.has(uid)) {
        const uInfo = userById.get(uid) || {
          username: uid === leaderIdStr ? hostUser.username : "Player",
          avatarUrl: null,
        };
        const joinTime = m.joinedAt ? new Date(m.joinedAt).getTime() : startedAtTime;
        const durMs = Math.max(0, endedAtTime - joinTime);
        participantMap.set(uid, {
          userId: uid,
          username: uInfo.username,
          avatarUrl: uInfo.avatarUrl,
          isHost: uid === leaderIdStr,
          role: String(m.role || (uid === leaderIdStr ? "leader" : "member")),
          joinedAt: new Date(joinTime).toISOString(),
          leftAt: doc.endedAt ? new Date(endedAtTime).toISOString() : null,
          durationMs: durMs,
          durationFormatted: formatDuration(durMs),
        });
      }
    }

    // 3. Ensure host is always in participants list
    if (leaderIdStr && !participantMap.has(leaderIdStr)) {
      globalUniqueUsers.add(leaderIdStr);
      participantMap.set(leaderIdStr, {
        userId: leaderIdStr,
        username: hostUser.username,
        avatarUrl: hostUser.avatarUrl,
        isHost: true,
        role: "leader",
        joinedAt: new Date(startedAtTime).toISOString(),
        leftAt: new Date(endedAtTime).toISOString(),
        durationMs: partyDurationMs,
        durationFormatted: formatDuration(partyDurationMs),
      });
    }

    // Sort participants: Host first, then longest duration
    const memberList = Array.from(participantMap.values()).sort((a, b) => {
      if (a.isHost) return -1;
      if (b.isHost) return 1;
      return b.durationMs - a.durationMs;
    });

    // Resolve games played
    const gameSlugsList = Array.from(
      new Set(
        [
          ...((doc.gamesPlayed as string[]) || []),
          String(doc.gameSlug || ""),
        ].filter(Boolean)
      )
    );

    const resolvedGames: PartyHistoryGame[] = gameSlugsList.map(
      (slug) =>
        gameBySlug.get(slug) || {
          slug,
          title: slug,
          coverUrl: null,
        }
    );

    parties.push({
      id,
      name: String(doc.name || "").trim() || `${hostUser.username}'s party`,
      host: {
        userId: leaderIdStr,
        username: hostUser.username,
        avatarUrl: hostUser.avatarUrl,
      },
      totalPeople: memberList.length,
      members: memberList,
      gamesPlayed: resolvedGames,
      durationMs: partyDurationMs,
      durationFormatted: formatDuration(partyDurationMs),
      startedAt: new Date(startedAtTime).toISOString(),
      endedAt: new Date(endedAtTime).toISOString(),
      status: String(doc.status || "ended"),
    });
  }

  const avgDurationMs = parties.length > 0 ? Math.round(totalDurationMs / parties.length) : 0;

  return {
    parties,
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit) || 1,
    summary: {
      totalEndedParties: total,
      avgDurationMs,
      avgDurationFormatted: formatDuration(avgDurationMs),
      totalUniquePlayers: globalUniqueUsers.size,
    },
  };
}
