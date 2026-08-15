/**
 * Upsert seed games into Mongo even when the catalog is non-empty.
 *
 * - Missing slug → insert (DRAFT_ON_CREATE slugs force draft/unpublished).
 * - Existing draft/testing → refresh seed-driven metadata, but never clobber
 *   CMS media or title/tagline/description/longDescription when already set.
 * - Existing published → only fill empty media + missing launcherInstall /
 *   hardwareRequirements; never demote published/status.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/** New titles introduced in catalog waves — created as drafts unless seed sets status. */
export const DRAFT_ON_CREATE = new Set([
  "lincity-ng",
  "diablo-2",
  "world-of-tanks",
  "apex-legends",
  "hearthstone",
  "genshin-impact",
  "dota-2",
  "league-of-legends",
  "quake-champions",
]);

/** Standalone remasters superseded by parent-game editions — keep rows but unpublish. */
export const SUPERSEDED_GAME_SLUGS = new Set(["daggerfall-unity"]);

function pickText(
  prev: string | null | undefined,
  seed: string | null | undefined
): string | null {
  const p = typeof prev === "string" ? prev.trim() : "";
  if (p) return prev as string;
  const s = typeof seed === "string" ? seed.trim() : "";
  return s ? (seed as string) : null;
}

function pickCover(
  prev: string | null | undefined,
  seed: string | null | undefined
): string | null {
  return pickText(prev, seed);
}

function pickList(
  prev: string[] | null | undefined,
  seed: string[] | null | undefined
): string[] {
  if (Array.isArray(prev) && prev.length > 0) return prev;
  return Array.isArray(seed) && seed.length > 0 ? seed : [];
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
        communityLinks: g.communityLinks ?? {},
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
      title?: string;
      coverImage?: string | null;
      screenshots?: string[] | null;
      videos?: string[] | null;
      launcherInstall?: unknown;
      description?: string;
      tagline?: string;
      longDescription?: string | null;
      systemRequirements?: unknown;
      hardwareRequirements?: unknown;
      platforms?: string[];
      features?: string[];
      sizeMB?: number;
      whyWePickedIt?: string | null;
      qualityBar?: unknown;
      faq?: unknown[] | null;
      bestFor?: string[] | null;
      notFor?: string[] | null;
      comparableTo?: string[] | null;
      installSteps?: unknown[] | null;
      communityLinks?: { officialDiscord?: { inviteUrl?: string } };
      complete?: boolean;
    };
    const prevStatus = normalizeStatus(prev);

    if (prevStatus === "draft" || prevStatus === "testing") {
      await CatalogGame.updateOne(
        { slug: g.slug },
        {
          $set: {
            title: pickText(prev.title, g.title) ?? g.title,
            tagline: pickText(prev.tagline, g.tagline) ?? g.tagline,
            description: pickText(prev.description, g.description) ?? g.description,
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
            coverImage: pickCover(prev.coverImage, g.coverImage),
            screenshots: pickList(prev.screenshots, g.screenshots),
            videos: pickList(prev.videos, g.videos),
            systemRequirements: g.systemRequirements,
            ...(g.hardwareRequirements ? { hardwareRequirements: g.hardwareRequirements } : {}),
            longDescription: pickText(prev.longDescription, g.longDescription),
            whyWePickedIt: g.whyWePickedIt ?? null,
            installSteps: g.installSteps ?? [],
            faq: g.faq ?? [],
            bestFor: g.bestFor ?? [],
            notFor: g.notFor ?? [],
            comparableTo: g.comparableTo ?? [],
            qualityBar: g.qualityBar ?? null,
            ...(g.communityLinks ? { communityLinks: g.communityLinks } : {}),
            complete: g.complete === true,
            ...(launcher && !prev.launcherInstall ? { launcherInstall: launcher } : {}),
            ...(launcher && prevStatus === "draft" ? { launcherInstall: launcher } : {}),
            status: seedStatus,
            published: statusToPublished(seedStatus),
          },
        }
      );
      refreshedDraft++;
      console.log(
        `DRAFT  ${g.slug}${prevStatus !== seedStatus ? `→${seedStatus}` : ""}`
      );
      continue;
    }

    // Published: fill empty media/editorial gaps — never demote or replace CMS text.
    const patch: Record<string, unknown> = {};
    if (g.features?.length) {
      patch.features = g.features;
    }
    if (g.aliases?.length) {
      patch.aliases = g.aliases;
    }
    if (g.qualityBar) {
      patch.qualityBar = g.qualityBar;
    }
    if (launcher) {
      patch.launcherInstall = launcher;
    }
    if (g.communityLinks?.officialDiscord?.inviteUrl) {
      patch.communityLinks = g.communityLinks;
    }
    if (!prev.coverImage && g.coverImage) patch.coverImage = g.coverImage;
    if (!(prev.screenshots?.length) && g.screenshots?.length) {
      patch.screenshots = g.screenshots;
    }
    if (!(prev.videos?.length) && g.videos?.length) {
      patch.videos = g.videos;
    }
    if (g.hardwareRequirements) {
      patch.hardwareRequirements = g.hardwareRequirements;
    }
    if (g.longDescription) {
      patch.longDescription = g.longDescription;
    }
    if (g.whyWePickedIt) {
      patch.whyWePickedIt = g.whyWePickedIt;
    }
    if (g.faq?.length) {
      patch.faq = g.faq;
    }
    if (g.bestFor?.length) {
      patch.bestFor = g.bestFor;
    }
    if (g.notFor?.length) {
      patch.notFor = g.notFor;
    }
    if (g.comparableTo?.length) {
      patch.comparableTo = g.comparableTo;
    }
    if (g.installSteps?.length) {
      patch.installSteps = g.installSteps;
    }
    if (g.complete === true) {
      patch.complete = true;
    }
    if (Object.keys(patch).length) {
      await CatalogGame.updateOne({ slug: g.slug }, { $set: patch });
      patchedPublished++;
      console.log(`PATCH  ${g.slug} (${Object.keys(patch).join(",")})`);
    } else {
      console.log(`SKIP   ${g.slug} (published, nothing empty)`);
    }
  }

  let superseded = 0;
  for (const slug of SUPERSEDED_GAME_SLUGS) {
    const res = await CatalogGame.updateOne(
      { slug },
      {
        $set: {
          published: false,
          status: "draft",
          tagline: "Superseded — use the Daggerfall Unity edition on Daggerfall.",
        },
      }
    );
    if (res.matchedCount) {
      superseded++;
      console.log(`SUPERSEDE ${slug}`);
    }
  }

  console.log(
    `seed:games-upsert done — created=${created} draftRefresh=${refreshedDraft} publishedPatch=${patchedPublished} superseded=${superseded}`
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
