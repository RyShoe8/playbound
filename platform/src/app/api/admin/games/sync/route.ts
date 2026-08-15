import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { games } from "@/lib/data/games";
import { developersBySlug } from "@/lib/data/developers";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import { ensureDerivedGameFields } from "@/lib/enrich";
import { normalizeStatus, statusToPublished } from "@/lib/catalogStatus";
import { requireAdminSession } from "@/lib/requireAdmin";

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  await dbConnect();

  const body = (await req.json().catch(() => ({}))) as { slugs?: string[] };
  if (!Array.isArray(body?.slugs) || body.slugs.length === 0) {
    return NextResponse.json(
      { error: "Explicit 'slugs' array is required. Bulk sync of the whole catalog is disabled to protect database entries." },
      { status: 400 }
    );
  }

  const targetSlugs = new Set(body.slugs);
  const targetList = games.filter((g) => targetSlugs.has(g.slug));

  let created = 0;
  let updated = 0;

  for (const seed of targetList) {
    const g = ensureDerivedGameFields(seed);
    const developerName = developersBySlug.get(g.developerSlug)?.name ?? null;
    const launcher = g.launcherInstall ?? launcherInstallBySlug[g.slug] ?? null;
    const status = g.status ?? "published";
    const published = status === "published" || statusToPublished(status);

    const existing = await CatalogGame.findOne({ slug: g.slug }).lean();

    const payload = {
      slug: g.slug,
      title: g.title,
      tagline: g.tagline,
      description: g.description,
      developerSlug: g.developerSlug,
      developerName,
      genres: g.genres,
      tags: g.tags,
      aliases: g.aliases ?? [],
      license: g.license,
      releaseYear: g.releaseYear,
      sizeMB: g.sizeMB,
      platforms: g.platforms,
      features: g.features,
      launchMethods: g.launchMethods,
      browserPlayable: g.browserPlayable,
      steamDeck: g.steamDeck,
      website: g.website,
      steamAppId: g.steamAppId ?? null,
      githubRepo: g.githubRepo ?? null,
      art: g.art,
      coverImage: g.coverImage ?? null,
      screenshots: g.screenshots ?? [],
      videos: g.videos ?? [],
      systemRequirements: g.systemRequirements,
      hardwareRequirements: g.hardwareRequirements,
      longDescription: g.longDescription ?? null,
      whyWePickedIt: g.whyWePickedIt ?? null,
      installSteps: g.installSteps ?? [],
      faq: g.faq ?? [],
      bestFor: g.bestFor ?? [],
      notFor: g.notFor ?? [],
      comparableTo: g.comparableTo ?? [],
      qualityBar: g.qualityBar ?? null,
      communityLinks: g.communityLinks ?? {},
      launcherInstall: launcher,
      status,
      published,
      complete: g.complete === true,
      managedBy: "admin",
    };

    if (!existing) {
      await CatalogGame.create(payload);
      created++;
    } else {
      await CatalogGame.updateOne({ slug: g.slug }, { $set: payload });
      updated++;
    }
  }

  try {
    revalidateTag("catalog", "max");
  } catch {
    /* non-blocking */
  }

  return NextResponse.json({
    ok: true,
    total: targetList.length,
    created,
    updated,
    message: `Successfully synchronized ${targetList.length} catalog games to MongoDB (${created} created, ${updated} updated).`,
  });
}
