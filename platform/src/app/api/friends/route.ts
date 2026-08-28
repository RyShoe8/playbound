import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { listFriendsForUser } from "@/lib/friends/friendsList";

export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const friends = await listFriendsForUser(userId);
    return NextResponse.json({ friends });
  } catch (error) {
    console.error("Error fetching friends:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
