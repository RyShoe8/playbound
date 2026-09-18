import { NextResponse, type NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { listPartyHistoryForConnectAdmin } from "@/lib/playTogether/adminPartyHistory";

export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20;
    const search = searchParams.get("search") || "";
    const gameSlug = searchParams.get("game") || "";

    const data = await listPartyHistoryForConnectAdmin({
      page: isNaN(page) ? 1 : page,
      limit: isNaN(limit) ? 20 : limit,
      search,
      gameSlug,
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/admin/connect/parties/history] Failed to list party history:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load party history" },
      { status: 500 }
    );
  }
}
