import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { getServerSettingProfile, defaultSettingValues } from "@/lib/serverControl/settings";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The reconciliation loop for a room on the leader's own PC.
 *
 * GET is the desired state; POST is the leader's launcher saying which
 * revision it has actually reached. Both are the leader's alone — this is the
 * machine running the server, and nobody else's launcher has anything to
 * reconcile.
 *
 * Deliberately settings, not commands. The launcher owns the dedicated
 * process and decides how to reach the state it is given, so this endpoint
 * cannot be talked into running something inside a player's game.
 */
export async function GET(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    await dbConnect();
    const doc = await Party.findById(id);
    if (!doc) return NextResponse.json({ error: "Party not found" }, { status: 404 });
    if (String(doc.leaderId) !== userId) {
      return NextResponse.json({ error: "Only the leader hosts this room" }, { status: 403 });
    }

    const slug = String(doc.gameSlug || "");
    const control = doc.selfHostControl || {};
    const shouldRun = doc.hostMode === "self" && doc.status !== "ended";

    return NextResponse.json({
      /* False is an instruction too: the party ended, so stop the server. */
      shouldRun,
      gameSlug: slug,
      desiredRevision: Number(control.desiredRevision) || 0,
      appliedRevision: Number(control.appliedRevision) || 0,
      // Defaults filled in here so the launcher never has to know a game's
      // defaults — the schema stays the single place that holds them.
      settings: getServerSettingProfile(slug)
        ? { ...defaultSettingValues(slug), ...(control.settings || {}) }
        : {},
    });
  } catch (err) {
    console.error("[self-host-server] read failed:", err);
    return NextResponse.json({ error: "Could not read the server state" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    await dbConnect();
    const doc = await Party.findById(id);
    if (!doc) return NextResponse.json({ error: "Party not found" }, { status: 404 });
    if (String(doc.leaderId) !== userId) {
      return NextResponse.json({ error: "Only the leader hosts this room" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      appliedRevision?: number;
      ready?: boolean;
      port?: number;
      error?: string | null;
    };

    doc.selfHostControl = doc.selfHostControl || {};
    if (Number.isFinite(body.appliedRevision)) {
      /*
       * Never move backwards. A slow reply from a previous poll arriving after
       * a newer one would otherwise re-open a change that is already applied,
       * and the panel would sit at "pending" forever.
       */
      doc.selfHostControl.appliedRevision = Math.max(
        Number(doc.selfHostControl.appliedRevision) || 0,
        Number(body.appliedRevision)
      );
      doc.selfHostControl.lastAppliedAt = new Date();
    }
    doc.selfHostControl.lastError = body.error ? String(body.error).slice(0, 500) : null;
    if (typeof body.ready === "boolean") doc.selfHostReady = body.ready;
    if (Number.isFinite(body.port) && body.port) {
      doc.selfHostPort = { ...(doc.selfHostPort || {}), port: Number(body.port) };
    }
    await doc.save();

    return NextResponse.json({ ok: true, appliedRevision: doc.selfHostControl.appliedRevision });
  } catch (err) {
    console.error("[self-host-server] ack failed:", err);
    return NextResponse.json({ error: "Could not record the server state" }, { status: 500 });
  }
}
