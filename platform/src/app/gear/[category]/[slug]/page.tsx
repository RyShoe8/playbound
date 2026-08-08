import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { ShoppingCart } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Gear from "@/lib/models/Gear";
import GearRecommendation from "@/lib/models/GearRecommendation";
import Review from "@/lib/models/Review";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import { getGame } from "@/lib/catalog";
import { PlayboundCertifiedBadge } from "@/components/gear/PlayboundCertifiedBadge";
import { ReviewList, averageRating, RatingStars } from "@/components/reviews/ReviewList";
import { DiscussionBoard } from "@/components/discussion/DiscussionBoard";
import { CATEGORY_META, type DiscussionCategory } from "@/lib/discussion/categories";
import { gearScopedUgcFilter } from "@/lib/ugcTarget";
import { classifyMediaUrl, isPlayableVideoUrl } from "@/lib/mediaEmbed";
import { HlsVideo } from "@/components/HlsVideo";
import { cn } from "@/lib/utils";

const TABS = ["overview", "reviews", "discussion"] as const;
type Tab = (typeof TABS)[number];

const GEAR_DISCUSSION_CATEGORIES = (
  ["general", "help", "technical", "guides", "feedback", "announcements"] as DiscussionCategory[]
).map((id) => CATEGORY_META[id]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  await dbConnect();
  const gear = await Gear.findOne({ slug }).lean();

  if (!gear) {
    return { title: "Not Found" };
  }

  return {
    title: `${gear.title} · Playbound Gear`,
    description: gear.description,
  };
}

export default async function GearProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; category: string }>;
  searchParams: Promise<{
    tab?: string;
    category?: string;
    sort?: string;
    filter?: string;
    q?: string;
  }>;
}) {
  const { slug, category } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";

  await dbConnect();

  const gear = await Gear.findOne({ slug, status: "published" }).lean();
  if (!gear) {
    notFound();
  }

  const session = await getServerSession(authOptions);
  const categoryPath = String(gear.category || category).toLowerCase();

  const recommendations = await GearRecommendation.find({ gearSlug: gear.slug }).lean();
  const recommendedGames = [];
  for (const rec of recommendations) {
    const game = await getGame(rec.gameSlug);
    if (game) {
      recommendedGames.push({ game, rec });
    }
  }

  const activeLinks = (gear.affiliateLinks || []).filter((l: { isActive?: boolean }) => l.isActive);
  const videos = (gear.videos ?? [])
    .filter((src: string) => isPlayableVideoUrl(src))
    .map((src: string) => classifyMediaUrl(src));

  const reviewDocs = await Review.find({ ...gearScopedUgcFilter(gear.slug) })
    .sort({ createdAt: -1 })
    .limit(tab === "reviews" ? 50 : 30)
    .lean();
  const reviews = tab === "reviews" ? reviewDocs : [];
  const avg = averageRating(reviewDocs);

  let topics: Awaited<ReturnType<typeof loadTopics>> = [];
  let pinned: typeof topics = [];
  if (tab === "discussion") {
    topics = await loadTopics(gear.slug, sp);
    pinned = topics.filter((t) => t.isPinned);
    topics = topics.filter((t) => !t.isPinned);
  }

  const reviewCount = await Review.countDocuments({ ...gearScopedUgcFilter(gear.slug) });
  const discussionCount = await DiscussionTopic.countDocuments({
    ...gearScopedUgcFilter(gear.slug),
    status: { $ne: "removed" },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/gear" className="hover:text-foreground">
          Gear
        </Link>
        <span>/</span>
        <Link href={`/gear/${categoryPath}`} className="hover:text-foreground">
          {gear.category}
        </Link>
        <span>/</span>
        <span className="font-semibold text-foreground">{gear.title}</span>
      </div>

      <header className="space-y-3">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{gear.title}</h1>
        {gear.manufacturer && (
          <p className="text-sm text-muted-foreground">
            by <span className="font-semibold text-foreground">{gear.manufacturer}</span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {gear.playboundCertified && <PlayboundCertifiedBadge />}
          {avg != null && (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <RatingStars value={avg} size="size-3.5" />
              {avg.toFixed(1)}
              <span className="font-normal text-muted-foreground">({reviewCount})</span>
            </span>
          )}
        </div>
      </header>

      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border pb-px">
        {(
          [
            ["overview", "Overview"],
            ["reviews", `Reviews${reviewCount ? ` (${reviewCount})` : ""}`],
            ["discussion", `Discussion${discussionCount ? ` (${discussionCount})` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <Link
            key={id}
            href={`/gear/${categoryPath}/${slug}?tab=${id}`}
            className={cn(
              "shrink-0 border-b-2 px-4 py-2.5 text-sm font-bold transition-colors",
              tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-12">
          <div className="grid gap-12 md:grid-cols-2">
            <div className="space-y-4">
              {gear.coverImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={gear.coverImage}
                  alt={gear.title}
                  className="w-full rounded-2xl border border-border bg-secondary/20 object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-border bg-secondary/50">
                  <span className="tracking-widest text-muted-foreground uppercase">
                    {gear.category}
                  </span>
                </div>
              )}
              {(gear.screenshots?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {gear.screenshots!.slice(0, 8).map((url: string, i: number) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt=""
                      className="h-20 w-auto rounded-md border border-border object-cover"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-muted-foreground">Platforms:</span>
                  {gear.platforms?.length > 0 ? (
                    gear.platforms.map((p: string) => (
                      <span
                        key={p}
                        className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground"
                      >
                        {p}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground">Not listed</span>
                  )}
                </div>

                {gear.bestFor?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-muted-foreground">Best for:</span>
                    {gear.bestFor.map((b: string) => (
                      <span
                        key={b}
                        className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                )}

                <p className="pt-2 text-lg leading-relaxed whitespace-pre-line text-muted-foreground">
                  {gear.description}
                </p>
              </div>

              <div className="space-y-4 border-t border-border pt-4">
                <h3 className="text-lg font-bold">Where to buy</h3>
                {activeLinks.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {activeLinks.map(
                      (
                        link: {
                          url: string;
                          retailer: string;
                          price?: string | null;
                          shipping?: string | null;
                        },
                        i: number
                      ) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="nofollow noopener noreferrer"
                          className="inline-flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-secondary/20"
                        >
                          <div className="flex items-center gap-3 text-lg font-semibold">
                            <ShoppingCart className="size-5 text-primary" />
                            {link.retailer}
                          </div>
                          <div className="text-right">
                            {link.price && <div className="font-bold">{link.price}</div>}
                            {link.shipping && (
                              <div className="text-xs text-muted-foreground">{link.shipping}</div>
                            )}
                          </div>
                        </a>
                      )
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No purchase links available.</p>
                )}
              </div>
            </div>
          </div>

          {videos.length > 0 && (
            <section className="space-y-4 border-t border-border pt-8">
              <h2 className="text-2xl font-bold">Videos</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {videos.map((media: ReturnType<typeof classifyMediaUrl>, i: number) => (
                  <div
                    key={i}
                    className="overflow-hidden rounded-xl border border-border bg-black/40"
                  >
                    {media.kind === "youtube" || media.kind === "vimeo" ? (
                      <iframe
                        src={media.embedUrl}
                        title={`${gear.title} video ${i + 1}`}
                        className="aspect-video w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <HlsVideo src={media.src} className="aspect-video w-full" />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {recommendedGames.length > 0 && (
            <div className="space-y-6 border-t border-border pt-8">
              <h2 className="text-2xl font-bold">
                Officially tested with {recommendedGames.length} game
                {recommendedGames.length === 1 ? "" : "s"}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recommendedGames.map(({ game, rec }: { game: { slug: string; title: string; coverImage?: string | null }; rec: { rank?: string; notes?: string } }) => (
                  <Link
                    key={game.slug}
                    href={`/games/${game.slug}`}
                    className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    {game.coverImage ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={game.coverImage} alt="" className="h-16 w-16 rounded object-cover" />
                    ) : (
                      <div className="h-16 w-16 rounded bg-secondary/50" />
                    )}
                    <div>
                      <h3 className="font-bold hover:underline">{game.title}</h3>
                      {rec.rank && <div className="mt-1 text-xl leading-none">{rec.rank}</div>}
                      {rec.notes && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{rec.notes}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "reviews" && (
        <ReviewList
          gearSlug={gear.slug}
          gearCategory={categoryPath}
          isSignedIn={Boolean(session?.user)}
          items={reviews}
        />
      )}

      {tab === "discussion" && (
        <DiscussionBoard
          gearSlug={gear.slug}
          gearCategory={categoryPath}
          gameTitle={gear.title}
          isSignedIn={Boolean(session?.user)}
          categories={GEAR_DISCUSSION_CATEGORIES}
          topics={topics}
          pinned={pinned}
          query={{
            category: sp.category,
            sort: sp.sort,
            filter: sp.filter,
            q: sp.q,
          }}
        />
      )}
    </div>
  );
}

async function loadTopics(
  gearSlug: string,
  sp: { category?: string; sort?: string; filter?: string; q?: string }
) {
  const query: Record<string, unknown> = {
    ...gearScopedUgcFilter(gearSlug),
    status: { $ne: "removed" },
  };

  if (sp.category && sp.category !== "all" && sp.category in CATEGORY_META) {
    query.category = sp.category;
  }
  if (sp.filter === "unanswered") {
    query.replyCount = 0;
    query.isSolved = false;
  } else if (sp.filter === "solved") {
    query.isSolved = true;
  } else if (sp.filter === "pinned") {
    query.isPinned = true;
  }
  if (sp.q?.trim()) {
    query.$text = { $search: sp.q.trim() };
  }

  let sortSpec: Record<string, 1 | -1> = { isPinned: -1, lastReplyAt: -1, createdAt: -1 };
  if (sp.sort === "newest") sortSpec = { isPinned: -1, createdAt: -1 };
  else if (sp.sort === "replies") sortSpec = { isPinned: -1, replyCount: -1, lastReplyAt: -1 };

  const docs = await DiscussionTopic.find(query).sort(sortSpec).limit(40).lean();
  return docs.map((t) => ({
    _id: String(t._id),
    slug: t.slug,
    title: t.title,
    category: t.category as DiscussionCategory,
    replyCount: t.replyCount,
    viewCount: t.viewCount,
    isPinned: Boolean(t.isPinned),
    isSolved: Boolean(t.isSolved),
    status: t.status,
    lastReplyAt: t.lastReplyAt,
    createdAt: t.createdAt,
    authorUsername: t.authorUsername,
    lastReplyUsername: t.lastReplyUsername ?? null,
  }));
}
