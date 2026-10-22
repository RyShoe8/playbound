import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { retryPendingGameAnnouncements } from "@/lib/discordGameAnnouncement";

export const maxDuration = 180;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await retryPendingGameAnnouncements()) });
  } catch (err) {
    console.error("[discord-announcements] retry failed:", err);
    return NextResponse.json({ error: "Discord announcement retry failed" }, { status: 502 });
  }
}
