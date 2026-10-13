import { NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { createPartyServerAdapter, type PartyServerSource } from "@/lib/serverControl/partyServer";
import { consoleCommandProblem } from "@/lib/serverControl/rcon";

type Context = { params: Promise<{ id: string }> };
async function authorize(req: Request, ctx: Context, write: boolean) {
  const userId = await getFriendsUserId(req);
  if (!userId) return { error: "Unauthorized", status: 401 };
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) return { error: "Invalid party", status: 400 };
  await dbConnect();
  const party = await Party.findById(id);
  if (!party) return { error: "Party not found", status: 404 };
  if (!party.members.some((m: {userId: unknown}) => String(m.userId) === userId) || (write && String(party.leaderId) !== userId)) return { error: "Only the party leader can run commands", status: 403 };
  // Only party-owned Together rooms. A public/community server never becomes
  // writable through this route, even when its game is RimWorld.
  if (party.gameSlug !== "rimworld" || party.editionSlug !== "rimworld-together" || !party.hosted?.roomId) return { error: "No RimWorld Together party server", status: 409 };
  const adapter = createPartyServerAdapter(party as unknown as PartyServerSource);
  if (!adapter?.capabilities.console) return { error: "This party cannot control that server", status: 403 };
  return { adapter };
}
export async function GET(req: Request, ctx: Context) {
  const auth = await authorize(req, ctx, false);
  if ("error" in auth) return NextResponse.json({error:auth.error},{status:auth.status});
  try { return NextResponse.json({players:await auth.adapter.getPlayers()}); }
  catch { return NextResponse.json({error:"RimWorld player status unavailable"},{status:503}); }
}
export async function POST(req: Request, ctx: Context) {
  const auth = await authorize(req, ctx, true);
  if ("error" in auth) return NextResponse.json({error:auth.error},{status:auth.status});
  const body = await req.json().catch(()=>null);
  if (typeof body?.command !== "string") return NextResponse.json({error:"Command required"},{status:400});
  const problem = consoleCommandProblem(body.command,"console-rimworld");
  if (problem) return NextResponse.json({error:problem},{status:400});
  try { return NextResponse.json({output:await auth.adapter.sendCommand(body.command)}); }
  catch { return NextResponse.json({error:"RimWorld command could not be confirmed"},{status:503}); }
}
