import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import User from "@/lib/models/User";
import PartyMessage from "@/lib/models/PartyMessage";

type RouteContext = { params: Promise<{ id: string }> };

const CHAT_MAX = 500;

async function loadMemberParty(id: string, userId: string) {
  await dbConnect();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return { error: "Party not found", status: 404 as const };
  }
  const party = await Party.findById(id);
  if (!party) return { error: "Party not found", status: 404 as const };
  if (party.status === "ended") return { error: "Party has ended", status: 400 as const };
  const isMember = (party.members as Array<{ userId: unknown }>).some(
    (m) => String(m.userId) === String(userId)
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

    const after = new URL(req.url).searchParams.get("after");

    const filter: Record<string, unknown> = { partyId: loaded.party._id };
    if (after) {
      const afterMsg = await PartyMessage.findById(after).select("createdAt").lean();
      if (afterMsg?.createdAt) {
        filter.createdAt = { $gt: afterMsg.createdAt };
      }
    }

    const messages = await PartyMessage.find(filter)
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    return NextResponse.json({
      messages: messages.map((m) => ({
        id: String(m._id),
        username: m.username,
        avatarUrl: m.avatarUrl || null,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        source: m.source || "playbound",
        bot: Boolean(m.bot),
      })),
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

    let username = "Player";
    let avatarUrl: string | null = null;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId).select("username image").lean();
      if (user?.username) username = String(user.username);
      if (typeof user?.image === "string") avatarUrl = user.image;
    }

    const messageDoc = await PartyMessage.create({
      partyId: loaded.party._id,
      userId: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null,
      username,
      avatarUrl,
      content,
      source: "playbound",
      bot: false,
      createdAt: new Date(),
    });

    return NextResponse.json({
      message: {
        id: String(messageDoc._id),
        username: messageDoc.username,
        avatarUrl: messageDoc.avatarUrl || null,
        content: messageDoc.content,
        createdAt: messageDoc.createdAt.toISOString(),
        source: messageDoc.source,
        bot: false,
      },
    });
  } catch (err) {
    console.error("POST /api/parties/[id]/chat failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
