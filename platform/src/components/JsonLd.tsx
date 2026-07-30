import type { Game, Developer, Collection } from "@/lib/data/types";
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  SITE_SAME_AS,
  QUALITY_BAR,
  absoluteUrl,
} from "@/lib/site";

type Json = Record<string, unknown>;

/**
 * Renders a JSON-LD block. Uses a plain <script> tag rather than next/script
 * because structured data must be present in the initial server-rendered HTML —
 * most AI crawlers do not execute JavaScript.
 */
export function JsonLd({ data }: { data: Json | Json[] }) {
  return (
    <script
      type="application/ld+json"
      // Structured data is generated from trusted catalog content, and the
      // </script> escape below prevents early tag termination.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

function absImage(url?: string): string | undefined {
  if (!url) return undefined;
  return url.startsWith("http") ? url : absoluteUrl(url);
}

/** Stable @id for a game, so schema graphs can reference it. */
export function gameId(slug: string): string {
  return `${SITE_URL}/games/${slug}#game`;
}

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/** Site-wide Organization entity. This is the record everything else hangs off. */
export function organizationSchema(): Json {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icon"),
    },
    ...(SITE_SAME_AS.length ? { sameAs: SITE_SAME_AS } : {}),
    parentOrganization: {
      "@type": "Organization",
      name: "The Media Shop",
      url: "https://themediashop.co",
    },
    knowsAbout: [
      "free games",
      "open-source games",
      "free-to-play games",
      "game curation",
      "multiplayer game servers",
    ],
  };
}

export function websiteSchema(): Json {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    publisher: { "@id": ORGANIZATION_ID },
    inLanguage: "en-US",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbSchema(
  trail: { name: string; path: string }[]
): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * VideoGame entity.
 *
 * `offers` at price 0 plus an explicit `license` is what lets a machine assert
 * "this is genuinely free" — the exact claim PlayBound wants attached to its
 * name. `sameAs` links out to every corroborating source, which is how entity
 * resolution works.
 */
export function videoGameSchema(
  game: Game,
  developer?: Developer,
  opts?: { aggregateRating?: { ratingValue: number; reviewCount: number } }
): Json {
  const sameAs = [
    game.website,
    game.githubRepo ? `https://github.com/${game.githubRepo}` : undefined,
    game.steamAppId ? `https://store.steampowered.com/app/${game.steamAppId}` : undefined,
  ].filter(Boolean) as string[];

  return {
    "@type": "VideoGame",
    "@id": gameId(game.slug),
    name: game.title,
    alternateName: game.tagline,
    url: absoluteUrl(`/games/${game.slug}`),
    description: game.longDescription || game.description,
    abstract: game.tagline,
    genre: game.genres,
    keywords: game.tags.join(", "),
    gamePlatform: game.platforms,
    operatingSystem: game.platforms.join(", "),
    applicationCategory: "Game",
    applicationSubCategory: game.genres[0],
    fileSize: `${game.sizeMB} MB`,
    datePublished: String(game.releaseYear),
    license: game.license,
    isAccessibleForFree: true,
    ...(sameAs.length ? { sameAs } : {}),
    ...(game.coverImage ? { image: absImage(game.coverImage) } : {}),
    ...(game.screenshots?.length
      ? { screenshot: game.screenshots.map(absImage).filter(Boolean) }
      : {}),
    ...(game.videos?.length ? { video: game.videos } : {}),
    author: developer
      ? {
          "@type": "Organization",
          name: developer.name,
          url: developer.website,
        }
      : undefined,
    publisher: { "@id": ORGANIZATION_ID },
    playMode: game.features.some((f) => /multiplayer/i.test(f))
      ? ["SinglePlayer", "MultiPlayer"]
      : ["SinglePlayer"],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: absoluteUrl(`/games/${game.slug}`),
      seller: { "@id": ORGANIZATION_ID },
    },
    // Only emitted when real review data exists — never synthesised.
    ...(opts?.aggregateRating && opts.aggregateRating.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: opts.aggregateRating.ratingValue,
            reviewCount: opts.aggregateRating.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

/**
 * The quality assessment as a Review by PlayBound. This is what makes the
 * editorial judgement machine-readable and attributable to the brand.
 */
export function qualityReviewSchema(game: Game): Json | null {
  if (!game.qualityBar) return null;
  const bar = game.qualityBar;
  const passed = QUALITY_BAR.filter((c) => bar[c.key]).length;

  return {
    "@type": "Review",
    itemReviewed: { "@id": gameId(game.slug) },
    author: { "@id": ORGANIZATION_ID },
    ...(bar.lastVerified ? { datePublished: bar.lastVerified } : {}),
    reviewBody: bar.verdict,
    name: `${game.title} vs the PlayBound Bar`,
    reviewRating: {
      "@type": "Rating",
      ratingValue: passed,
      bestRating: QUALITY_BAR.length,
      worstRating: 0,
      ratingExplanation: `Meets ${passed} of ${QUALITY_BAR.length} PlayBound Bar criteria.`,
    },
  };
}

export function faqSchema(faq: { q: string; a: string }[]): Json | null {
  if (!faq.length) return null;
  return {
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/** ItemList — what makes a "Best Free X" collection legible as a ranked list. */
export function itemListSchema(
  name: string,
  description: string,
  path: string,
  games: Game[]
): Json {
  return {
    "@type": "ItemList",
    name,
    description,
    url: absoluteUrl(path),
    numberOfItems: games.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: games.map((game, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absoluteUrl(`/games/${game.slug}`),
      name: game.title,
      item: {
        "@type": "VideoGame",
        "@id": gameId(game.slug),
        name: game.title,
        url: absoluteUrl(`/games/${game.slug}`),
        description: game.tagline,
        applicationCategory: "Game",
        operatingSystem: game.platforms.join(", "),
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    })),
  };
}

export function collectionPageSchema(
  collection: Collection,
  games: Game[]
): Json[] {
  return [
    {
      "@type": "CollectionPage",
      "@id": absoluteUrl(`/collections/${collection.slug}`) + "#page",
      name: collection.title,
      description: collection.description,
      url: absoluteUrl(`/collections/${collection.slug}`),
      publisher: { "@id": ORGANIZATION_ID },
    },
    itemListSchema(
      collection.title,
      collection.description,
      `/collections/${collection.slug}`,
      games
    ),
  ];
}

export function howToSchema(
  game: Game,
  steps: { text: string; command?: string }[]
): Json | null {
  if (!steps.length) return null;
  return {
    "@type": "HowTo",
    name: `How to install ${game.title} for free`,
    description: `Step-by-step instructions for installing ${game.title}, a free ${game.genres[0]} game, on ${game.platforms.join(", ")}.`,
    totalTime: "PT10M",
    estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
    supply: [],
    tool: [],
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: `Step ${i + 1}`,
      text: s.command ? `${s.text} Command: ${s.command}` : s.text,
      url: absoluteUrl(`/games/${game.slug}/install#step-${i + 1}`),
    })),
  };
}

export function articleSchema(opts: {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  image?: string;
}): Json {
  return {
    "@type": "Article",
    headline: opts.headline,
    description: opts.description,
    url: absoluteUrl(opts.path),
    datePublished: opts.datePublished,
    dateModified: opts.datePublished,
    author: { "@id": ORGANIZATION_ID },
    publisher: { "@id": ORGANIZATION_ID },
    ...(opts.image ? { image: absImage(opts.image) } : {}),
    isAccessibleForFree: true,
  };
}

/** Wraps entities in a @graph so they can cross-reference by @id. */
export function graph(...entities: (Json | Json[] | null | undefined)[]): Json {
  const flat = entities
    .flatMap((e) => (Array.isArray(e) ? e : [e]))
    .filter(Boolean) as Json[];
  return { "@context": "https://schema.org", "@graph": flat };
}
