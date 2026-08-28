import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { listFriendRequests } from "@/lib/friends/requests";

export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await listFriendRequests(userId));
  } catch (error) {
    console.error("Error fetching friend requests:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
