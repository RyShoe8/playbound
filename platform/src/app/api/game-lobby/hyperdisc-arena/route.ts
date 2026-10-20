import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { userFromLauncherBearer } from "@/lib/library";
import dbConnect from "@/lib/db";
import Member from "@/lib/models/GameLobbyMember";
import Session from "@/lib/models/MultiplayerSession";
import { checkRateLimit } from "@/lib/discussion/rateLimit";

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const activeSession = () => ({ gameSlug: "hyperdisc-arena", status: "waiting", expiresAt: { $gt: new Date() }, lastHeartbeat: { $gt: new Date(Date.now() - 60000) }, $expr: { $lt: ["$playerCount", "$maxPlayers"] } });

// Public game roster is opt-in through the game client, never the private friends roster.
export async function GET(req: Request) {
  try {
    if (!await userFromLauncherBearer(req)) return reply({ error: "Sign in required" }, 401);
    await dbConnect();
    const members = await Member.find({ expiresAt: { $gt: new Date() } }).sort({ name: 1 }).limit(500).lean();
    const sessions = await Session.find({ ...activeSession(), sessionId: { $in: members.map(m => m.sessionId).filter(Boolean) } }).select("sessionId joinCode gameVersion playerCount maxPlayers").lean();
    const owners = new Map(members.filter(m => m.sessionId).map(m => [String(m.sessionId), m]));
    return reply({
      players: members.map(m => ({ id: String(m.userId), name: String(m.name), status: String(m.status) })),
      rooms: sessions.map(s => ({ id: String(s.sessionId), code: String(s.joinCode), name: String(owners.get(String(s.sessionId))?.name || "Player"), version: String(s.gameVersion), players: Number(s.playerCount), capacity: Number(s.maxPlayers) })),
    });
  } catch { return reply({ error: "Lobby unavailable. Try again shortly." }, 503); }
}

export async function POST(req: Request) {
  try {
    const user = await userFromLauncherBearer(req);
    if (!user) return reply({ error: "Sign in required" }, 401);
    await dbConnect();
    const userId = String(user._id);
    if (!(await checkRateLimit(`hyperdisc-lobby:${userId}`, { max: 30, windowMs: 60000 })).ok) return reply({ error: "Please wait" }, 429);
    const body = await req.json();
    let sessionId: string | null = null;
    if (body.sessionId) {
      if (typeof body.sessionId !== "string" || typeof body.hostToken !== "string" || body.hostToken.length > 200) return reply({ error: "Invalid room" }, 400);
      const room = await Session.findOne({ ...activeSession(), sessionId: body.sessionId, hostTokenHash: createHash("sha256").update(body.hostToken).digest("hex") }).select("sessionId").lean();
      if (!room) return reply({ error: "Room is no longer available" }, 409);
      sessionId = String(room.sessionId);
    }
    await Member.updateOne({ userId }, { $set: { name: String(user.username || "Player").slice(0, 32), status: body.status === "playing" ? "playing" : "online", sessionId, expiresAt: new Date(Date.now() + 45000) } }, { upsert: true });
    return reply({ ok: true });
  } catch { return reply({ error: "Could not update lobby" }, 503); }
}

export async function DELETE(req: Request) {
  const user = await userFromLauncherBearer(req);
  if (!user) return reply({ error: "Sign in required" }, 401);
  await dbConnect();
  await Member.deleteOne({ userId: String(user._id) });
  return reply({ ok: true });
}
