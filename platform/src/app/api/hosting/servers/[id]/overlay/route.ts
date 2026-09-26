import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { applyControlSettings, getControl } from "@/lib/dedicatedHosting/control";
import { controlFeatureSupport } from "@/lib/serverControl/settings";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The launcher overlay's Server tab for a PlayBound Dedicated server.
 *
 * Same response shape as /api/parties/:id/server-settings so the overlay
 * renders a customer's own server with exactly the code it uses for a party's
 * — one control surface, whichever kind of server you are playing on. The
 * data and permissions come from the same Server Control service as the web
 * page: a moderator sees only map settings, and nothing here can change the
 * slot count.
 */
export async function GET(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const control = await getControl(userId, id);
  if ("error" in control) return NextResponse.json({ error: control.error }, { status: control.status });
  const configure = control.permissions.includes("server:configure");
  const mapsOnly = !configure && control.permissions.includes("server:change_map");
  const definitions = configure ? control.definitions : mapsOnly ? control.definitions.filter((d) => d.feature === "map") : [];
  return NextResponse.json(
    {
      supported: control.capabilities.settings && definitions.length > 0,
      reason: definitions.length ? undefined : "Your role on this server can't change its settings.",
      features: controlFeatureSupport(control.server.gameSlug),
      phase: control.status.status === "running" ? "live" : "pre-launch",
      canEdit: configure || mapsOnly,
      capabilities: control.capabilities,
      gameSlug: control.server.gameSlug,
      definitions,
      values: control.values,
      status: control.status,
      partySize: control.server.players ?? 0,
      server: { id: control.server.id, name: control.server.name },
    },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function PATCH(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { settings?: Record<string, unknown> } | null;
  if (!body?.settings) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const result = await applyControlSettings(userId, id, body.settings);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    applied: result.applied,
    rejected: result.rejected,
    outcome: result.outcome === "queued" ? "planned" : result.outcome,
    status: result.state,
  });
}
