import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { markSelfHostReady } from "@/lib/playTogether/party";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getFriendsUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await markSelfHostReady(id, userId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ party: result.party });
}
