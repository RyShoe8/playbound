import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import User from "@/lib/models/User";
import {
  fetchPartyChatMessages,
  sendPartyChatMessage,
  syncPartyVoiceForMember,
} from "@/lib/playTogether/discordPartyProvision";
import { trackPartyEvent } from "@/lib/playTogether/partyTelemetry";

type RouteContext = { params: Promise<{ id: string }> };

const CHAT_MAX = 500;

async function loadMemberParty(id: string, userId: string) {
  await dbConnect();
  const party = await Party.findById(id);
  if (!party) return { error: "Party not found", status: 404 as const };
  if (party.status === "ended") return { error: "Party has ended", status: 400 as const };
  const isMember = (party.members as Array<{ userId: unknown }>).some(
    (m) => String(m.userId) === userId
  );
  if (!isMember) return { error: "You are not in this party", status: 403 as const };
  return { party };
}

/** GET /api/parties/:id/chat — recent Discord party-channel messages. */
export async function GET(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const loaded = await loadMemberParty(id, userId);
    if ("error" in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }

    const textChannelId = loaded.party.discord?.textChannelId;
    if (!textChannelId) {
      return NextResponse.json({ messages: [], textChannelId: null });
    }

    const after = new URL(req.url).searchParams.get("after");
    const result = await fetchPartyChatMessages(textChannelId, after);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      messages: result.messages,
      textChannelId,
    });
  } catch (err) {
    console.error("GET /api/parties/[id]/chat failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** POST /api/parties/:id/chat — send a line as the PlayBound username. */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const loaded = await loadMemberParty(id, userId);
    if ("error" in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }

    const body = (await req.json().catch(() => ({}))) as { content?: string };
    const content = String(body.content || "").trim().slice(0, CHAT_MAX);
    if (!content) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    if (!loaded.party.discord?.textChannelId) {
      const isLeader = String(loaded.party.leaderId) === userId;
      if (isLeader) {
        await syncPartyVoiceForMember(loaded.party, userId);
      }
    }

    const textChannelId = loaded.party.discord?.textChannelId;
    if (!textChannelId) {
      return NextResponse.json(
        { error: "Chat isn't ready yet. Ask the host to launch voice." },
        { status: 400 }
      );
    }

    const user = await User.findById(userId).select("username image").lean();
    const result = await sendPartyChatMessage({
      textChannelId,
      username: String(user?.username || "Player"),
      avatarUrl: typeof user?.image === "string" ? user.image : null,
      content,
    });
    if ("error" in result) {
      trackPartyEvent("party_chat_failed", {
        partyId: id,
        gameSlug: String(loaded.party.gameSlug || "") || null,
        userId,
        message: result.error,
      });
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ message: result.message });
  } catch (err) {
    console.error("POST /api/parties/[id]/chat failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
