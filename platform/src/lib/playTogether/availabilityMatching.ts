import { createHash, randomUUID } from "node:crypto";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import Friend from "@/lib/models/Friend";
import Party from "@/lib/models/Party";
import LibraryEntry from "@/lib/models/LibraryEntry";
import PlayTogetherLease from "@/lib/models/PlayTogetherLease";
import Notification from "@/lib/models/Notification";
import { publicAvailability } from "@/lib/friends/publicAvailability";
import { scheduledLookingEnd } from "@/lib/friends/availability";
import { selectMatchGame, type MatchInstall } from "@/lib/friends/matchGame";
import { listGames } from "@/lib/catalog";
import { supportsMultiplayer } from "@/lib/multiplayer/support";
import { gameRequiresPurchase } from "@/lib/access/resolver";
import { requiredPartyEditionSlug } from "./partyEdition";
import { isBaseEditionSlug } from "./editionMatch";
import { createParty } from "./party";
import type { LtpMatchResult } from "./ltpMatch";

type MatchJournal = { key: string; userIds: string[]; expiresAt: Date };
type OpenParty = {
  _id: unknown; leaderId: unknown; status: string; visibility: string;
  gameSlug?: string; editionSlug?: string; maxSize: number;
  members: { userId: unknown }[]; availabilityMatch?: MatchJournal;
};
const sameEdition = (a?: string | null, b?: string | null) =>
  a === b || (isBaseEditionSlug(a) && isBaseEditionSlug(b));

/** Atomic delivery, independent of read status: another sweep never re-alerts either person. */
export async function notifyAvailabilityPair(partyId: string, match: MatchJournal, gameTitle: string,
  gameSlug: string, names: Map<string, string>) {
  let sent = 0;
  for (const userId of match.userIds) {
    const other = match.userIds.find(id => id !== userId)!;
    try {
      const write = await Notification.updateOne({ userId, dedupeKey: `availability:${match.key}` }, {
        $setOnInsert: {
          type: "ltp_match_found", title: `${names.get(other) || "A player"} is free to play`,
          body: `${gameTitle} matches your play preferences. Join the party to play together.`,
          href: `/party/${partyId}`,
          meta: { matchedUserId: other, matchedUsername: names.get(other), gameSlug, gameTitle,
            partyId, actions: ["join"], expiresAt: match.expiresAt.toISOString() },
        },
      }, { upsert: true });
      sent += write.upsertedCount || 0;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  return sent;
}

/** One batch for all users. Called by the existing presence cron and after availability writes. */
export async function matchAvailablePlayers(): Promise<LtpMatchResult> {
  const result: LtpMatchResult = { activeLookingUsers: 0, partiesJoined: 0, partiesCreated: 0, notificationsSent: 0 };
  await dbConnect();
  const owner = randomUUID();
  try {
    await PlayTogetherLease.findOneAndUpdate({ _id: "availability", until: { $lte: new Date() } },
      { $set: { owner, until: new Date(Date.now() + 120_000) } }, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return result;
    throw error;
  }
  try {
    const now = Date.now();
    const deadline = now + 40_000;
    const available = await publicAvailability(undefined, now, true);
    const ends = new Map([...available].flatMap(([id, row]) => {
      const end = scheduledLookingEnd(row.availability, now);
      return end ? [[id, end] as const] : [];
    }));
    if (ends.size < 2) return result;
    const users = await User.find({ _id: { $in: [...ends.keys()] }, disabled: { $ne: true },
      "preferences.appearOffline": { $ne: true }, "preferences.hideActivityFromFriends": { $ne: true },
      "preferences.allowPlayInvites": { $ne: false }, "preferences.notifyFriendActivity": { $ne: false },
    }).select("username").lean();
    const ids = users.map(user => String(user._id)).sort();
    const names = new Map(users.map(user => [String(user._id), String(user.username)]));
    result.activeLookingUsers = ids.length;
    if (ids.length < 2) return result;
    const [games, library, blocked, parties] = await Promise.all([
      listGames(),
      LibraryEntry.find({ userId: { $in: ids }, installed: true })
        .select("userId gameSlug installed platform editionSlug installedEditions").lean(),
      Friend.find({ status: "blocked", $or: [{ requesterId: { $in: ids } }, { recipientId: { $in: ids } }] })
        .select("requesterId recipientId").lean(),
      Party.find({ $or: [
        { status: { $ne: "ended" }, "members.userId": { $in: ids } },
        { "availabilityMatch.expiresAt": { $gt: new Date(now) } },
      ] }).select("leaderId members status visibility gameSlug editionSlug maxSize availabilityMatch").lean<OpenParty[]>(),
    ]);
    const catalog = games.filter(supportsMultiplayer).map(g => ({ slug: g.slug, title: g.title, requiredEditionSlug: requiredPartyEditionSlug(g.slug),
      genres: g.genres || [], free: g.launchMethods.includes("install") && !gameRequiresPurchase(g.access) }));
    const byGame = new Map(catalog.map(game => [game.slug, game]));
    const installs = new Map<string, MatchInstall[]>();
    for (const row of library) {
      const id = String(row.userId);
      installs.set(id, [...(installs.get(id) || []), row as unknown as MatchInstall]);
    }
    const blockPairs = new Set(blocked.map(row => [String(row.requesterId), String(row.recipientId)].sort().join(":")));
    const isBlocked = (a: string, b: string) => blockPairs.has([a, b].sort().join(":"));
    const active = new Map<string, OpenParty>();
    for (const party of parties.filter(p => p.status !== "ended")) {
      for (const member of party.members) active.set(String(member.userId), party);
    }
    const matched = new Set<string>();
    // Journal replay repairs a half-delivered pair after a worker/database interruption.
    for (const party of parties) {
      const match = party.availabilityMatch;
      if (!match || new Date(match.expiresAt).getTime() <= now) continue;
      if (match.userIds.length !== 2 || match.userIds.some(id => !names.has(id)) || isBlocked(...match.userIds as [string, string])) continue;
      const game = byGame.get(party.gameSlug || "");
      if (!game) continue;
      const [a, b] = match.userIds;
      const choice = selectMatchGame([game],
        { preferences: available.get(a)!.preferences, installs: installs.get(a) || [] },
        { preferences: available.get(b)!.preferences, installs: installs.get(b) || [] });
      if (!choice || !sameEdition(choice.editionSlug, party.editionSlug)) continue;
      match.userIds.forEach(id => matched.add(id));
      if (party.status === "ended" || match.userIds.some(id => active.has(id) && String(active.get(id)!._id) !== String(party._id))) continue;
      result.notificationsSent += await notifyAvailabilityPair(String(party._id), match, game.title, game.slug, names);
    }
    let comparisons = 0;
    for (let i = 0; i < ids.length && Date.now() < deadline; i++) {
      const a = ids[i];
      if (matched.has(a)) continue;
      for (const b of ids.slice(i + 1)) {
        // A large set with no overlaps must not block Node's event loop until the deadline.
        if (++comparisons % 20 === 0) await new Promise<void>(resolve => setImmediate(resolve));
        if (Date.now() >= deadline) break;
        if (matched.has(b) || isBlocked(a, b)) continue;
        const pa = active.get(a), pb = active.get(b);
        // Never move someone out of a party or interrupt an active game.
        if (pa && pb) continue;
        const existing = pa || pb;
        const host = pa ? a : pb ? b : a;
        const guest = host === a ? b : a;
        if (existing && (String(existing.leaderId) !== host || existing.visibility !== "public"
          || !["forming", "ready"].includes(existing.status)
          || existing.members.length >= existing.maxSize
          || existing.members.some(member => isBlocked(guest, String(member.userId))))) continue;
        const choice = selectMatchGame(existing ? catalog.filter(g => g.slug === existing.gameSlug) : catalog,
          { preferences: available.get(a)!.preferences, installs: installs.get(a) || [] },
          { preferences: available.get(b)!.preferences, installs: installs.get(b) || [] });
        if (!choice) continue;
        const editionSlug = choice.editionSlug || requiredPartyEditionSlug(choice.game.slug) || undefined;
        if (existing && !sameEdition(existing.editionSlug, editionSlug)) continue;
        const match: MatchJournal = {
          key: createHash("sha256").update(JSON.stringify([a, b, ends.get(a), ends.get(b), choice.game.slug, editionSlug])).digest("hex"),
          userIds: [a, b], expiresAt: new Date(Math.min(ends.get(a)!, ends.get(b)!)),
        };
        // Even an ended invitation is not silently recreated while this window is still open.
        const notified = await Notification.findOne({ userId: a, dedupeKey: `availability:${match.key}` }).select("meta").lean();
        if (notified) {
          const previousParty = parties.find(p => String(p._id) === notified.meta?.partyId && p.status !== "ended");
          if (previousParty) result.notificationsSent += await notifyAvailabilityPair(String(previousParty._id), match, choice.game.title, choice.game.slug, names);
          matched.add(a); matched.add(b); break;
        }
        let partyId: string;
        if (existing) {
          partyId = String(existing._id);
          result.partiesJoined++;
        } else {
          // Re-read the roster after the lease; a person may have joined a party during the scan.
          if (await Party.exists({ status: { $ne: "ended" }, "members.userId": { $in: [a, b] } })) continue;
          const created = await createParty({ userId: host, gameSlug: choice.game.slug, editionSlug,
            visibility: "public", name: `${choice.game.title} party`.slice(0, 60),
            availabilityMatch: match });
          if (!("party" in created) || created.existing) continue;
          partyId = created.party.id;
          result.partiesCreated++;
        }
        result.notificationsSent += await notifyAvailabilityPair(partyId, match, choice.game.title, choice.game.slug, names);
        matched.add(a); matched.add(b);
        break;
      }
    }
    return result;
  } finally {
    await PlayTogetherLease.deleteOne({ _id: "availability", owner });
  }
}
