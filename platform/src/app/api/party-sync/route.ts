import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { listFriendsForUser } from "@/lib/friends/friendsList";
import { listFriendRequests } from "@/lib/friends/requests";
import { listPartiesForUser, listDiscoverableParties } from "@/lib/playTogether/party";

/**
 * GET /api/party-sync — friends, friend requests and parties in one request.
 *
 * The friends panel polls all three together, every 3s while a party is live.
 * As three separate endpoints that is three function invocations per pass,
 * each re-authenticating and re-opening the same DB connection, for data that
 * is always fetched as a set. On per-invocation billing the fixed overhead
 * dominated the actual reads.
 *
 * Composed from the same functions the individual routes call, so the shapes
 * are identical and this is a drop-in replacement:
 *   { friends, incoming, outgoing, myParties, discoverable? }
 * Those routes stay for clients that genuinely want one slice.
 *
 * `?discoverable=0` drops the discoverable-parties half, matching
 * /api/parties — it is the expensive part and does not need to be seconds
 * fresh. Omitted from the response entirely when not asked for, so a client
 * can tell "not requested" from "none".
 *
 * Sections fail independently: one failing read returns its empty value with
 * an `errors` entry naming it, rather than 500-ing the whole poll and blanking
 * a panel that was mostly fine. A failed auth is still a hard 401.
 */
export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wantDiscoverable = new URL(req.url).searchParams.get("discoverable") !== "0";
  const errors: string[] = [];

  const [friends, requests, myParties, discoverable] = await Promise.all([
    listFriendsForUser(userId).catch((err) => {
      console.error("party-sync: friends failed:", err);
      errors.push("friends");
      return [];
    }),
    listFriendRequests(userId).catch((err) => {
      console.error("party-sync: requests failed:", err);
      errors.push("requests");
      return { incoming: [], outgoing: [] };
    }),
    listPartiesForUser(userId).catch((err) => {
      console.error("party-sync: parties failed:", err);
      errors.push("parties");
      return [];
    }),
    wantDiscoverable
      ? listDiscoverableParties(userId).catch((err) => {
          console.error("party-sync: discoverable failed:", err);
          errors.push("discoverable");
          return [];
        })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    friends,
    incoming: requests.incoming,
    outgoing: requests.outgoing,
    myParties,
    ...(discoverable !== null ? { discoverable } : {}),
    ...(errors.length > 0 ? { errors } : {}),
  });
}
