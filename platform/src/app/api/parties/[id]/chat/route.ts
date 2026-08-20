import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import User from "@/lib/models/User";
import PartyMessage from "@/lib/models/PartyMessage";
import {
  fetchPartyChatMessages,
  sendPartyChatMessage,
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

/** GET /api/parties/:id/chat — recent party chat messages. */
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

    const textChannelId = loaded.party.discord?.textChannelId || null;
    const after = new URL(req.url).searchParams.get("after");

    // 1. Fetch native messages from MongoDB
    const filter: Record<string, unknown> = { partyId: loaded.party._id };
    if (after) {
      const afterMsg = await PartyMessage.findById(after).select("createdAt").lean();
      if (afterMsg?.createdAt) {
        filter.createdAt = { $gt: afterMsg.createdAt };
      }
    }

    const localMessages = await PartyMessage.find(filter)
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    // 2. If Discord text channel is configured, optionally fetch and ingest remote messages
    if (textChannelId) {
      try {
        const discordRes = await fetchPartyChatMessages(textChannelId, after);
        if (!("error" in discordRes) && Array.isArray(discordRes.messages)) {
          for (const dMsg of discordRes.messages) {
            // Ingest Discord messages that are not already recorded
            const exists = await PartyMessage.exists({
              partyId: loaded.party._id,
              $or: [{ discordMessageId: dMsg.id }, { id: dMsg.id }],
            });
            if (!exists) {
              await PartyMessage.create({
                partyId: loaded.party._id,
                username: dMsg.username,
                avatarUrl: dMsg.avatarUrl,
                content: dMsg.content,
                source: "discord",
                bot: Boolean(dMsg.bot),
                discordMessageId: dMsg.id,
                createdAt: dMsg.createdAt ? new Date(dMsg.createdAt) : new Date(),
              });
            }
          }
        }
      } catch (err) {
        console.warn("Discord chat ingest warning:", err);
      }
    }

    // Return combined native messages
    const finalMessages = after
      ? localMessages
      : await PartyMessage.find({ partyId: loaded.party._id })
          .sort({ createdAt: 1 })
          .limit(100)
          .lean();

    return NextResponse.json({
      messages: finalMessages.map((m) => ({
        id: String(m._id),
        username: m.username,
        avatarUrl: m.avatarUrl || null,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        source: m.source || "playbound",
        bot: Boolean(m.bot),
      })),
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

    const user = await User.findById(userId).select("username image").lean();
    const username = String(user?.username || "Player");
    const avatarUrl = typeof user?.image === "string" ? user.image : null;

    // 1. Save message to native MongoDB store immediately
    const messageDoc = await PartyMessage.create({
      partyId: loaded.party._id,
      userId,
      username,
      avatarUrl,
      content,
      source: "playbound",
      bot: false,
      createdAt: new Date(),
    });

    const responsePayload = {
      id: String(messageDoc._id),
      username: messageDoc.username,
      avatarUrl: messageDoc.avatarUrl || null,
      content: messageDoc.content,
      createdAt: messageDoc.createdAt.toISOString(),
      source: messageDoc.source,
      bot: false,
    };

    // 2. If Discord text channel is configured, mirror to Discord asynchronously
    const textChannelId = loaded.party.discord?.textChannelId;
    if (textChannelId) {
      void sendPartyChatMessage({
        textChannelId,
        username,
        avatarUrl,
        content,
      }).catch((err) => {
        trackPartyEvent("party_chat_discord_mirror_failed", {
          partyId: id,
          gameSlug: String(loaded.party.gameSlug || "") || null,
          userId,
          message: String(err?.message || err),
        });
      });
    }

    return NextResponse.json({ message: responsePayload });
  } catch (err) {
    console.error("POST /api/parties/[id]/chat failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
