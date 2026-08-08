import { NextResponse } from "next/server";
import { getGame } from "@/lib/catalog";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";
import { hasServerProvider, listServersForGame } from "@/lib/servers/registry";

export const revalidate = 30;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const includeTesting = await requestIncludesTesting(req);
  const game = await getGame(slug, { includeTesting });
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const markedServer = game.launchMethods.includes("server");
  const hasProvider = hasServerProvider(slug);
  if (!markedServer && !hasProvider) {
    return NextResponse.json({
      supported: false,
      servers: [],
      updatedAt: new Date().toISOString(),
      multiplayer: false,
    });
  }

  const result = await listServersForGame(slug);
  return NextResponse.json(
    { ...result, multiplayer: true },
    {
      headers: {
        "Cache-Control": includeTesting
          ? "private, no-store"
          : "public, s-maxage=30, stale-while-revalidate=60",
        Vary: "Cookie, Authorization",
      },
    }
  );
}
