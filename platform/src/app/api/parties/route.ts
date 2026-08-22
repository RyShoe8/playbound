import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import {
  createParty,
  listPartiesForUser,
  listDiscoverableParties,
} from "@/lib/playTogether/party";
import { PARTY_VISIBILITIES, type PartyVisibility } from "@/lib/playTogether/types";

/** GET /api/parties — user's active parties + discoverable friend parties. */
export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [myParties, discoverable] = await Promise.all([
      listPartiesForUser(userId),
      listDiscoverableParties(userId),
    ]);
    return NextResponse.json({ myParties, discoverable });
  } catch (err) {
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
    const { name, gameSlug, editionSlug, modSlugs, visibility, maxSize, eventId, password, wantVoice } = body;

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
