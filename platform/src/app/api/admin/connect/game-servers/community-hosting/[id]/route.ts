import { Types } from "mongoose";
import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import CommunityServer from "@/lib/models/CommunityServer";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import { createManagedVpsAdapter } from "@/lib/serverControl/managedVps";

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Context) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid server ID" }, { status: 400 });
  const body = await req.json().catch(() => null) as { action?: string; force?: boolean; settings?: Record<string, unknown> } | null;
  if (!body || !["start", "stop", "restart", "settings"].includes(body.action || "")) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  await dbConnect();
  const server = await CommunityServer.findById(id);
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 });
  const profile = await CommunityServerProfile.findOne({ key: server.profileKey }).lean();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 409 });
  if (server.runtimeState === "running" && ["stop", "restart", "settings"].includes(body.action!) && (server.playerCount === null || server.playerCount > 0) && !body.force) {
    return NextResponse.json({ error: "Player count is unknown or players are connected; explicit force is required" }, { status: 409 });
  }
  const adapter = createManagedVpsAdapter({
    id, gameSlug: server.gameSlug, recipeSlug: profile.recipeSlug,
    editionSlug: server.editionSlug || null, mod: server.mod || null,
    name: server.name, settings: server.settings || {},
    onChanged: async (values) => { await CommunityServer.updateOne({ _id: id }, { $set: { settings: values } }); },
  });
  const action = body.action!;
  if (action === "settings") {
    const result = await adapter.applySettings(body.settings || {});
    return NextResponse.json({ ok: true, ...result });
  }
  const state = action === "start" ? await adapter.start() : action === "stop" ? await adapter.stop() : await adapter.restart();
  if (state.status === "failed") return NextResponse.json({ error: state.error || "Server action failed" }, { status: 502 });
  server.desiredState = action === "stop" ? "stopped" : "running";
  server.manualPause = action === "stop";
  server.runtimeState = state.status;
  server.decisionReason = `ADMIN_${action.toUpperCase()}`;
  await server.save();
  return NextResponse.json({ ok: true, state });
}
