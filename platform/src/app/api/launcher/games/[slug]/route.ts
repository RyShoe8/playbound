import { NextResponse } from "next/server";
import { getGame } from "@/lib/catalog";
import { absoluteMediaUrl, sizeLabelFromMB } from "@/lib/launcherInstall";
import { listMods } from "@/lib/mods";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const origin = new URL(req.url).origin || "https://playbound.club";
    const game = await getGame(slug);
    if (!game) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const mods = (await listMods({ baseGameSlug: slug })).map((m) => ({
      slug: m.slug,
      title: m.title,
      tagline: m.tagline,
      coverImage: absoluteMediaUrl(m.coverImage, origin),
      approxSize: sizeLabelFromMB(m.sizeMB) || null,
      art: [m.art.from, m.art.to] as [string, string],
      downloadKind: m.downloadKind,
    }));

    return NextResponse.json(
      {
        slug: game.slug,
        title: game.title,
        blurb: game.tagline,
        description: game.description,
        features: game.features || [],
        genres: game.genres || [],
        tags: game.tags || [],
        approxSize: sizeLabelFromMB(game.sizeMB) || null,
        art: [game.art.from, game.art.to],
        coverImage: absoluteMediaUrl(game.coverImage, origin),
        screenshots: (game.screenshots || [])
          .map((s) => absoluteMediaUrl(s, origin))
          .filter(Boolean),
        systemRequirements: game.systemRequirements || null,
        multiplayer: Boolean(game.launchMethods?.includes("server")),
        website: game.website || null,
        mods,
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (err) {
    console.error("launcher game detail error:", err);
    return NextResponse.json({ error: "Failed to load game" }, { status: 500 });
  }
}
