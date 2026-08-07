/**
 * Upsert seed games into Mongo even when the catalog is non-empty.
 *
 * - Missing slug → insert (DRAFT_ON_CREATE slugs force draft/unpublished).
 * - Existing draft → refresh seed fields (safe overwrite).
 * - Existing published → only fill empty/thin media + missing launcherInstall;
 *   never demote published/status.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/** New titles introduced in the OSS catalog wave — created as drafts. */
export const DRAFT_ON_CREATE = new Set([
  "openrct2",
  "freeciv",
  "flightgear",
  "freedoom",
  "lincity-ng",
  "daggerfall-unity",
  "openarena",
  "pixreveal",
  "gamebuddies-io",
]);

function isThinMedia(doc: {
  coverImage?: string | null;
  screenshots?: string[] | null;
  videos?: string[] | null;
}): boolean {
  const shots = doc.screenshots?.length ?? 0;
  const vids = doc.videos?.length ?? 0;
  return !doc.coverImage || shots < 2 || vids < 1;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("seed:games-upsert skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const { games } = await import("../src/lib/data/games");
  const { developersBySlug } = await import("../src/lib/data/developers");
  const { launcherInstallBySlug } = await import("../src/lib/data/launcherInstall");
  const { ensureDerivedGameFields } = await import("../src/lib/enrich");
  const { normalizeStatus, statusToPublished } = await import("../src/lib/catalogStatus");

  await dbConnect();

  let created = 0;
  let refreshedDraft = 0;
  let patchedPublished = 0;

  for (const seed of games) {
    const g = ensureDerivedGameFields(seed);
    const developerName = developersBySlug.get(g.developerSlug)?.name ?? null;
    const seedStatus = normalizeStatus({
      status: g.status,
      published: g.status ? undefined : !DRAFT_ON_CREATE.has(g.slug),
    });
    const forceDraft = DRAFT_ON_CREATE.has(g.slug);
    const createStatus = forceDraft ? "draft" : seedStatus === "draft" && forceDraft ? "draft" : seed.status ?? "published";
    const createPublished = statusToPublished(
      forceDraft ? "draft" : normalizeStatus({ status: createStatus, published: true })
    );

    const existing = await CatalogGame.findOne({ slug: g.slug }).lean();
    const launcher = g.launcherInstall ?? launcherInstallBySlug[g.slug] ?? null;

    if (!existing) {
      await CatalogGame.create({
        ...g,
        githubRepo: g.githubRepo ?? null,
        coverImage: g.coverImage ?? null,
        screenshots: g.screenshots ?? [],
        videos: g.videos ?? [],
        developerName,
        launcherInstall: launcher,
        status: forceDraft ? "draft" : createStatus,
        published: forceDraft ? false : createPublished,
        managedBy: "admin",
      });
      created++;
      console.log(`CREATE ${g.slug} (${forceDraft ? "draft" : createStatus})`);
      continue;
    }

    const prev = existing as {
      status?: string;
      published?: boolean;
      coverImage?: string | null;
      screenshots?: string[] | null;
      videos?: string[] | null;
      launcherInstall?: unknown;
      description?: string;
      tagline?: string;
      longDescription?: string | null;
      systemRequirements?: unknown;
      platforms?: string[];
      features?: string[];
      sizeMB?: number;
    };
    const prevStatus = normalizeStatus(prev);

    if (prevStatus === "draft" || prevStatus === "testing") {
      await CatalogGame.updateOne(
        { slug: g.slug },
        {
          $set: {
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
            coverImage: g.coverImage ?? prev.coverImage ?? null,
            screenshots: (g.screenshots?.length ? g.screenshots : prev.screenshots) ?? [],
            videos: (g.videos?.length ? g.videos : prev.videos) ?? [],
            systemRequirements: g.systemRequirements,
            longDescription: g.longDescription ?? prev.longDescription ?? null,
            whyWePickedIt: g.whyWePickedIt ?? null,
            installSteps: g.installSteps ?? [],
            faq: g.faq ?? [],
            bestFor: g.bestFor ?? [],
            notFor: g.notFor ?? [],
            comparableTo: g.comparableTo ?? [],
            qualityBar: g.qualityBar ?? null,
            ...(launcher && !prev.launcherInstall ? { launcherInstall: launcher } : {}),
            ...(launcher && prevStatus === "draft" ? { launcherInstall: launcher } : {}),
          },
        }
      );
      refreshedDraft++;
      console.log(`DRAFT  ${g.slug}`);
      continue;
    }

    // Published: only fill thin gaps — never demote.
    const patch: Record<string, unknown> = {};
    if (isThinMedia(prev)) {
      if (!prev.coverImage && g.coverImage) patch.coverImage = g.coverImage;
      if ((prev.screenshots?.length ?? 0) < 2 && g.screenshots?.length) {
        patch.screenshots = g.screenshots;
      }
      if ((prev.videos?.length ?? 0) < 1 && g.videos?.length) {
        patch.videos = g.videos;
      }
    }
    if (!prev.launcherInstall && launcher) {
      patch.launcherInstall = launcher;
    }
    if (Object.keys(patch).length) {
      await CatalogGame.updateOne({ slug: g.slug }, { $set: patch });
      patchedPublished++;
      console.log(`PATCH  ${g.slug} (${Object.keys(patch).join(",")})`);
    } else {
      console.log(`SKIP   ${g.slug} (published, nothing thin)`);
    }
  }

  console.log(
    `seed:games-upsert done — created=${created} draftRefresh=${refreshedDraft} publishedPatch=${patchedPublished}`
  );
  process.exit(0);
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  /seed-games-upsert\.(ts|js|mjs|cjs)$/i.test(process.argv[1].replace(/\\/g, "/"));

if (isDirectRun) {
  main().catch((err) => {
    console.error("seed:games-upsert failed:", err);
    process.exit(1);
  });
}
