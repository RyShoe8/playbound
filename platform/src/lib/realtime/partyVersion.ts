import { sharedCacheGet, sharedCacheSet } from "@/lib/realtime/sharedCache";

/**
 * A per-party change marker, so members learn about a change within a second
 * or two without re-reading the whole party.
 *
 * Every write to a Party document stamps `party:v:<id>` in the shared cache
 * (see the hooks in models/Party.ts). Clients poll /api/parties/:id/version —
 * one cache read, no party serialization — and run their full refresh only
 * when the stamp moves. Fail open like the rest of the shared cache: with no
 * cache configured the stamp reads null and clients keep their regular poll.
 */
const TTL_MS = 12 * 60 * 60 * 1000;

const key = (partyId: string) => `party:v:${partyId}`;

export function bumpPartyVersion(partyId: unknown): void {
  const id = partyId == null ? "" : String(partyId);
  if (!/^[a-f0-9]{24}$/i.test(id)) return;
  void sharedCacheSet(key(id), Date.now(), TTL_MS);
}

export async function readPartyVersion(partyId: string): Promise<number | null> {
  if (!/^[a-f0-9]{24}$/i.test(partyId)) return null;
  const v = await sharedCacheGet<number>(key(partyId));
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
