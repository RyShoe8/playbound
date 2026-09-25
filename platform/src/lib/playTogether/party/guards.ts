/**
 * The steps every party action starts and ends with.
 *
 * Each leader action used to open with its own copy of: connect, load, 404,
 * leader check, ended check — nine copies in settings.ts alone, which is how
 * checks drift apart between actions. Actions now load through one of these
 * and keep only their own rules. Messages and status codes are the callers'
 * existing ones; the leader message stays per action because it is what the
 * person sees ("Only the leader can rename the party").
 */
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import type { PartyPayload } from "@/lib/playTogether/types";
import { partyPayloadForDoc } from "./serialize";

export type PartyFailure = { error: string; status: 400 | 403 | 404 };
/** What Party.findById resolves to. The Party model is untyped, so this is `any` — the same type every action already had for `doc`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PartyLoadedDoc = any;

/**
 * Load a party the leader is about to change: 404 if missing, 403 with
 * `notLeaderMessage` if `leaderId` is not the leader, 400 if it has ended —
 * in that order, as every leader action checked them.
 */
export async function loadPartyAsLeader(
  partyId: string,
  leaderId: string,
  notLeaderMessage: string
): Promise<{ doc: PartyLoadedDoc } | PartyFailure> {
  await dbConnect();
  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) return { error: notLeaderMessage, status: 403 };
  if (doc.status === "ended") return { error: "Party has ended", status: 400 };
  return { doc };
}

/** The standard success reply: the party as saved, serialized for clients. */
export async function partyReply(
  doc: PartyLoadedDoc
): Promise<{ party: PartyPayload; status: 200 }> {
  return { party: await partyPayloadForDoc(doc.toObject()), status: 200 };
}
