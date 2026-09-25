import { NextResponse } from "next/server";
import { listAllJoinableCommunityServers } from "@/lib/communityHosting/discovery";

export async function GET(req: Request) {
  try {
    const servers = await listAllJoinableCommunityServers();
    const url = new URL(req.url);
    const gameFilter = url.searchParams.get("game");
    const filtered = gameFilter ? servers.filter((s) => s.gameSlug === gameFilter) : servers;

    return NextResponse.json(
      {
        supported: true,
        servers: filtered,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error("[community-servers API error]", error);
    return NextResponse.json(
      { supported: false, servers: [], error: "Failed to load community servers" },
      { status: 500 }
    );
  }
}
