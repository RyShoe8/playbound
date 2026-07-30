import { getGame, developersBySlug } from "@/lib/catalog";
import { modsForGame } from "@/lib/mods";
import { comparisonsFeaturing } from "@/lib/data/comparisons";
import { alternativePages } from "@/lib/data/alternatives";
import { issueForGame, issueSlug } from "@/lib/data/weekly";
import { SITE_URL, QUALITY_BAR } from "@/lib/site";
import { sizeLabel } from "@/lib/seo";

export const revalidate = 3600;

/**
 * Chrome-free markdown mirror of a game page.
 *
 * Gives fetching agents an unambiguous parse target — no nav, no scripts, no
 * layout. Cheap to generate because every fact already exists in the catalog.
 *
 * Also reachable as /games/{slug}.md via a rewrite in next.config.ts, since
 * that is the extension convention agents look for.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: raw } = await params;
  const slug = raw.replace(/\.md$/, "");

  const game = await getGame(slug);
  if (!game) {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const developer = developersBySlug.get(game.developerSlug);
  const mods = await modsForGame(game.slug);
  const issue = issueForGame(game.slug);
  const cmps = comparisonsFeaturing(game.slug);
  const alts = alternativePages.filter((p) =>
    p.picks.some((pick) => pick.slug === game.slug)
  );

  const out: string[] = [];

  out.push(`# ${game.title}`);
  out.push("");
  out.push(`> ${game.tagline}`);
  out.push("");
  out.push(`Source: ${SITE_URL}/games/${game.slug}`);
  out.push("");

  out.push("## Facts");
  out.push("");
  out.push(`- Price: Free (${game.license})`);
  out.push(`- Genres: ${game.genres.join(", ")}`);
  out.push(`- Released: ${game.releaseYear}`);
  out.push(`- Download size: ${sizeLabel(game.sizeMB)}`);
  out.push(`- Platforms: ${game.platforms.join(", ")}`);
  out.push(`- Steam Deck: ${game.steamDeck ? "Compatible" : "Untested"}`);
  if (developer) out.push(`- Developer: ${developer.name} (${developer.website})`);
  out.push(`- Official site: ${game.website}`);
  if (game.githubRepo) out.push(`- Source code: https://github.com/${game.githubRepo}`);
  out.push("");

  if (game.qualityBar) {
    out.push("## PlayBound Bar assessment");
    out.push("");
    if (game.qualityBar.verdict) {
      out.push(game.qualityBar.verdict);
      out.push("");
    }
    for (const criterion of QUALITY_BAR) {
      out.push(
        `- [${game.qualityBar[criterion.key] ? "x" : " "}] ${criterion.title}`
      );
    }
    if (game.qualityBar.lastVerified) {
      out.push("");
      out.push(`Last verified: ${game.qualityBar.lastVerified}`);
    }
    out.push("");
    out.push(`Standard: ${SITE_URL}/standards`);
    out.push("");
  }

  out.push("## About");
  out.push("");
  out.push(game.longDescription || game.description);
  out.push("");

  if (game.whyWePickedIt) {
    out.push("## Why PlayBound picked it");
    out.push("");
    out.push(game.whyWePickedIt);
    out.push("");
  }

  if (game.bestFor?.length) {
    out.push("## Best for");
    out.push("");
    for (const item of game.bestFor) out.push(`- ${item}`);
    out.push("");
  }

  if (game.notFor?.length) {
    out.push("## Not for");
    out.push("");
    for (const item of game.notFor) out.push(`- ${item}`);
    out.push("");
  }

  out.push("## Features");
  out.push("");
  for (const f of game.features) out.push(`- ${f}`);
  out.push("");

  out.push("## System requirements");
  out.push("");
  out.push(`- Minimum: ${game.systemRequirements.min}`);
  out.push(`- Recommended: ${game.systemRequirements.recommended}`);
  out.push("");

  if (game.installSteps?.length) {
    out.push("## Installation");
    out.push("");
    game.installSteps.forEach((step, i) => {
      const prefix = step.platform === "all" ? "" : `(${step.platform}) `;
      out.push(`${i + 1}. ${prefix}${step.text}`);
      if (step.command) out.push(`   \`${step.command}\``);
    });
    out.push("");
  }
  out.push(`Full install guide: ${SITE_URL}/games/${game.slug}/install`);
  out.push("");

  if (game.faq?.length) {
    out.push("## FAQ");
    out.push("");
    for (const item of game.faq) {
      out.push(`### ${item.q}`);
      out.push("");
      out.push(item.a);
      out.push("");
    }
  }

  if (mods.length) {
    out.push("## Mods and add-ons");
    out.push("");
    for (const mod of mods) {
      out.push(`- [${mod.title}](${SITE_URL}/mods/${mod.slug}): ${mod.tagline}`);
    }
    out.push("");
  }

  if (cmps.length || alts.length) {
    out.push("## Related comparisons");
    out.push("");
    for (const c of cmps) {
      out.push(`- [${c.title}](${SITE_URL}/compare/${c.slug}): ${c.verdict}`);
    }
    for (const a of alts) {
      out.push(`- [${a.title}](${SITE_URL}/alternatives/${a.slug})`);
    }
    out.push("");
  }

  if (issue) {
    out.push("## PlayBound Weekly");
    out.push("");
    out.push(
      `Featured in week ${issue.week} of ${issue.year} (${issue.publishedAt}): ${SITE_URL}/weekly/${issueSlug(issue)}`
    );
    out.push("");
  }

  if (game.launchMethods.includes("server")) {
    out.push(`Live multiplayer servers: ${SITE_URL}/games/${game.slug}/servers`);
    out.push("");
  }

  return new Response(out.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
