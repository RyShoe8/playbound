import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { getServerSettingProfile, defaultSettingValues } from "@/lib/serverControl/settings";
import { getSelfHostConfig } from "@/lib/multiplayer/adapters";

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

    const desiredRevision = Number(doc.selfHostControl?.desiredRevision) || 0;
    const hasRevision = body.appliedRevision !== undefined;
    const appliedRevision = Number(body.appliedRevision);
    if (
      hasRevision &&
      (!Number.isSafeInteger(appliedRevision) ||
        appliedRevision < 0 ||
        appliedRevision > desiredRevision)
    ) {
      return NextResponse.json({ error: "Invalid applied revision" }, { status: 400 });
    }

    const hostConfig = getSelfHostConfig(String(doc.gameSlug || ""));
    const hasPort = body.port !== undefined;
    const port = Number(body.port);
    if (
      hasPort &&
      (!Number.isSafeInteger(port) ||
        port < 1 ||
        port > 65535 ||
        (hostConfig?.port && port !== hostConfig.port))
    ) {
      return NextResponse.json({ error: "Invalid self-host port" }, { status: 400 });
    }

    if (
      body.ready === true &&
      (doc.status !== "launching" ||
        !hasRevision ||
        appliedRevision !== desiredRevision ||
        !hasPort)
    ) {
      return NextResponse.json(
        { error: "The current launch revision must be listening before it can be ready" },
        { status: 400 }
      );
    }

    const now = new Date();
    const $set: Record<string, unknown> = {
      "selfHostControl.lastError": body.error ? String(body.error).slice(0, 500) : null,
    };
    if (hasRevision) $set["selfHostControl.lastAppliedAt"] = now;
    if (typeof body.ready === "boolean") {
      $set.selfHostReady = body.ready;
      $set.selfHostReadyAt = body.ready ? now : null;
    }
    if (hasPort) {
      $set.selfHostPort = {
        port,
        protocol: hostConfig?.protocol || "tcp",
      };
    }

    const updated = await Party.findOneAndUpdate(
      { _id: doc._id, leaderId: doc.leaderId },
      {
        $set,
        ...(hasRevision && {
          $max: { "selfHostControl.appliedRevision": appliedRevision },
        }),
      },
      { new: true }
    );
    if (!updated) {
      return NextResponse.json({ error: "Party changed while applying the acknowledgement" }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      appliedRevision: updated.selfHostControl?.appliedRevision || 0,
    });
  } catch (err) {
    console.error("[self-host-server] ack failed:", err);
    return NextResponse.json({ error: "Could not record the server state" }, { status: 500 });
  }
}
