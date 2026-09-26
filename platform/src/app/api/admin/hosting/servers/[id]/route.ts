import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import CommunityServer from "@/lib/models/CommunityServer";
import { stopManagedHostRoom } from "@/lib/gameHost/client";
import { releaseSlots } from "@/lib/dedicatedHosting/entitlement";
import { recordActivity } from "@/lib/dedicatedHosting/access";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ action: z.enum(["stop", "delist"]) });

/**
 * POST — admin actions on a customer server. `delist` hides it from public
 * discovery without stopping it (moderation); `stop` takes it offline, and the
 * owner can start it again.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  await dbConnect();
  const server = await CommunityServer.findOne({ _id: id, ownerType: "user" });
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.action === "delist") {
    server.visibility = "unlisted";
    server.decisionReason = "ADMIN_DELISTED";
    await server.save();
    await recordActivity(id, { id: session!.user.id, kind: "admin" }, "admin_delisted", "Removed from public listing by PlayBound");
    return NextResponse.json({ ok: true });
  }
  server.desiredState = "stopped";
  server.decisionReason = "ADMIN_STOP";
  await server.save();
  await recordActivity(id, { id: session!.user.id, kind: "admin" }, "admin_stopped", "Stopped by PlayBound");
  const stopped = await stopManagedHostRoom(id);
  if (stopped.ok) {
    await CommunityServer.updateOne({ _id: id }, { $set: { runtimeState: "stopped", host: null, port: null, playerCount: null } });
    await releaseSlots(id);
  }
  return NextResponse.json({ ok: true, confirmed: stopped.ok });
}
