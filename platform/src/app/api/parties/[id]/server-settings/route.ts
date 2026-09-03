import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getFriendsUserId } from "@/lib/friendsAuth";
import {
  createPartyServerAdapter,
  serverControlAvailability,
  type PartyServerSource,
} from "@/lib/serverControl/partyServer";
import {
  coerceSettingValues,
  controlFeatureSupport,
  defaultSettingValues,
  getServerSettingProfile,
  strongestApplyMode,
} from "@/lib/serverControl/settings";
import type { ServerControlCapabilities, ServerRuntimeState } from "@/lib/serverControl/adapter";

/**
 * What a room that does not exist yet can do.
 *
 * Settings only: there is nothing running to list players on, restart, or send
 * a command to. Saying so honestly is what keeps the panel from offering
 * buttons that would have to fail.
 */
const PRE_LAUNCH_CAPABILITIES: ServerControlCapabilities = {
  settings: true,
  players: false,
  console: false,
  restart: false,
  liveApply: false,
};

function preLaunchState(gameSlug: string): ServerRuntimeState {
  return {
    status: "stopped",
    gameSlug,
    host: null,
    port: null,
    name: null,
    startedAt: null,
    error: null,
  };
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Server controls for a party's PlayBound-hosted room.
 *
 * GET is for anyone in the party — seeing what the room is set to is part of
 * knowing what you are about to play. PATCH is the leader's alone: every change
 * available today restarts the room, which disconnects everyone on it, and that
 * is not a thing one member does to the rest.
 */
export async function GET(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    await dbConnect();
    const doc = await Party.findById(id);
    if (!doc) return NextResponse.json({ error: "Party not found" }, { status: 404 });

    const member = doc.members.find((m: { userId: unknown }) => String(m.userId) === userId);
    if (!member) return NextResponse.json({ error: "Not in this party" }, { status: 403 });

    const party = doc as unknown as PartyServerSource;
    const availability = serverControlAvailability(party);
    const isLeader = String(doc.leaderId) === userId;

    if (!availability.available) {
      return NextResponse.json({
        supported: false,
        reason: availability.reason,
        canEdit: false,
        /*
         * Sent even when there is no panel. "PlayBound cannot change anything
         * here" is a weaker answer than "this game plays one map from start to
         * finish", and the second one is available.
         */
        features: controlFeatureSupport(String(party.gameSlug || "")),
      });
    }

    /*
     * Before the room exists there is nothing to ask, so the answer is built
     * from the game's own schema and whatever the host has already planned.
     */
    if (availability.phase === "pre-launch") {
      const slug = String(party.gameSlug || "");
      const profile = getServerSettingProfile(slug)!;
      const planned = coerceSettingValues(slug, (doc.hosted?.settings as Record<string, unknown>) || {});
      return NextResponse.json({
        supported: true,
        phase: "pre-launch",
        canEdit: isLeader,
        capabilities: PRE_LAUNCH_CAPABILITIES,
        gameSlug: slug,
        definitions: profile.settings,
        values: { ...defaultSettingValues(slug), ...planned.values },
        status: preLaunchState(slug),
        features: controlFeatureSupport(slug),
        partySize: doc.members.length,
      });
    }

    const adapter = createPartyServerAdapter(party)!;
    const [view, status] = await Promise.all([adapter.getSettings(), adapter.getStatus()]);

    return NextResponse.json({
      supported: true,
      phase: "live",
      canEdit: isLeader,
      capabilities: adapter.capabilities,
      gameSlug: view.gameSlug,
      definitions: view.definitions,
      values: view.values,
      status,
      features: controlFeatureSupport(view.gameSlug),
      /* So the panel can say what a save costs before anyone clicks it. */
      partySize: doc.members.length,
    });
  } catch (err) {
    console.error("[server-settings] read failed:", err);
    return NextResponse.json({ error: "Could not read server settings" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    await dbConnect();
    const doc = await Party.findById(id);
    if (!doc) return NextResponse.json({ error: "Party not found" }, { status: 404 });
    if (doc.status === "ended") {
      return NextResponse.json({ error: "Party has ended" }, { status: 400 });
    }
    if (String(doc.leaderId) !== userId) {
      return NextResponse.json({ error: "Only the party leader can change the server" }, { status: 403 });
    }

    const party = doc as unknown as PartyServerSource;
    const availability = serverControlAvailability(party);
    if (!availability.available) {
      return NextResponse.json({ error: availability.reason }, { status: 409 });
    }

    const body = (await req.json().catch(() => ({}))) as { settings?: Record<string, unknown> };
    const requested = body.settings;
    if (!requested || typeof requested !== "object" || Array.isArray(requested)) {
      return NextResponse.json({ error: "settings object is required" }, { status: 400 });
    }

    /*
     * Planning, not applying. Nothing is running, so this writes what the room
     * will be started with and says so — no restart warning, because there is
     * nobody on a server to disconnect.
     */
    if (availability.phase === "pre-launch") {
      const slug = String(party.gameSlug || "");
      const { values, rejected } = coerceSettingValues(slug, requested);
      doc.hosted = doc.hosted || {};
      doc.hosted.settings = { ...(doc.hosted.settings || {}), ...values };
      doc.markModified("hosted.settings");
      await doc.save();
      return NextResponse.json({
        outcome: "planned",
        applied: values,
        rejected,
        status: preLaunchState(slug),
        appliedBy: null,
      });
    }

    const adapter = createPartyServerAdapter(party, { save: (p) => (p as typeof doc).save() })!;
    const result = await adapter.applySettings(requested);

    /*
     * A failed respawn leaves the party with no room at all: the old one was
     * stopped before the new one was asked for, and there is no way back to it.
     * Say so on the party rather than leaving `ready` pointing at a dead port.
     */
    if (result.state.status === "failed") {
      doc.hosted = doc.hosted || {};
      doc.hosted.status = "failed";
      doc.hosted.error = result.state.error;
      doc.hosted.roomId = null;
      doc.hosted.host = null;
      doc.hosted.port = null;
      await doc.save();
    }

    return NextResponse.json({
      outcome: result.outcome,
      applied: result.applied,
      rejected: result.rejected,
      status: result.state,
      appliedBy: strongestApplyMode(String(party.gameSlug), Object.keys(result.applied)),
    });
  } catch (err) {
    console.error("[server-settings] apply failed:", err);
    return NextResponse.json({ error: "Could not change server settings" }, { status: 500 });
  }
}
