import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { listPlayInvitesForUser, sendPlayInvite } from "@/lib/playTogether/invites";

export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const invites = await listPlayInvitesForUser(userId);
    return NextResponse.json({ invites });
  } catch (err) {
    console.error("play-invites GET failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await req.json()) as {
      recipientId?: string;
      recipientIds?: string[];
      gameSlug?: string;
      editionSlug?: string | null;
      modSlug?: string | null;
    };
    const gameSlug = String(body.gameSlug || "").trim();
    if (!gameSlug) return NextResponse.json({ error: "gameSlug required" }, { status: 400 });

    const recipients = [
      ...(body.recipientId ? [String(body.recipientId)] : []),
      ...(Array.isArray(body.recipientIds) ? body.recipientIds.map(String) : []),
    ].filter(Boolean);

    if (recipients.length === 0) {
      return NextResponse.json({ error: "recipient required" }, { status: 400 });
    }

    const results = [];
    for (const recipientId of recipients.slice(0, 20)) {
      const result = await sendPlayInvite({
        senderId: userId,
        recipientId,
        gameSlug,
        editionSlug: body.editionSlug,
        modSlug: body.modSlug,
      });
      results.push({ recipientId, ...result });
    }

    const anyOk = results.some((r) => "invite" in r && r.status === 201);
    return NextResponse.json(
      { results },
      { status: anyOk ? 201 : results[0]?.status || 400 }
    );
  } catch (err) {
    console.error("play-invites POST failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
