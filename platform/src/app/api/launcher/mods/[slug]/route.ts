import { NextResponse } from "next/server";
import { getMod } from "@/lib/mods";
import { getGame } from "@/lib/catalog";
import { absoluteMediaUrl, sizeLabelFromMB } from "@/lib/launcherInstall";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const includeTesting = await requestIncludesTesting(req);
    const origin = new URL(req.url).origin || "https://playbound.club";
    const mod = await getMod(slug, { includeTesting });
    if (!mod) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const baseGame = await getGame(mod.baseGameSlug, { includeTesting });

    return NextResponse.json(
      {
        slug: mod.slug,
        title: mod.title,
        tagline: mod.tagline,
        description: mod.description,
        longDescription: mod.longDescription || null,
        whatItChanges: mod.whatItChanges || null,
        compatibility: mod.compatibility || null,
        approxSize: sizeLabelFromMB(mod.sizeMB) || null,
        sizeMB: mod.sizeMB ?? null,
        art: [mod.art.from, mod.art.to],
        coverImage: absoluteMediaUrl(mod.coverImage, origin),
        screenshots: (mod.screenshots || [])
          .map((s) => absoluteMediaUrl(s, origin))
          .filter(Boolean),
        installSteps: Array.isArray(mod.installSteps) ? mod.installSteps : [],
        faq: Array.isArray(mod.faq) ? mod.faq : [],
        website: mod.website || null,
        githubRepo: mod.githubRepo || null,
        downloadKind: mod.downloadKind,
        installRelativePath: mod.installRelativePath || null,
        platforms: Array.isArray(mod.platforms) ? mod.platforms : [],
        tags: mod.tags || [],
        classificationIds: mod.classificationIds || [],
        status: mod.status || "published",
        testing: mod.status === "testing",
        baseGame: baseGame
          ? {
              slug: baseGame.slug,
              title: baseGame.title,
              coverImage: absoluteMediaUrl(baseGame.coverImage, origin),
            }
          : {
              slug: mod.baseGameSlug,
              title: mod.baseGameSlug,
              coverImage: null,
            },
      },
      {
        headers: {
          "Cache-Control": includeTesting
            ? "private, no-store"
            : "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    console.error("launcher mod detail error:", err);
    return NextResponse.json({ error: "Failed to load mod" }, { status: 500 });
  }
}
