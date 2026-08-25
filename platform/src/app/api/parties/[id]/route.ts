import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import {
  getParty,
  setVisibility,
  setPartyGame,
  setPartyHostMode,
  setPartyEdition,
  setPartyName,
  endParty,
} from "@/lib/playTogether/party";
import { PARTY_VISIBILITIES, type PartyVisibility } from "@/lib/playTogether/types";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/parties/:id — party details. */
export async function GET(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const result = await getParty(id, userId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ party: result.party });
  } catch (err) {
    console.error("GET /api/parties/[id] failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** PATCH /api/parties/:id — update party settings (leader only). */
export async function PATCH(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const body = await req.json();

    if (body.name !== undefined) {
      const result = await setPartyName(
        id,
        userId,
        typeof body.name === "string" ? body.name : null
      );
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ party: result.party });
    }

    if (typeof body.gameSlug === "string") {
      const result = await setPartyGame(id, userId, body.gameSlug);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ party: result.party });
    }

    if (typeof body.hostMode === "string") {
      const result = await setPartyHostMode(id, userId, body.hostMode);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ party: result.party });
    }

    if (body.editionSlug !== undefined) {
      const result = await setPartyEdition(
        id,
        userId,
        typeof body.editionSlug === "string" ? body.editionSlug : null
      );
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ party: result.party });
    }

    if (body.visibility) {
      if (!(PARTY_VISIBILITIES as readonly string[]).includes(body.visibility)) {
        return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
      }
      const result = await setVisibility(
        id,
        userId,
        body.visibility as PartyVisibility
      );
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ party: result.party });
    }

    return NextResponse.json({ error: "No valid update provided" }, { status: 400 });
  } catch (err) {
    console.error("PATCH /api/parties/[id] failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** DELETE /api/parties/:id — end the party (leader only). */
export async function DELETE(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const result = await endParty(id, userId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/parties/[id] failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
