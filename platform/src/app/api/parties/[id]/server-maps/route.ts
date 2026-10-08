import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { createPartyServerAdapter, serverControlAvailability, type PartyServerSource } from "@/lib/serverControl/partyServer";
import { changeMapCommand, nextMapCommand, parseCurrentMap } from "@/lib/serverControl/rcon";
import { getServerSettingProfile } from "@/lib/serverControl/settings";

type Ctx = { params: Promise<{ id: string }> };

async function permitted(req: Request, ctx: Ctx, edit: boolean) {
  const userId = await getFriendsUserId(req);
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { id } = await ctx.params;
  await dbConnect();
  const party = await Party.findById(id);
  if (!party) return { error: "Party not found", status: 404 } as const;
  if (party.status === "ended") return { error: "Party has ended", status: 409 } as const;
  if (!party.members.some((m: { userId: unknown }) => String(m.userId) === userId)) return { error: "Not in this party", status: 403 } as const;
  if (edit && String(party.leaderId) !== userId) return { error: "Only the party leader can change maps", status: 403 } as const;
  const source = party as unknown as PartyServerSource;
  const available = serverControlAvailability(source);
  const profile = getServerSettingProfile(String(source.gameSlug || ""));
  if (!available.available || available.phase !== "live" || !profile?.maps || !profile.controlChannel) {
    return { error: "This party server cannot change maps live", status: 409 } as const;
  }
  const adapter = createPartyServerAdapter(source);
  if (!adapter?.capabilities.liveApply) return { error: "This party server cannot change maps live", status: 409 } as const;
  return { adapter, profile };
}

export async function GET(req: Request, ctx: Ctx) {
  const result = await permitted(req, ctx, false);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { adapter, profile } = result;
  const status = await adapter.getStatus();
  let current: string | null = null;
  if (status.status === "running") {
    try { current = parseCurrentMap(profile.controlChannel, await adapter.sendCommand("status")); } catch { /* Server still reachable for settings. */ }
  }
  return NextResponse.json({
    options: profile.maps!.options, current, running: status.status === "running",
    mode: "live", canNext: Boolean(profile.maps!.nextCommand), canRotate: false, rotation: [],
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request, ctx: Ctx) {
  const result = await permitted(req, ctx, true);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const body = (await req.json().catch(() => null)) as { action?: string; map?: string } | null;
  const spec = result.profile.maps!;
  const map = String(body?.map || "");
  if (!spec.options.some((option) => option.value === map)) return NextResponse.json({ error: "That map isn't on this server" }, { status: 400 });
  const command = body?.action === "change" ? changeMapCommand(spec, map) : body?.action === "next" ? nextMapCommand(spec, map) : null;
  if (!command) return NextResponse.json({ error: "This map action isn't available" }, { status: 400 });
  try {
    await result.adapter.sendCommand(command);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The server didn't answer" }, { status: 503 });
  }
}
