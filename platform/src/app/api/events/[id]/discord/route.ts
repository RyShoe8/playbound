import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import PlatformEvent from "@/lib/models/PlatformEvent";
import { channelProvisionDue } from "@/lib/events/channelLifecycle";
import {
  provisionEventDiscordVoiceWithRetry,
  syncEventVoiceForMember,
} from "@/lib/events/discordEventProvision";

type RouteContext = { params: Promise<{ id: string }> };

/** Lightweight room-state check used while the event page waits for cron. */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  await dbConnect();
  const event = await PlatformEvent.findById(id)
    .select({ startsAt: 1, endsAt: 1, status: 1, discordVoiceChannelId: 1, discordVoiceCleanedAt: 1 })
    .lean();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  return NextResponse.json(
    {
      ready: Boolean(event.discordVoiceChannelId && !event.discordVoiceCleanedAt),
      joinWindowOpen: channelProvisionDue(event, new Date()),
    },
    { headers: { "cache-control": "no-store" } }
  );
}

/** A signed-in event-page visitor can recover a missed cron provision. */
export async function PUT(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  await dbConnect();
  const event = await PlatformEvent.findById(id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (!channelProvisionDue(event, new Date())) {
    return NextResponse.json({ ready: false }, { status: 425 });
  }
  if (!event.discordVoiceChannelId || event.discordVoiceCleanedAt) {
    await provisionEventDiscordVoiceWithRetry(event);
  }
  return NextResponse.json({
    ready: Boolean(event.discordVoiceChannelId && !event.discordVoiceCleanedAt),
  });
}

/** POST /api/events/:id/discord — event equivalent of Party Launch Voice. */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  try {
    await dbConnect();
    const event = await PlatformEvent.findById(id);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    if (!channelProvisionDue(event, new Date())) {
      return NextResponse.json(
        { error: "Event voice opens 15 minutes before the event starts." },
        { status: 425 }
      );
    }

    const voice = await syncEventVoiceForMember(event, userId);
    const inviteUrl = voice.inviteUrl || event.discordInviteUrl || null;
    if (!inviteUrl && !voice.inEventVoice) {
      return NextResponse.json(
        {
          error: "Could not create Discord voice room. The bot service may be offline.",
          needsDiscordLink: voice.needsDiscordLink,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ ...voice, inviteUrl });
  } catch (err) {
    console.error("POST /api/events/[id]/discord failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
