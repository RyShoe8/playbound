import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { claimRoomTes3mpAdmin, listRoomTes3mpAccounts } from "@/lib/gameHost/client";
import { resolvedHostMode } from "@/lib/multiplayer/hostModes";

type RouteContext = { params: Promise<{ id: string }> };

function isMorrowindParty(doc: { gameSlug?: string | null; editionSlug?: string | null }) {
  return String(doc.gameSlug || "") === "morrowind";
}

/** GET — accounts that have logged into this party's TES3MP room. */
export async function GET(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    await dbConnect();
    const party = await Party.findById(id);
    if (!party) return NextResponse.json({ error: "Party not found" }, { status: 404 });
    const member = party.members.find((m: { userId: unknown }) => String(m.userId) === userId);
    if (!member) return NextResponse.json({ error: "Not in this party" }, { status: 403 });
    if (!isMorrowindParty(party)) {
      return NextResponse.json({ error: "Not a Morrowind party" }, { status: 409 });
    }

    const hostMode = resolvedHostMode(String(party.gameSlug || ""), party.hostMode, party.hosted);
    if (hostMode === "self") {
      return NextResponse.json({
        ok: true,
        hostMode: "self",
        accounts: [],
        adminAccount: party.hosted?.leaderUsername || null,
        note: "Self-hosted TES3MP claim runs on the host launcher.",
      });
    }

    const roomId = party.hosted?.roomId;
    if (!roomId || party.hosted?.status !== "ready") {
      return NextResponse.json({ error: "Hosted room is not ready" }, { status: 409 });
    }

    const listed = await listRoomTes3mpAccounts(roomId);
    if (!listed.ok) return NextResponse.json({ error: listed.error }, { status: 502 });
    return NextResponse.json({
      ok: true,
      hostMode: "dedicated",
      accounts: listed.accounts,
      adminAccount: listed.adminAccount,
      canClaim: String(party.leaderId) === userId,
    });
  } catch (err) {
    console.error("GET /api/parties/[id]/tes3mp-claim-admin failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST — party leader claims TES3MP admin for an account that already logged in.
 * No need to know the name ahead of time: log in first, then claim from Ctrl+P.
 */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { accountName?: string };
    await dbConnect();
    const party = await Party.findById(id);
    if (!party) return NextResponse.json({ error: "Party not found" }, { status: 404 });
    if (String(party.leaderId) !== String(userId)) {
      return NextResponse.json({ error: "Only the party leader can claim TES3MP admin" }, { status: 403 });
    }
    if (!isMorrowindParty(party)) {
      return NextResponse.json({ error: "Not a Morrowind party" }, { status: 409 });
    }

    const hostMode = resolvedHostMode(String(party.gameSlug || ""), party.hostMode, party.hosted);
    if (hostMode === "self") {
      return NextResponse.json(
        {
          error: "Self-hosted claim is handled by the host launcher overlay.",
          hostMode: "self",
        },
        { status: 409 }
      );
    }

    const roomId = party.hosted?.roomId;
    if (!roomId || party.hosted?.status !== "ready") {
      return NextResponse.json({ error: "Hosted room is not ready" }, { status: 409 });
    }

    const claimed = await claimRoomTes3mpAdmin(roomId, body.accountName || null);
    if (!claimed.ok) {
      return NextResponse.json(
        {
          error: claimed.error,
          accounts: claimed.accounts || [],
          adminAccount: claimed.adminAccount ?? null,
        },
        { status: 409 }
      );
    }

    party.hosted = party.hosted || {};
    party.hosted.leaderUsername = claimed.accountName;
    await party.save();

    return NextResponse.json({
      ok: true,
      accountName: claimed.accountName,
      accounts: claimed.accounts,
      adminAccount: claimed.adminAccount,
    });
  } catch (err) {
    console.error("POST /api/parties/[id]/tes3mp-claim-admin failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
