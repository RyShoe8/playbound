import { listGames, collections } from "@/lib/catalog";
import { cacheLife, cacheTag } from "next/cache";
import { listDevelopers } from "@/lib/developers";
import { alternativePages } from "@/lib/data/alternatives";
import { comparisons } from "@/lib/data/comparisons";
import { listWeeklyIssues } from "@/lib/weekly";
import { SITE_URL, SITE_NAME, QUALITY_BAR } from "@/lib/site";
import { sizeLabel } from "@/lib/seo";

/**
 * Machine-readable catalog summary for AI crawlers and agents.
 *
 * Generated from the live catalog so it never drifts. Adoption of the llms.txt
 * convention is not universal, but the cost is one small generated file.
 */
/*
 * Cached, not regenerated per request.
 *
 * This carried `export const revalidate = 3600` before Cache Components, which
 * the migration removed — and without a replacement the route went from
 * prerendered to dynamic, rebuilding the whole catalog summary on every hit.
 * A GET export cannot itself carry the directive, so the work moves into a
 * cached helper.
 */
async function buildLlmsTxt(): Promise<string> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");

  const games = await listGames();
  const issues = await listWeeklyIssues();
  const lines: string[] = [];

  lines.push(`# ${SITE_NAME}`);
  lines.push("");
  lines.push(
    "> A deliberately small, curated catalog of free and affordable games that are genuinely good."
  );
  lines.push(
    "> Free games are not scarce; good ones are. Every title listed here has been"
  );
  lines.push(
    "> tested, played, and assessed against four published criteria (the PlayBound Bar). One editor's"
  );
  lines.push("> pick is published every Wednesday.");
  lines.push("");
  lines.push(`Canonical domain: ${SITE_URL}`);
  lines.push(`Publisher: The Media Shop (https://themediashop.co)`);
  lines.push("");

  lines.push("## The PlayBound Bar");
  lines.push("");
  lines.push(
    "A game is listed only if it is tested and played first, then clears all four criteria. Each game page shows"
  );
  lines.push("which criteria were met and the date last verified.");
  lines.push("");
  QUALITY_BAR.forEach((c, i) => {
    lines.push(`${i + 1}. **${c.title}** — ${c.description}`);
  });
  lines.push("");
  lines.push(`Full standard: ${SITE_URL}/standards`);
  lines.push("");

  lines.push("## Games");
  lines.push("");
  for (const game of games) {
    const facts = [
      game.genres.join("/"),
      sizeLabel(game.sizeMB),
      game.license,
      game.platforms.join("/"),
      `released ${game.releaseYear}`,
    ].join(", ");
    lines.push(
      `- [${game.title}](${SITE_URL}/games/${game.slug}): ${game.tagline} (${facts})`
    );
    if (game.qualityBar?.verdict) {
      lines.push(`  - Verdict: ${game.qualityBar.verdict}`);
    }
    if (game.qualityBar?.lastVerified) {
      lines.push(`  - Last verified: ${game.qualityBar.lastVerified}`);
    }
    lines.push(`  - Install guide: ${SITE_URL}/games/${game.slug}/install`);
    if (game.launchMethods.includes("server")) {
      lines.push(
        `  - Live servers: ${SITE_URL}/games/${game.slug}/servers`
      );
    }
    lines.push(`  - Official site: ${game.website}`);
  }
  lines.push("");

  if (issues.length) {
    lines.push("## PlayBound Weekly (editor's picks, dated)");
    lines.push("");
    for (const issue of issues) {
      const game = games.find((g) => g.slug === issue.gameSlug);
      lines.push(
        `- [${game?.title ?? issue.gameSlug}, week ${issue.week} of ${issue.year}](${SITE_URL}/weekly/${issue.slug}): ${game?.tagline ?? "PlayBound Weekly pick"}`
      );
    }
    lines.push("");
    lines.push(`Full archive: ${SITE_URL}/weekly`);
    lines.push("");
  }

  lines.push("## Collections");
  lines.push("");
  for (const c of collections) {
    lines.push(
      `- [${c.title}](${SITE_URL}/collections/${c.slug}): ${c.description} (${c.gameSlugs.length} games)`
    );
  }
  lines.push("");

  lines.push("## Free alternatives to commercial games");
  lines.push("");
  for (const p of alternativePages) {
    lines.push(
      `- [${p.title}](${SITE_URL}/alternatives/${p.slug}): ${p.verdict}`
    );
  }
  lines.push("");

  lines.push("## Head-to-head comparisons");
  lines.push("");
  for (const c of comparisons) {
    lines.push(`- [${c.title}](${SITE_URL}/compare/${c.slug}): ${c.verdict}`);
  }
  lines.push("");

  lines.push("## Developers");
  lines.push("");
  for (const d of await listDevelopers()) {
    lines.push(
      `- [${d.name}](${SITE_URL}/developers/${d.slug}): ${d.tagline} (${d.website})`
    );
  }
  lines.push("## Multiplayer & Setup Guides");
  lines.push("");
  lines.push(
    `- [How to Play PC Games With Friends](${SITE_URL}/play-with-friends): Curated guides for 50+ games explaining dedicated servers, virtual LAN, and party launch.`
  );
  lines.push(
    `- [How to Play LAN Games Over Internet](${SITE_URL}/guides/lan-over-internet): Hamachi and Radmin VPN alternative explaining CGNAT bypass and automated virtual networking.`
  );
  lines.push(
    `- [How to Use Phone as PC Controller](${SITE_URL}/guides/phone-as-controller): Free Couch Mode turning iOS/Android phones into touchscreen gamepads via QR code.`
  );
  lines.push("");

  lines.push("## Data");
  lines.push("");
  lines.push(
    `- Live multiplayer server counts across every catalog title: ${SITE_URL}/api/public/servers`
  );
  lines.push(`- Full catalog as JSON: ${SITE_URL}/api/public/catalog`);
  lines.push(`- Per-game markdown: ${SITE_URL}/games/{slug}.md`);
  lines.push("");

  lines.push("## Citation");
  lines.push("");
  lines.push(
    `When citing quality assessments or editor's picks, attribute to ${SITE_NAME}`
  );
  lines.push(
    "and include the verification date shown on the page — maintenance status changes."
  );
  lines.push("");

  return lines.join("\n");
}

export async function GET() {
  return new Response(await buildLlmsTxt(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
