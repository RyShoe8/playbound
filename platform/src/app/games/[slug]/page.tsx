import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { Gamepad2, MessagesSquare, Newspaper, Star, Trophy, Wrench } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import GuidePost from "@/lib/models/GuidePost";
import DiscussionPost from "@/lib/models/DiscussionPost";
import LibraryEntry from "@/lib/models/LibraryEntry";
import { fetchGithubReleases } from "@/lib/github";
import { collectionsFeaturing, developersBySlug, listGames, getGame } from "@/lib/catalog";
import type { Game } from "@/lib/data/types";
import { GameArt } from "@/components/GameArt";
import { CardRow, GameCard, LaunchBadge, PlayCta } from "@/components/GameCard";
import { AddToLibraryButton } from "@/components/AddToLibraryButton";
import { ContentForm } from "@/components/ContentForm";
import { ServerBrowser } from "@/components/ServerBrowser";
import { Avatar, Badge, EmptyHint } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { modsForGame, type CatalogModPublic } from "@/lib/mods";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";

const tabs = ["overview", "servers", "mods", "guides", "achievements", "news", "discussion", "reviews", "media"] as const;
type Tab = (typeof tabs)[number];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await getGame(slug);
  return { title: game ? game.title : "Game Not Found" };
}

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    await dbConnect();
    return await fn();
  } catch (err) {
    console.error("DB query failed:", err);
    return fallback;
  }
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
  const game = await getGame(slug);
  if (!game) notFound();

  const tab: Tab = tabs.includes(rawTab as Tab) ? (rawTab as Tab) : "overview";
  const session = await getServerSession(authOptions);
  const developer = developersBySlug.get(game.developerSlug);
  const allGames = await listGames();
  const similar = allGames
    .filter((g) => g.slug !== game.slug && g.genres.some((genre) => game.genres.includes(genre)))
    .slice(0, 6);

  let initiallySaved = false;
  if (session?.user) {
    try {
      await dbConnect();
      const entry = await LibraryEntry.findOne({
        userId: session.user.id,
        gameSlug: game.slug,
        saved: true,
      }).lean();
      initiallySaved = Boolean(entry);
    } catch {
      /* ignore */
    }
  }

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
                <LaunchBadge game={game} />
                {game.genres.map((g) => (
                  <Badge key={g} tone="outline">
                    {g}
                  </Badge>
                ))}
              </div>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{game.title}</h1>
              <p className="mt-2 text-muted-foreground sm:text-lg">{game.tagline}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PlayCta game={game} size="lg" />
              <AddToLibraryButton
                slug={game.slug}
                initiallySaved={initiallySaved}
                signedIn={Boolean(session?.user)}
                size="lg"
              />
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
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-8 sm:px-6 lg:px-8">
        {tab === "overview" && (
          <OverviewTab game={game} developer={developer} featuring={collectionsFeaturing(game.slug)} similar={similar} />
        )}
        {tab === "servers" && <ServersTab game={game} />}
        {tab === "mods" && <ModsTab game={game} />}
        {tab === "guides" && (
          <GuidesTab
            gameSlug={game.slug}
            isSignedIn={Boolean(session?.user)}
            items={await safeQuery(() => GuidePost.find({ gameSlug: game.slug }).sort({ createdAt: -1 }).limit(30).lean(), [])}
          />
        )}
        {tab === "achievements" && <AchievementsTab />}
        {tab === "news" && (
          <NewsTab
            game={game}
            releases={game.githubRepo ? await fetchGithubReleases(game.githubRepo) : []}
          />
        )}
        {tab === "discussion" && (
          <DiscussionTab
            gameSlug={game.slug}
            isSignedIn={Boolean(session?.user)}
            items={await safeQuery(() => DiscussionPost.find({ gameSlug: game.slug }).sort({ createdAt: -1 }).limit(30).lean(), [])}
          />
        )}
        {tab === "reviews" && (
          <ReviewsTab
            gameSlug={game.slug}
            isSignedIn={Boolean(session?.user)}
            items={await safeQuery(() => Review.find({ gameSlug: game.slug }).sort({ createdAt: -1 }).limit(30).lean(), [])}
          />
        )}
        {tab === "media" && <MediaTab game={game} />}
      </div>
    </div>
  );
}

/* ────────────────────────── Tabs ────────────────────────── */

function OverviewTab({
  game,
  developer,
  featuring,
  similar,
}: {
  game: Game;
  developer: ReturnType<typeof developersBySlug.get>;
  featuring: ReturnType<typeof collectionsFeaturing>;
  similar: Game[];
}) {
  if (!game) return null;
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
            <h2 className="mb-4 text-lg font-bold">More Like This</h2>
            <CardRow>
              {similar.map((g) => g && <GameCard key={g.slug} game={g} />)}
            </CardRow>
          </section>
        )}
      </div>

      <aside className="space-y-4">
        {developer && (
          <Link
            href={`/developers/${developer.slug}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <Avatar name={developer.name} hue={developer.artHue} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-bold">{developer.name}</p>
              <p className="text-xs text-muted-foreground">{developer.tagline}</p>
            </div>
          </Link>
        )}
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
          {[
            ["Released", String(game.releaseYear)],
            ["License", game.license],
            ["Platforms", game.platforms.join(", ")],
            ["Download size", game.sizeMB >= 1000 ? `${(game.sizeMB / 1000).toFixed(1)} GB` : `${game.sizeMB} MB`],
            ["Launch", game.launchMethods.map((m) => (m === "install" ? "Install" : m === "server" ? "Dedicated Servers" : "Browser")).join(" · ")],
            ["Steam Deck", game.steamDeck ? "Compatible" : "Untested"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">{k}</span>
              <span className="text-right font-medium">{v}</span>
            </div>
          ))}
          <a href={game.website} target="_blank" rel="noreferrer" className="block pt-1 text-sm font-semibold text-primary hover:underline">
            Official website →
          </a>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tags</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {game.tags.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
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
  return (
    <ServerBrowser
      slug={game.slug}
      title={game.title}
      supportsServers={game.launchMethods.includes("server")}
    />
  );
}

async function ModsTab({ game }: { game: Game }) {
  const mods = await modsForGame(game.slug);

  if (mods.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyHint icon={Wrench}>
          {game.features.some((f) => f.toLowerCase().includes("mod"))
            ? `No PlayBound-listed mods for ${game.title} yet — check back soon or the official community hub.`
            : `${game.title} doesn't have documented mods on PlayBound yet.`}
        </EmptyHint>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">Mods for {game.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Install packageable mods with the PlayBound Launcher, or open hub pages for browse-only content.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mods.map((mod) => (
          <ModCard key={mod.slug} mod={mod} />
        ))}
      </div>
    </div>
  );
}

function ModCard({ mod }: { mod: CatalogModPublic }) {
  const isExternal = mod.downloadKind === "external";
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4">
      <Link href={`/mods/${mod.slug}`} className="font-bold hover:text-primary">
        {mod.title}
      </Link>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{mod.tagline}</p>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {isExternal
          ? "Opens in your browser via the launcher"
          : `Installs to ${mod.installRelativePath || "(game root)"}`}
        {mod.sizeMB ? ` · ~${mod.sizeMB} MB` : ""}
      </p>
      <div className="mt-auto flex flex-wrap items-start gap-2 pt-4">
        <LauncherInstallButton
          slug={mod.slug}
          kind="install-mod"
          label={isExternal ? "Open with launcher" : "Install mod"}
          className="bg-play text-play-foreground border-transparent px-3 py-1.5 text-xs"
        />
        <Link
          href={`/mods/${mod.slug}`}
          className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
        >
          Details
        </Link>
      </div>
    </div>
  );
}

function AchievementsTab() {
  return (
    <div className="mx-auto max-w-2xl">
      <EmptyHint icon={Trophy}>Platform-wide achievements are planned but not tracked yet.</EmptyHint>
    </div>
  );
}

function NewsTab({
  game,
  releases,
}: {
  game: Game;
  releases: Awaited<ReturnType<typeof fetchGithubReleases>>;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h2 className="text-lg font-bold">Releases</h2>
      {releases.length > 0 ? (
        <div className="space-y-3">
          {releases.map((r) => (
            <a
              key={r.tagName}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge tone="brand">
                  <Newspaper className="size-3" /> GitHub Release
                </Badge>
                {r.publishedAt && new Date(r.publishedAt).toLocaleDateString()}
              </div>
              <h3 className="mt-2 font-bold">{r.name}</h3>
              {r.body && <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{r.body}</p>}
            </a>
          ))}
        </div>
      ) : (
        <EmptyHint icon={Newspaper}>
          No release notes available from GitHub for {game.title}.{" "}
          <a href={game.website} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
            Check the official site
          </a>{" "}
          for updates.
        </EmptyHint>
      )}
    </div>
  );
}

interface PostDoc {
  _id: string;
  username: string;
  title: string;
  body: string;
  createdAt: string | Date;
  rating?: number;
}

function DiscussionTab({ gameSlug, isSignedIn, items }: { gameSlug: string; isSignedIn: boolean; items: PostDoc[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Discussion</h2>
        <ContentForm kind="discussion" gameSlug={gameSlug} isSignedIn={isSignedIn} />
      </div>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((d) => (
            <div key={String(d._id)} className="rounded-xl border border-border bg-card p-4">
              <p className="flex items-center gap-2 font-semibold">
                <MessagesSquare className="size-4 shrink-0 text-muted-foreground" /> {d.title}
              </p>
              <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">{d.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {d.username} · {new Date(d.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint icon={MessagesSquare}>No discussion yet — be the first.</EmptyHint>
      )}
    </div>
  );
}

function GuidesTab({ gameSlug, isSignedIn, items }: { gameSlug: string; isSignedIn: boolean; items: PostDoc[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Guides</h2>
        <ContentForm kind="guide" gameSlug={gameSlug} isSignedIn={isSignedIn} />
      </div>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((g) => (
            <div key={String(g._id)} className="rounded-xl border border-border bg-card p-4">
              <p className="font-semibold">{g.title}</p>
              <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{g.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {g.username} · {new Date(g.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>No guides yet — be the first to write one.</EmptyHint>
      )}
    </div>
  );
}

function ReviewsTab({ gameSlug, isSignedIn, items }: { gameSlug: string; isSignedIn: boolean; items: PostDoc[] }) {
  const avg = items.length > 0 ? items.reduce((s, r) => s + (r.rating ?? 0), 0) / items.length : 0;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-4xl font-extrabold">{items.length > 0 ? avg.toFixed(1) : "—"}</p>
            <div className="mt-1 flex justify-center">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={cn("size-4", i <= Math.round(avg) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {items.length} player review{items.length === 1 ? "" : "s"}
          </p>
        </div>
        <ContentForm kind="review" gameSlug={gameSlug} isSignedIn={isSignedIn} />
      </div>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((r) => (
            <article key={String(r._id)} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold">&ldquo;{r.title}&rdquo;</p>
                <span className="flex items-center gap-1 text-sm font-semibold">
                  <Star className="size-3.5 fill-amber-400 text-amber-400" /> {r.rating}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{r.body}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {r.username} · {new Date(r.createdAt).toLocaleDateString()}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyHint icon={Star}>No reviews yet — rate it after your first session.</EmptyHint>
      )}
    </div>
  );
}

function MediaTab({ game }: { game: Game }) {
  const shots = game.screenshots?.length
    ? game.screenshots
    : game.coverImage
      ? [game.coverImage]
      : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h2 className="text-lg font-bold">Media</h2>
      {shots.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shots.map((src) => (
            <a
              key={src}
              href={src}
              target="_blank"
              rel="noreferrer"
              className="relative aspect-video overflow-hidden rounded-lg border border-border bg-secondary"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`${game.title} screenshot`} className="h-full w-full object-cover" />
            </a>
          ))}
          {game.coverImage && !shots.includes(game.coverImage) && (
            <div className="relative aspect-video overflow-hidden rounded-lg border border-border">
              <GameArt game={game} showTitle={false} className="absolute inset-0" />
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <GameArt game={game} showTitle={false} iconSize="md" className="aspect-video rounded-lg" />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        More screenshots and trailers live on{" "}
        <a href={game.website} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
          the official {game.title} site
        </a>
        .
      </p>
    </div>
  );
}
