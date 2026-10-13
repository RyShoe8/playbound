import { NextResponse } from "next/server";
import { requireDeveloperOrAdminSession, listManageableGames } from "@/lib/developerAccess";

export async function GET(req: Request) {
  const { user, error } = await requireDeveloperOrAdminSession(req);
  if (error) return error;

  try {
    const games = await listManageableGames(user.id);
    return NextResponse.json({ games });
  } catch (err) {
    console.error("[api/developer/games] list failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
