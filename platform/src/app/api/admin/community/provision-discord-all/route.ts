import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { requestDiscordProvisionAll } from "@/lib/discordProvision";

/**
 * Asks the Discord worker to provision channels for all published games
 * that are missing communityLinks.playboundDiscord.channelId.
 */
export async function POST() {
  const { error } = await requireAdminSession();
  if (error) return error;

  if (!process.env.DISCORD_BOT_WEBHOOK_URL || !process.env.BOT_WEBHOOK_SECRET) {
    return NextResponse.json(
      {
        error:
          "Discord bot webhook not configured. Set DISCORD_BOT_WEBHOOK_URL and BOT_WEBHOOK_SECRET.",
      },
      { status: 503 }
    );
  }

  try {
    const data = await requestDiscordProvisionAll();
    if (!data) {
      return NextResponse.json({ error: "Bot unreachable or not configured" }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("Provision-all error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Provision failed" },
      { status: 502 }
    );
  }
}
