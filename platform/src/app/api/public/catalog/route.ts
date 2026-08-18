import { listGames, collections } from "@/lib/catalog";
import { gameAccessTiers, tierFor } from "@/lib/access/tiers";
import { SITE_URL, QUALITY_BAR } from "@/lib/site";

export const revalidate = 3600;

/**
 * The catalog as normalised JSON.
 *
 * Individually these facts are trivial; collectively — consistent size,
 * licence, platform, Steam Deck and quality-bar fields across every title —
 * they are a dataset that exists nowhere else in one shape. Open by design.
 */
export async function GET() {
  const [games, tiers] = await Promise.all([listGames(), gameAccessTiers()]);

  return Response.json(
    {
      source: `PlayBound (${SITE_URL})`,
      documentation: `${SITE_URL}/llms.txt`,
      standard: {
        name: "The PlayBound Bar",
        url: `${SITE_URL}/standards`,
        criteria: QUALITY_BAR.map((c) => ({
          key: c.key,
          title: c.title,
          description: c.description,
        })),
      },
      license: "CC BY 4.0 — attribution to PlayBound required",
      generatedAt: new Date().toISOString(),
      count: games.length,
      games: games.map((game) => ({
        slug: game.slug,
        title: game.title,
        tagline: game.tagline,
        url: `${SITE_URL}/games/${game.slug}`,
        markdown: `${SITE_URL}/games/${game.slug}.md`,
        installGuide: `${SITE_URL}/games/${game.slug}/install`,
        genres: game.genres,
        tags: game.tags,
        license: game.license,
        releaseYear: game.releaseYear,
        sizeMB: game.sizeMB,
        platforms: game.platforms,
        steamDeck: game.steamDeck,
        launchMethods: game.launchMethods,
        officialWebsite: game.website,
        sourceRepo: game.githubRepo ? `https://github.com/${game.githubRepo}` : null,
        accessTier: tierFor(tiers, game.slug).tier,
        qualifyingPriceCents: tierFor(tiers, game.slug).qualifyingPriceCents,
        currentPriceCents: tierFor(tiers, game.slug).fromPriceCents,
        qualityBar: game.qualityBar ?? null,
        bestFor: game.bestFor ?? [],
        notFor: game.notFor ?? [],
        comparableTo: game.comparableTo ?? [],
        systemRequirements: game.systemRequirements,
      })),
      collections: collections.map((c) => ({
        slug: c.slug,
        title: c.title,
        description: c.description,
        url: `${SITE_URL}/collections/${c.slug}`,
        games: c.gameSlugs,
      })),
    },
    {
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=3600",
        "access-control-allow-origin": "*",
      },
    }
  );
}
