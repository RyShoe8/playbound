import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getFriendsUserId } from "@/lib/friendsAuth";
import {
  createParty,
  listPartiesForUser,
  listDiscoverableParties,
} from "@/lib/playTogether/party";
import { PARTY_VISIBILITIES, type PartyVisibility } from "@/lib/playTogether/types";
import { detectOs } from "@/lib/presence/server";

/**
 * GET /api/parties — user's active parties + discoverable friend parties.
 *
 * `?discoverable=0` returns only the caller's own party. A member sitting in a
 * lobby polls this once a second, and the discoverable half is the expensive
 * half — a friend lookup plus a second party query plus their rosters — for a
 * list that does not need to be a second old. Clients that ask for it on a
 * slower cadence omit the key, and the response omits it too so they can tell
 * "not asked for" from "none".
 */
export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const wantDiscoverable =
      new URL(req.url).searchParams.get("discoverable") !== "0";
    const [myParties, discoverable] = await Promise.all([
      listPartiesForUser(userId),
      wantDiscoverable ? listDiscoverableParties(userId) : Promise.resolve(null),
    ]);
    if (!wantDiscoverable) return NextResponse.json({ myParties });
    return NextResponse.json({ myParties, discoverable });
  } catch (err) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("GET /api/parties failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** POST /api/parties — create a new party. */
export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, gameSlug, editionSlug, modSlugs, visibility, maxSize, eventId, password, wantVoice, hostMode } =
      body;

    if (gameSlug != null && typeof gameSlug !== "string") {
      return NextResponse.json({ error: "Invalid gameSlug" }, { status: 400 });
    }
    if (
      visibility &&
      !(PARTY_VISIBILITIES as readonly string[]).includes(visibility)
    ) {
      return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
    }

    const result = await createParty({
      userId,
      name: typeof name === "string" ? name : null,
      gameSlug: gameSlug || null,
      editionSlug: editionSlug || null,
      modSlugs: Array.isArray(modSlugs) ? modSlugs : [],
      visibility: (visibility as PartyVisibility) || "friends",
      maxSize: typeof maxSize === "number" ? maxSize : undefined,
      eventId: eventId || null,
      password: typeof password === "string" ? password : null,
      wantVoice: wantVoice !== false,
      // createParty validates this against the game and falls back to its
      // default, so an unknown value here is safe rather than rejected.
      hostMode: typeof hostMode === "string" ? hostMode : null,
      /*
       * This request is the only point in a party's life where a User-Agent
       * exists — every later provisioning step runs server-side on the party's
       * behalf. Reusing presence's detector so "what OS is this" has one
       * answer, including the launcher's own UA form.
       */
      leaderOs: detectOs(req.headers.get("user-agent")),
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      {
        party: result.party,
        needsDiscordLink: result.needsDiscordLink,
        inviteUrl: result.inviteUrl,
        moved: result.moved,
        existing: result.existing ?? false,
      },
      { status: result.status }
    );
  } catch (err) {
    console.error("POST /api/parties failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
