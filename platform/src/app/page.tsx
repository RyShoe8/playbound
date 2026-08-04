import Link from "next/link";
import { Gem, Newspaper, Server, Sparkles, Users } from "lucide-react";
import { collections } from "@/lib/data";
import { gameOfTheWeek, listGames, hiddenGems, getGame } from "@/lib/catalog";
import { listMods } from "@/lib/mods";
import { listServersForGame } from "@/lib/servers/registry";
import { GameArt } from "@/components/GameArt";
import { CardRow, PlayCta } from "@/components/GameCard";
import { ModPreviewCard } from "@/components/ModPreviewCard";
import { NewsletterForm } from "@/components/NewsletterForm";
import { RecaptchaNotice } from "@/components/RecaptchaNotice";
import { HomeGamesSections } from "@/components/HomeGamesSections";
import { Badge, SectionHeader } from "@/components/ui/bits";

const HOME_SERVER_SLUGS = ["openra", "openttd", "luanti"] as const;
const FEATURED_GAMES_LIMIT = 12;
const FEATURED_MODS_LIMIT = 8;

type ServerPreviewRow = {
  slug: string;
  title: string;
  serverCount: number;
  playerCount: number;
};

async function loadServerPreviews(): Promise<ServerPreviewRow[]> {
  const settled = await Promise.allSettled(
    HOME_SERVER_SLUGS.map(async (slug): Promise<ServerPreviewRow | null> => {
      const [game, result] = await Promise.all([getGame(slug), listServersForGame(slug)]);
      if (!game || !result.supported) return null;
      const servers = result.servers ?? [];
      const playerCount = servers.reduce((sum, s) => sum + (Number(s.players) || 0), 0);
      return {
        slug,
        title: game.title,
        serverCount: servers.length,
        playerCount,
      };
    })
  );

  const rows: ServerPreviewRow[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) rows.push(result.value);
  }
  return rows;
}

function pickFeaturedGames<T extends { slug: string; gameOfWeek?: boolean; hiddenGem?: boolean }>(
  all: T[],
  heroSlug: string
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const push = (g: T | undefined) => {
    if (!g || seen.has(g.slug)) return;
    seen.add(g.slug);
    out.push(g);
  };

  push(all.find((g) => g.slug === heroSlug));
  for (const g of all.filter((g) => g.gameOfWeek)) push(g);
  for (const g of all.filter((g) => g.hiddenGem)) push(g);
  for (const g of all) {
    if (out.length >= FEATURED_GAMES_LIMIT) break;
    push(g);
  }
  return out.slice(0, FEATURED_GAMES_LIMIT);
}

export default async function HomePage() {
  const [hero, games, gems, mods, serverPreviews] = await Promise.all([
    gameOfTheWeek(),
    listGames(),
    hiddenGems(),
    listMods(),
    loadServerPreviews(),
  ]);
  if (!hero) return null;

  const featuredGames = pickFeaturedGames(games, hero.slug);
  const featuredMods = mods.slice(0, FEATURED_MODS_LIMIT);
  const featuredCollections = collections.slice(0, 3);
  const gameBySlug = new Map(games.map((g) => [g.slug, g]));

  return (
    <div className="space-y-12 px-4 py-6 sm:px-6 lg:px-8">
      {/* The H1 is descriptive rather than the rotating hero game title — the
          site's most important heading should say what the site is. */}
      <header className="pt-4">
        <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">
          High-quality free games, actually worth your time
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
          Free games are not scarce — good ones are. Every title on PlayBound clears{" "}
          <Link href="/standards" className="font-semibold text-primary hover:underline">
            five published criteria
          </Link>
          : genuinely free, finished, actively maintained, good on its own merits, and
          impossible to shut down. {games.length} games so far. One new pick every
          Wednesday.
        </p>
      </header>

      {/* ── Hero: Game of the Week ─────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-border">
        <GameArt game={hero} showTitle={false} className="absolute inset-0" iconSize="lg" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/10" />
        <div className="relative flex min-h-[380px] flex-col justify-end gap-4 p-6 sm:p-10 lg:max-w-2xl">
          <Badge tone="play" className="w-fit">
            <Sparkles className="size-3" /> Game of the Week
          </Badge>
          <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{hero.title}</h2>
          <p className="max-w-xl text-sm text-white/85 sm:text-base">{hero.tagline}</p>
          <p className="text-sm text-white/70">
            {hero.genres.join(" / ")} · {hero.releaseYear}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <PlayCta game={hero} size="lg" />
            <Link
              href={`/games/${hero.slug}`}
              className="inline-flex h-12 items-center rounded-full border border-white/25 bg-white/10 px-7 text-base font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* ── Newsletter ─────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/20 via-card to-card p-6 sm:p-8">
        <Badge tone="brand">
          <Newspaper className="size-3" /> The PlayBound Weekly
        </Badge>
        <h2 className="mt-3 text-2xl font-extrabold tracking-tight">
          Something new to play, every single week.
        </h2>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          One email every Wednesday with what&apos;s worth playing. No spam, unsubscribe any time.
        </p>
        <div className="relative mt-5">
          <NewsletterForm />
        </div>
        <RecaptchaNotice className="mt-3" />
      </section>

      {/* ── Games + Hidden gems (client-filtered) ─────────────── */}
      <HomeGamesSections featuredGames={featuredGames} gems={gems} />

      {/* ── Live servers ───────────────────────────────────────── */}
      {serverPreviews.length > 0 && (
        <section>
          <SectionHeader
            title="Live Servers"
            subtitle="Public multiplayer right now — open the full browser for every title"
            href="/servers"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {serverPreviews.map((row) => (
              <Link
                key={row.slug}
                href="/servers"
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <p className="flex items-center gap-1.5 font-bold">
                  <Server className="size-3.5 text-primary" /> {row.title}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>
                    {row.serverCount} server{row.serverCount === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" />
                    {row.playerCount} player{row.playerCount === 1 ? "" : "s"}
                  </span>
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Mods ───────────────────────────────────────────────── */}
      {featuredMods.length > 0 && (
        <section>
          <SectionHeader
            title="Mods"
            subtitle="Packageable add-ons for PlayBound titles"
            href="/mods"
          />
          <CardRow>
            {featuredMods.map((m) => {
              const base = gameBySlug.get(m.baseGameSlug);
              return (
                <ModPreviewCard
                  key={m.slug}
                  mod={m}
                  baseGame={
                    base
                      ? {
                          slug: base.slug,
                          title: base.title,
                          coverImage: base.coverImage,
                        }
                      : null
                  }
                />
              );
            })}
          </CardRow>
        </section>
      )}

      {/* ── Hidden gems are rendered inside HomeGamesSections ──── */}

      {/* ── Collections ────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Curated Collections"
          subtitle="Hand-picked groupings from PlayBound"
          href="/collections"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredCollections.map((c) => (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <p className="flex items-center gap-1.5 font-bold">
                <Gem className="size-3.5 text-primary" /> {c.title}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">{c.gameSlugs.length} games</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
