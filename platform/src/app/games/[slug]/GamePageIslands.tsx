import Link from "next/link";
import { headers } from "next/headers";
import { getServerSession } from "next-auth/next";
import { Play } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import Review from "@/lib/models/Review";
import LibraryEntry from "@/lib/models/LibraryEntry";
import { collectionsFeaturing, listGames } from "@/lib/catalog";
import { platformFromUserAgent, visiblePlatformsFor } from "@/lib/libraryPlatform";
import { getDiscordPresence } from "@/lib/discordPresence";
import {
  getGameLiveStats,
  getGameTopPlayers,
  getEditionLiveStats,
} from "@/lib/liveActivity";
import { gameScopedUgcFilter } from "@/lib/ugcTarget";
import { issueForGame } from "@/lib/weekly";
import { AdaptiveAddToLibraryButton } from "@/components/AdaptiveAddToLibraryButton";
import { PlayCta } from "@/components/GameCard";
import { PlayingNowBadge } from "@/components/ActivityStats";
import { ActivityStatsCard } from "@/components/ActivityStatsCard";
import { CommunityCard } from "@/components/discussion/CommunityCard";
import { CompatibleMoreLikeThis } from "@/components/CompatibleGameCardGrid";
import { EditionsSection } from "@/components/editions/EditionsSection";
import { GameIncompatibilityBanner } from "@/components/GameIncompatibilityBanner";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
import type { Game } from "@/lib/data/types";
import type { Edition } from "@/lib/editionTypes";

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    await dbConnect();
    return await fn();
  } catch (err) {
    console.error("DB query failed:", err);
    return fallback;
  }
}

function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted/50 ${className ?? ""}`} />;
}

/** Hero playing-now — master / telemetry work streams after first paint. */
export async function GameHeroPlayingNow({ slug }: { slug: string }) {
  const liveStats = await getGameLiveStats(slug);
  return (
    <PlayingNowBadge
      count={liveStats.playingNow}
      className="border-white/15 bg-black/40 text-white"
    />
  );
}

export function GameHeroPlayingNowFallback() {
  return <Pulse className="h-6 w-28 rounded-full" />;
}

async function resolveInitiallyInLibrary(gameSlug: string): Promise<{
  signedIn: boolean;
  initiallyInLibrary: boolean;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { signedIn: false, initiallyInLibrary: false };

  try {
    await dbConnect();
    const viewerPlatform = platformFromUserAgent((await headers()).get("user-agent"));
    const visible = visiblePlatformsFor(viewerPlatform);
    const entry = await LibraryEntry.findOne({
      userId: session.user.id,
      gameSlug,
      installed: true,
      $or: [
        { platform: { $in: visible } },
        ...(viewerPlatform === "desktop"
          ? [{ platform: { $exists: false } }, { platform: null }]
          : []),
      ],
    }).lean();
    return { signedIn: true, initiallyInLibrary: Boolean(entry) };
  } catch {
    return { signedIn: true, initiallyInLibrary: false };
  }
}

/** Hero CTAs that need library membership — keep Play ready without waiting. */
export async function GameHeroActions({
  game,
  choosable,
}: {
  game: Game;
  choosable: boolean;
}) {
  const { signedIn, initiallyInLibrary } = await resolveInitiallyInLibrary(game.slug);
  return (
    <>
      {choosable ? (
        <Link
          href="#editions"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-play px-7 text-base font-bold text-play-foreground shadow-[0_0_24px_-6px_var(--play)] transition-all hover:brightness-110 active:translate-y-px"
        >
          <Play className="size-5" />
          Choose an edition
        </Link>
      ) : (
        <PlayCta game={game} size="lg" />
      )}
      <AdaptiveAddToLibraryButton
        game={game}
        initiallyInLibrary={initiallyInLibrary}
        signedIn={signedIn}
        size="lg"
      />
    </>
  );
}

export function GameHeroActionsFallback({
  game,
  choosable,
}: {
  game: Game;
  choosable: boolean;
}) {
  return (
    <>
      {choosable ? (
        <Link
          href="#editions"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-play px-7 text-base font-bold text-play-foreground shadow-[0_0_24px_-6px_var(--play)] transition-all hover:brightness-110 active:translate-y-px"
        >
          <Play className="size-5" />
          Choose an edition
        </Link>
      ) : (
        <PlayCta game={game} size="lg" />
      )}
      <AdaptiveAddToLibraryButton
        game={game}
        initiallyInLibrary={false}
        signedIn={false}
        size="lg"
      />
    </>
  );
}

export async function GameIncompatibilityBannerAsync({ game }: { game: Game }) {
  const { signedIn, initiallyInLibrary } = await resolveInitiallyInLibrary(game.slug);
  return (
    <GameIncompatibilityBanner
      game={game}
      initiallyInLibrary={initiallyInLibrary}
      signedIn={signedIn}
    />
  );
}

export async function GameTabCount({
  gameSlug,
  kind,
}: {
  gameSlug: string;
  kind: "discussion" | "reviews";
}) {
  const count =
    kind === "discussion"
      ? await safeQuery(
          () =>
            DiscussionTopic.countDocuments({
              gameSlug,
              ...gameScopedUgcFilter(),
              status: { $ne: "removed" },
            }),
          0
        )
      : await safeQuery(
          () => Review.countDocuments({ gameSlug, ...gameScopedUgcFilter() }),
          0
        );
  if (count <= 0) return null;
  return <span className="ml-1 text-xs font-normal text-muted-foreground">{count}</span>;
}

export async function GameEditionsBlock({
  game,
  editions,
}: {
  game: Game;
  editions: Edition[];
}) {
  const settled = await Promise.allSettled(
    editions.map((e) => getEditionLiveStats(game.slug, e.slug))
  );
  const playingNowBySlug: Record<string, number> = {};
  editions.forEach((e, i) => {
    const r = settled[i];
    if (r?.status === "fulfilled") {
      playingNowBySlug[e.slug] = r.value.playingNow;
    }
  });
  return (
    <EditionsSection game={game} editions={editions} playingNowBySlug={playingNowBySlug} />
  );
}

export async function GameWhyIssueLink({ gameSlug }: { gameSlug: string }) {
  const issue = await issueForGame(gameSlug);
  if (!issue) return null;
  return (
    <p className="mt-3 text-sm">
      <Link
        href={`/weekly/${issue.slug}`}
        className="font-semibold text-primary hover:underline"
      >
        Featured in PlayBound Weekly, week {issue.week} of {issue.year} →
      </Link>
    </p>
  );
}

export async function GameSimilarBlock({ game }: { game: Game }) {
  const includeTesting = await viewerCanSeeTesting();
  const allGames = await listGames({ includeTesting });
  const similar = allGames
    .filter((g) => g.slug !== game.slug && g.genres.some((genre) => game.genres.includes(genre)))
    .slice(0, 20);
  if (similar.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 text-lg font-bold">More Like This</h2>
      <CompatibleMoreLikeThis games={similar} />
    </section>
  );
}

export function GameSimilarFallback() {
  return (
    <section>
      <h2 className="mb-4 text-lg font-bold">More Like This</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Pulse key={i} className="aspect-[16/10] w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}

export async function GameActivityAside({ gameSlug }: { gameSlug: string }) {
  const [liveStats, topPlayers] = await Promise.all([
    getGameLiveStats(gameSlug),
    getGameTopPlayers(gameSlug),
  ]);
  const installTotal = liveStats.installsAllTime ?? 0;
  return (
    <ActivityStatsCard
      playingNow={liveStats.playingNow}
      topPlayers={topPlayers}
      rows={[
        { label: "Players this month", value: liveStats.playersThisMonth },
        ...(liveStats.multiplayerPlayers > 0
          ? [{ label: "On multiplayer servers", value: liveStats.multiplayerPlayers }]
          : []),
        ...(liveStats.serverCount > 0
          ? [{ label: "Live servers", value: liveStats.serverCount }]
          : []),
        ...(installTotal > 0 ? [{ label: "Installs", value: installTotal }] : []),
        ...(liveStats.installsThisMonth > 0
          ? [{ label: "Installs this month", value: liveStats.installsThisMonth }]
          : []),
      ]}
    />
  );
}

export function GameActivityAsideFallback() {
  return <Pulse className="h-48 w-full rounded-xl" />;
}

export async function GameCommunityAside({ game }: { game: Game }) {
  const presence = await getDiscordPresence(game.communityLinks?.playboundDiscord?.guildId);
  return (
    <CommunityCard
      gameSlug={game.slug}
      gameTitle={game.title}
      communityLinks={game.communityLinks}
      presence={presence}
    />
  );
}

export async function GameFeaturingAside({ gameSlug }: { gameSlug: string }) {
  const featuring = await collectionsFeaturing(gameSlug);
  if (featuring.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Featured in
      </p>
      <div className="mt-2 space-y-1.5">
        {featuring.map((c) => (
          <Link
            key={c.slug}
            href={`/collections/${c.slug}`}
            className="block text-sm font-medium hover:text-primary hover:underline"
          >
            {c.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
