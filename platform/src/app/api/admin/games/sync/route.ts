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

/**
 * Whether a stored value counts as "not filled in yet".
 *
 * Booleans are never empty — false is a real answer, and treating it as a gap
 * would let a fill flip published or steamDeck.
 */
function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "boolean") return false;
  if (typeof v === "number") return false;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Object.keys(o).length === 0) return true;
    // A quality bar with no verdict has not really been written.
    if ("verdict" in o) return String(o.verdict ?? "").trim() === "";
    return false;
  }
  return false;
}

/** Never rewritten by a fill: identity and publication state are not content. */
const FILL_NEVER_TOUCHES = new Set(["slug", "status", "published", "managedBy", "complete"]);

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  await dbConnect();

  const body = (await req.json().catch(() => ({}))) as {
    slugs?: string[];
    mode?: "overwrite" | "fill-empty";
  };
  if (!Array.isArray(body?.slugs) || body.slugs.length === 0) {
    return NextResponse.json(
      { error: "Explicit 'slugs' array is required. Bulk sync of the whole catalog is disabled to protect database entries." },
      { status: 400 }
    );
  }
  /*
   * fill-empty writes only the fields that are currently blank on the stored
   * document and leaves everything else exactly as it is. It exists because the
   * default here replaces the whole payload, which is the right behaviour when
   * seed is authoritative and the wrong one once a game has been curated in the
   * CMS — the common case now. Reach for it when a game is missing a few fields
   * rather than needing to be rebuilt.
   */
  const fillEmptyOnly = body.mode === "fill-empty";

  const targetSlugs = new Set(body.slugs);
  const targetList = games.filter((g) => targetSlugs.has(g.slug));

  let created = 0;
  let updated = 0;
  /** Which fields a fill actually wrote, per slug — so the caller can see it. */
  const filled: Record<string, string[]> = {};
  /** Games a fill left alone because nothing was blank. */
  const skipped: string[] = [];

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
      firstPlaySteps: g.firstPlaySteps ?? [],
      multiplayerGamingSteps: g.multiplayerGamingSteps ?? [],
      faq: g.faq ?? [],
      bestFor: g.bestFor ?? [],
      notFor: g.notFor ?? [],
      comparableTo: g.comparableTo ?? [],
      qualityBar: g.qualityBar ?? null,
      communityLinks: g.communityLinks ?? {},
      launcherInstall: launcher,
      status,
      published,
      publishedAt: published ? ((existing as { publishedAt?: Date | null })?.publishedAt ?? new Date()) : null,
      complete: g.complete === true,
      managedBy: "admin",
    };

    if (!existing) {
      if (fillEmptyOnly) {
        // A fill repairs a game that exists. Creating one would be a surprise.
        skipped.push(g.slug);
        continue;
      }
      await CatalogGame.create(payload);
      created++;
    } else if (fillEmptyOnly) {
      const prevDoc = existing as Record<string, unknown>;
      const partial: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (FILL_NEVER_TOUCHES.has(key)) continue;
        if (isEmptyValue(value)) continue;
        if (!isEmptyValue(prevDoc[key])) continue;
        partial[key] = value;
      }
      if (Object.keys(partial).length === 0) {
        skipped.push(g.slug);
        continue;
      }
      await CatalogGame.updateOne({ slug: g.slug }, { $set: partial });
      filled[g.slug] = Object.keys(partial);
      updated++;
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

  if (fillEmptyOnly) {
    return NextResponse.json({
      ok: true,
      mode: "fill-empty",
      total: targetList.length,
      updated,
      filled,
      skipped,
      message:
        updated === 0
          ? "Nothing to fill — every requested game already had these fields populated."
          : `Filled empty fields on ${updated} game(s). Existing values were left untouched.`,
    });
  }

  return NextResponse.json({
    ok: true,
    mode: "overwrite",
    total: targetList.length,
    created,
    updated,
    message: `Successfully synchronized ${targetList.length} catalog games to MongoDB (${created} created, ${updated} updated).`,
  });
}
