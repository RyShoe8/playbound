import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Bell,
  Download,
  Gamepad2,
  Heart,
  MessagesSquare,
  Monitor,
  Server,
  Share2,
  Star,
  Trophy,
} from "lucide-react";
import {
  achievementsFor,
  collectionsFeaturing,
  developersBySlug,
  discussionsFor,
  getGame,
  games,
  guidesFor,
  modsFor,
  newsFor,
  reviewsFor,
  serversFor,
} from "@/lib/data";
import type { Game } from "@/lib/data/types";
import { GameArt } from "@/components/GameArt";
import { CardRow, GameCard, LaunchBadge, PlayCta } from "@/components/GameCard";
import { Avatar, Badge, EmptyHint, PlayersOnline, Rating, SectionHeader } from "@/components/ui/bits";
import { cn } from "@/lib/utils";

const tabs = [
  "overview",
  "servers",
  "mods",
  "guides",
  "achievements",
  "news",
  "discussion",
  "reviews",
  "media",
  "updates",
] as const;
type Tab = (typeof tabs)[number];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGame(slug);
  return { title: game ? game.title : "Game Not Found" };
}

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab: rawTab } = await searchParams;
  const game = getGame(slug);
  if (!game) notFound();

  const tab: Tab = tabs.includes(rawTab as Tab) ? (rawTab as Tab) : "overview";

  return (
    <div>
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        <GameArt game={game} showTitle={false} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        <div className="relative px-4 pt-24 pb-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                {game.firstParty && <Badge tone="brand">PlayBound Original</Badge>}
                <LaunchBadge game={game} />
                {game.genres.map((g) => (
                  <Badge key={g} tone="outline">
                    {g}
                  </Badge>
                ))}
              </div>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{game.title}</h1>
              <p className="mt-2 text-muted-foreground sm:text-lg">{game.tagline}</p>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <Rating value={game.rating} count={game.ratingCount} />
                <PlayersOnline count={game.playersOnline} />
                {game.activeServers > 0 && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Server className="size-3.5" /> {game.activeServers} active servers
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-start gap-3">
              <div className="flex items-center gap-3">
                <PlayCta game={game} size="lg" />
                {!game.browserPlayable && (
                  <Link
                    href={`/games/${game.slug}/play`}
                    className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-secondary px-6 text-base font-bold transition-colors hover:bg-secondary/70"
                  >
                    <Download className="size-4.5" /> Install
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                {[
                  { icon: Heart, label: "Favorite" },
                  { icon: Bell, label: "Follow" },
                  { icon: Share2, label: "Share" },
                  { icon: MessagesSquare, label: "Community" },
                ].map(({ icon: Icon, label }) => (
                  <button
                    key={label}
                    className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Icon className="size-3.5" /> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <nav className="no-scrollbar sticky top-14 z-20 flex gap-1 overflow-x-auto border-b border-border bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        {tabs.map((t) => (
          <Link
            key={t}
            href={`/games/${game.slug}${t === "overview" ? "" : `?tab=${t}`}`}
            className={cn(
              "border-b-2 px-3 py-3 text-sm font-semibold whitespace-nowrap capitalize transition-colors",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-8 sm:px-6 lg:px-8">
        {tab === "overview" && <OverviewTab game={game} />}
        {tab === "servers" && <ServersTab game={game} />}
        {tab === "mods" && <ModsTab game={game} />}
        {tab === "guides" && <GuidesTab game={game} />}
        {tab === "achievements" && <AchievementsTab game={game} />}
        {tab === "news" && <NewsTab game={game} />}
        {tab === "discussion" && <DiscussionTab game={game} />}
        {tab === "reviews" && <ReviewsTab game={game} />}
        {tab === "media" && <MediaTab game={game} />}
        {tab === "updates" && <UpdatesTab game={game} />}
      </div>
    </div>
  );
}

/* ────────────────────────── Tabs ────────────────────────── */

function OverviewTab({ game }: { game: Game }) {
  const developer = developersBySlug.get(game.developerSlug);
  const featuring = collectionsFeaturing(game.slug);
  const similar = games
    .filter((g) => g.slug !== game.slug && g.genres.some((genre) => game.genres.includes(genre)))
    .slice(0, 6);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-10">
        <section>
          <h2 className="text-lg font-bold">About</h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">{game.description}</p>
        </section>

        <section>
          <h2 className="text-lg font-bold">Features</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {game.features.map((f) => (
              <div key={f} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <Gamepad2 className="size-4 text-primary" /> {f}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold">Screenshots</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <GameArt
                key={i}
                game={game}
                showTitle={false}
                iconSize="md"
                className={cn("aspect-video rounded-lg", i === 1 && "brightness-90", i === 2 && "brightness-110 saturate-150")}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Generated placeholder art — final screenshots arrive with the media pipeline.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">System Requirements</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Minimum</p>
              <p className="mt-1.5 text-sm">{game.systemRequirements.min}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recommended</p>
              <p className="mt-1.5 text-sm">{game.systemRequirements.recommended}</p>
            </div>
          </div>
        </section>

        {similar.length > 0 && (
          <section>
            <SectionHeader title="More Like This" href="/discover" />
            <CardRow>
              {similar.map((g) => (
                <GameCard key={g.slug} game={g} />
              ))}
            </CardRow>
          </section>
        )}
      </div>

      {/* Info sidebar */}
      <aside className="space-y-4">
        {developer && (
          <Link
            href={`/developers/${developer.slug}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <Avatar name={developer.name} hue={developer.artHue} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-bold">{developer.name}</p>
              <p className="text-xs text-muted-foreground">
                {Intl.NumberFormat("en", { notation: "compact" }).format(developer.followers)} followers · Follow for updates
              </p>
            </div>
          </Link>
        )}
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
          {[
            ["Released", String(game.releaseYear)],
            ["Last update", game.lastUpdate],
            ["License", game.license],
            ["Platforms", game.platforms.join(", ")],
            ["Download size", game.sizeMB ? (game.sizeMB >= 1000 ? `${(game.sizeMB / 1000).toFixed(1)} GB` : `${game.sizeMB} MB`) : "None — runs in browser"],
            ["Launch", game.launchMethods.map((m) => ({ browser: "Browser Play", install: "PlayBound Install", server: "Dedicated Servers" })[m]).join(" · ")],
            ["Steam Deck", game.steamDeck ? "Compatible" : "Untested"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">{k}</span>
              <span className="text-right font-medium">{v}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tags</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {game.tags.map((t) => (
              <Badge key={t} tone="neutral">{t}</Badge>
            ))}
          </div>
        </div>
        {featuring.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Featured in</p>
            <div className="mt-2 space-y-1.5">
              {featuring.map((c) => (
                <Link key={c.slug} href={`/collections/${c.slug}`} className="block text-sm font-medium hover:text-primary hover:underline">
                  {c.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function ServersTab({ game }: { game: Game }) {
  const list = serversFor(game.slug);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Server Browser</h2>
          <p className="text-sm text-muted-foreground">
            {game.activeServers > 0
              ? `${game.activeServers} servers online · quick join drops you into the best match`
              : "This game doesn't use dedicated servers."}
          </p>
        </div>
        {game.launchMethods.includes("server") && (
          <div className="flex gap-2">
            <button className="rounded-full bg-play px-4 py-2 text-sm font-bold text-play-foreground transition-all hover:brightness-110">
              Quick Join
            </button>
            <button className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold transition-colors hover:bg-secondary/70">
              Host Server
            </button>
          </div>
        )}
      </div>
      {list.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          {list.map((s, i) => (
            <div
              key={s.name}
              className={cn("flex flex-wrap items-center gap-3 bg-card px-4 py-3", i > 0 && "border-t border-border")}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.map} · {s.region} · created {s.createdAgo}
                </p>
              </div>
              <span className={cn("text-sm font-semibold", s.players >= s.maxPlayers ? "text-amber-400" : "text-play")}>
                {s.players}/{s.maxPlayers}
              </span>
              <button
                className="rounded-full bg-secondary px-4 py-1.5 text-xs font-bold transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                disabled={s.players >= s.maxPlayers}
              >
                {s.players >= s.maxPlayers ? "Full" : "Join"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint icon={Server}>No live servers right now — host one and friends can join in one click.</EmptyHint>
      )}
    </div>
  );
}

function ModsTab({ game }: { game: Game }) {
  const list = modsFor(game.slug);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-bold">Mods</h2>
        <p className="text-sm text-muted-foreground">
          One-click install · automatic updates · dependencies handled for you
        </p>
      </div>
      {list.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((m) => (
            <div key={m.name} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold">{m.name}</p>
                <Rating value={m.rating} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{m.summary}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  by {m.author} · {Intl.NumberFormat("en").format(m.downloads)} downloads · updated {m.updatedAgo}
                </span>
                <button className="rounded-full bg-secondary px-3 py-1 font-bold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground">
                  Install
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>
          {game.modsCount > 0
            ? `${game.modsCount} mods exist for this game — the browser is being indexed.`
            : "This game doesn't support mods yet."}
        </EmptyHint>
      )}
    </div>
  );
}

function GuidesTab({ game }: { game: Game }) {
  const list = guidesFor(game.slug);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-bold">Guides</h2>
        <p className="text-sm text-muted-foreground">Community and developer wisdom, from first launch to top of the ladder</p>
      </div>
      {list.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          {list.map((g, i) => (
            <div key={g.title} className={cn("flex flex-wrap items-center gap-3 bg-card px-4 py-3", i > 0 && "border-t border-border")}>
              <Badge tone={g.kind === "Beginner" ? "play" : "brand"}>{g.kind}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {g.title} {g.trending && <Badge tone="warn" className="ml-1">Trending</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  by {g.author} · {Intl.NumberFormat("en", { notation: "compact" }).format(g.views)} views · {g.timeAgo}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>No guides yet — be the first to write one.</EmptyHint>
      )}
    </div>
  );
}

function AchievementsTab({ game }: { game: Game }) {
  const list = achievementsFor(game.slug);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-bold">Achievements</h2>
        <p className="text-sm text-muted-foreground">
          {game.achievementsCount} platform achievements · earn XP, levels, and badges across PlayBound
        </p>
      </div>
      {list.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((a) => (
            <div key={a.name} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                <Trophy className="size-5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{a.name}</p>
                <p className="text-sm text-muted-foreground">{a.description}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p className="font-bold text-foreground">+{a.xp} XP</p>
                <p>{a.rarity}% of players</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint icon={Trophy}>Achievements for this game are being configured.</EmptyHint>
      )}
    </div>
  );
}

function NewsTab({ game }: { game: Game }) {
  const list = newsFor(game.slug);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h2 className="text-lg font-bold">News & Devlogs</h2>
      {list.length > 0 ? (
        <div className="space-y-3">
          {list.map((n) => (
            <article key={n.title} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge tone="brand">{n.kind}</Badge> {n.date}
              </div>
              <h3 className="mt-2 font-bold">{n.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{n.summary}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyHint>No news yet — follow the developer to get notified the moment something ships.</EmptyHint>
      )}
    </div>
  );
}

function DiscussionTab({ game }: { game: Game }) {
  const list = discussionsFor(game.slug);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Discussion</h2>
        <button className="rounded-full bg-secondary px-4 py-2 text-sm font-bold transition-colors hover:bg-primary hover:text-primary-foreground">
          New Thread
        </button>
      </div>
      {list.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          {list.map((d, i) => (
            <div key={d.title} className={cn("flex items-center gap-3 bg-card px-4 py-3", i > 0 && "border-t border-border")}>
              <MessagesSquare className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.title}</p>
                <p className="text-xs text-muted-foreground">
                  by {d.author} · {d.replies} replies · active {d.lastActive}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint icon={MessagesSquare}>Quiet in here. Start the first thread.</EmptyHint>
      )}
    </div>
  );
}

function ReviewsTab({ game }: { game: Game }) {
  const list = reviewsFor(game.slug);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-6 rounded-xl border border-border bg-card p-5">
        <div className="text-center">
          <p className="text-4xl font-extrabold">{game.rating.toFixed(1)}</p>
          <div className="mt-1 flex justify-center">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={cn("size-4", i <= Math.round(game.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
              />
            ))}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          <p>
            <span className="font-bold text-foreground">
              {Intl.NumberFormat("en").format(game.ratingCount)}
            </span>{" "}
            player ratings
          </p>
          <p className="mt-1">Every review comes from someone who actually played — playtime is shown on each one.</p>
        </div>
      </div>
      {list.length > 0 ? (
        <div className="space-y-3">
          {list.map((r) => (
            <article key={r.title} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold">“{r.title}”</p>
                <Rating value={r.rating} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {r.author} · {r.timeAgo} · {r.helpful} found this helpful
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyHint icon={Star}>No written reviews yet — rate it after your first session.</EmptyHint>
      )}
    </div>
  );
}

function MediaTab({ game }: { game: Game }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h2 className="text-lg font-bold">Media</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <GameArt
            key={i}
            game={game}
            showTitle={false}
            iconSize="md"
            className={cn(
              "aspect-video rounded-lg",
              i % 3 === 1 && "brightness-90 hue-rotate-15",
              i % 3 === 2 && "brightness-110 saturate-150 -hue-rotate-15"
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Generated placeholder art — screenshots, trailers, and community clips land here once the media pipeline is connected.
      </p>
    </div>
  );
}

function UpdatesTab({ game }: { game: Game }) {
  const updates = newsFor(game.slug).filter((n) => n.kind === "Update" || n.kind === "Devlog");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-bold">Updates</h2>
        <p className="text-sm text-muted-foreground">
          Last updated {game.lastUpdate} · PlayBound keeps installs current automatically
        </p>
      </div>
      {updates.length > 0 ? (
        <div className="space-y-3">
          {updates.map((n) => (
            <article key={n.title} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge tone="play">{n.kind}</Badge> {n.date}
              </div>
              <h3 className="mt-2 font-bold">{n.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{n.summary}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyHint icon={Monitor}>
          Version history will appear here — automatic update checks run daily.
        </EmptyHint>
      )}
    </div>
  );
}
