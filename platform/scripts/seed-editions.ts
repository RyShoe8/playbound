/**
 * Upsert curated seed editions. Seed-owned slugs default to unlisted/coming_soon
 * unless the seed sets status/visibility. Parents of public+active seed editions
 * are promoted to published so /api/launcher/editions can return them.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("seed:editions skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const Edition = (await import("../src/lib/models/Edition")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const { editions } = await import("../src/lib/data/editions");

  await dbConnect();

  // Mistaken Phase 2 link: OpenArena is a Quake III fan game, not TES Arena.
  const removedBadEdition = await Edition.deleteOne({
    gameSlug: "tes-arena",
    slug: "openarena",
  });
  if (removedBadEdition.deletedCount) {
    console.log("Removed mistaken edition tes-arena/openarena");
  }

  if (!editions.length) {
    console.log("seed:editions — no seed editions defined.");
    process.exit(0);
  }

  let upserted = 0;
  const parentsToPublish = new Set<string>();
  for (const seed of editions) {
    const game = await CatalogGame.findOne({ slug: seed.gameSlug }).select("_id").lean();
    await Edition.findOneAndUpdate(
      { gameSlug: seed.gameSlug, slug: seed.slug },
      {
        $set: {
          gameId: game?._id ?? null,
          gameSlug: seed.gameSlug,
          slug: seed.slug,
          name: seed.name,
          shortDescription: seed.shortDescription,
          description: seed.description,
          type: seed.type,
          // Draft-like until manually promoted in admin, unless the seed opts in.
          status: seed.status ?? "coming_soon",
          visibility: seed.visibility ?? "unlisted",
          sortOrder: seed.sortOrder ?? 0,
          isDefault: seed.isDefault ?? false,
          branding: seed.branding ?? {},
          links: seed.links ?? {},
          installMethod: seed.installMethod,
          installConfig: seed.installConfig ?? {},
          requirements: seed.requirements ?? null,
          features: seed.features ?? [],
          tags: seed.tags ?? [],
          aliases: seed.aliases ?? [],
          serverName: seed.serverName ?? null,
          languages: seed.languages ?? [],
          version: seed.version ?? null,
          faq: seed.faq ?? [],
          verified: false,
          verificationLevel: seed.verificationLevel ?? "untested",
          verificationNote: seed.verificationNote ?? null,
        },
      },
      { upsert: true, new: true }
    );
    upserted++;
    if (seed.status === "active" && seed.visibility === "public") {
      parentsToPublish.add(seed.gameSlug);
    }
    console.log(`OK  ${seed.gameSlug}/${seed.slug}`);
  }

  // Launcher editions API only lists editions under visible parent games.
  for (const gameSlug of parentsToPublish) {
    const res = await CatalogGame.updateOne(
      { slug: gameSlug, status: { $ne: "published" } },
      { $set: { status: "published", published: true } }
    );
    if (res.modifiedCount) {
      console.log(`PUBLISH parent game ${gameSlug}`);
    }
  }

  console.log(`Seeded/updated ${upserted} editions into MongoDB.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("seed:editions failed:", err);
  process.exit(1);
});
