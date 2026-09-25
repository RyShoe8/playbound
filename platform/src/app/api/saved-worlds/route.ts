import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import { listSavedWorlds } from "@/lib/savedWorlds";

/** GET ?gameSlug= — saved worlds the signed-in user has played on. */
export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gameSlug = new URL(req.url).searchParams.get("gameSlug") || "";
  await dbConnect();
  return NextResponse.json({ worlds: await listSavedWorlds(userId, gameSlug) });
}
