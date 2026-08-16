import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { syncPartyVoiceForMember } from "@/lib/playTogether/discordPartyProvision";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/parties/:id/discord — provision a Discord voice channel. */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    await dbConnect();
    const party = await Party.findById(id);
    if (!party) {
      return NextResponse.json({ error: "Party not found" }, { status: 404 });
    }
    if (party.status === "ended") {
      return NextResponse.json({ error: "Party has ended" }, { status: 400 });
    }
    if (String(party.leaderId) !== userId) {
      return NextResponse.json({ error: "Only the leader can provision Discord" }, { status: 403 });
    }
    const voice = await syncPartyVoiceForMember(party, userId);
    const inviteUrl = voice.inviteUrl || party.discord?.inviteUrl || null;
    if (!inviteUrl && !party.discord?.voiceChannelId) {
      return NextResponse.json(
        { error: "Discord voice provisioning unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json({
      party: {
        discord: {
          voiceChannelId: party.discord?.voiceChannelId || null,
          inviteUrl,
        },
      },
      needsDiscordLink: voice.needsDiscordLink,
      inviteUrl,
      moved: voice.moved,
    });
  } catch (err) {
    console.error("POST /api/parties/[id]/discord failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
