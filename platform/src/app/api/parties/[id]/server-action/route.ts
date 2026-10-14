import { NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { createPartyServerAdapter, type PartyServerSource } from "@/lib/serverControl/partyServer";

type Context = { params: Promise<{ id: string }> };

/** Typed desired-state change only. Never relays commands into the host's PC. */
export async function POST(request: Request, context: Context) {
  const userId = await getFriendsUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid party" }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (body?.action !== "restart" || Object.keys(body).some((key) => key !== "action")) {
    return NextResponse.json({ error: "Only a typed restart action is supported" }, { status: 400 });
  }
  try {
    await dbConnect();
    const party = await Party.findById(id);
    if (!party) return NextResponse.json({ error: "Party not found" }, { status: 404 });
    if (String(party.leaderId) !== userId || !party.members.some((member: { userId: unknown }) => String(member.userId) === userId)) {
      return NextResponse.json({ error: "Only the party leader can restart this server" }, { status: 403 });
    }
    if (party.status === "ended") return NextResponse.json({ error: "Party has ended" }, { status: 409 });
    const adapter = createPartyServerAdapter(party as unknown as PartyServerSource, {
      save: async () => {
        // Restart must not overwrite settings changed concurrently by the host.
        const updated = await Party.findOneAndUpdate({
          _id: party._id, leaderId: party.leaderId, hostMode: "self", status: { $ne: "ended" },
          gameSlug: party.gameSlug, editionSlug: party.editionSlug ?? null, selfHostReady: true,
          $expr: { $eq: [ { $ifNull: ["$selfHostControl.desiredRevision", 0] }, { $ifNull: ["$selfHostControl.appliedRevision", 0] } ] },
        }, {
          $inc: { "selfHostControl.desiredRevision": 1 }, $set: { "selfHostControl.lastError": null },
        });
        if (!updated) throw new Error("Party changed while requesting restart");
      },
    });
    if (adapter?.kind !== "local" || !adapter.capabilities.restart) {
      return NextResponse.json({ error: "This action is only available for a self-hosted party server" }, { status: 409 });
    }
    if ((await adapter.getStatus()).status !== "running") return NextResponse.json({ error: "Wait for the local server to be ready before restarting" }, { status: 409 });
    await adapter.restart();
    return NextResponse.json({ outcome: "queued", message: "The host launcher will restart the dedicated server; connected players will be disconnected." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not queue the local server restart" }, { status: 503 });
  }
}
