import { NextResponse } from "next/server";
import { absoluteMediaUrl, sizeLabelFromMB } from "@/lib/launcherInstall";
import { listMods } from "@/lib/mods";
import { hasServerProvider, isKnownServerGame } from "@/lib/servers/registry";

export async function GET(req: Request) {
  try {
    const origin = new URL(req.url).origin || "https://playbound.club";
    const baseGameSlug = new URL(req.url).searchParams.get("baseGameSlug") || undefined;
    const mods = await listMods(baseGameSlug ? { baseGameSlug } : undefined);

    const entries = mods.map((m) => ({
      slug: m.slug,
      title: m.title,
      baseGameSlug: m.baseGameSlug,
      tagline: m.tagline,
      coverImage: absoluteMediaUrl(m.coverImage, origin),
      downloadKind: m.downloadKind,
      approxSize: sizeLabelFromMB(m.sizeMB) || null,
      art: [m.art.from, m.art.to] as [string, string],
      baseHasServers:
        hasServerProvider(m.baseGameSlug) || isKnownServerGame(m.baseGameSlug),
      baseSupported: hasServerProvider(m.baseGameSlug),
    }));

    return NextResponse.json(
      { mods: entries },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (err) {
    console.error("launcher mods error:", err);
    return NextResponse.json({ error: "Failed to load mods" }, { status: 500 });
  }
}
