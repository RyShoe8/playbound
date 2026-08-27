import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { syncPartyVoiceForMember } from "@/lib/playTogether/discordPartyProvision";
import { SITE_DISCORD_INVITE } from "@/lib/site";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/parties/:id/discord — join or provision party Discord voice. */
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

    const isMember = (party.members as Array<{ userId: unknown }>).some(
      (m) => String(m.userId) === userId
    );
    if (!isMember) {
      return NextResponse.json({ error: "You are not in this party" }, { status: 403 });
    }

    const voice = await syncPartyVoiceForMember(party, userId);
    const inviteUrl = voice.inviteUrl || party.discord?.inviteUrl || null;

    if (!inviteUrl && !voice.moved) {
      return NextResponse.json(
        {
          error: "Could not create Discord voice room. The bot service may be offline.",
          needsDiscordLink: voice.needsDiscordLink,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      party: {
        discord: {
          voiceChannelId: party.discord?.voiceChannelId || null,
          textChannelId: party.discord?.textChannelId || null,
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
