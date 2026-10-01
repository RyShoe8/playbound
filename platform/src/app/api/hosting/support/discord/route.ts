import { NextResponse } from "next/server";

/** A channel-specific Discord invite keeps the support handoff in the right room. */
export async function GET() {
  const base = process.env.DISCORD_BOT_WEBHOOK_URL?.trim().replace(/\/$/, "");
  const secret = process.env.BOT_WEBHOOK_SECRET || process.env.DISCORD_BOT_WEBHOOK_SECRET;
  if (!base || !secret) return NextResponse.json({ error: "Discord support is not configured" }, { status: 503 });
  try {
    const response = await fetch(`${base}/hosting-support`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Discord bot returned ${response.status}`);
    const data = await response.json() as { inviteUrl?: string };
    const invite = new URL(data.inviteUrl || "");
    if (!(["discord.gg", "discord.com"].includes(invite.hostname) && /^\/(?:invite\/)?[a-zA-Z0-9-]+\/?$/.test(invite.pathname))) {
      throw new Error("Discord bot returned an invalid invite");
    }
    return NextResponse.redirect(invite.toString(), { status: 302 });
  } catch (error) {
    console.error("[hosting-support-discord]", error);
    return NextResponse.json({ error: "Discord support is temporarily unavailable" }, { status: 503 });
  }
}
