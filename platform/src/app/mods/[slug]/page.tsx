import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { Monitor, Play, Puzzle, Terminal } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import Review from "@/lib/models/Review";
import GuidePost from "@/lib/models/GuidePost";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import { getMod } from "@/lib/mods";
import { getGame } from "@/lib/catalog";
import { viewerIsAdmin } from "@/lib/requestIncludesTesting";
import { isLauncherInstallable, launcherPlayModUrl } from "@/lib/launcher";
import { Badge, EmptyHint } from "@/components/ui/bits";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { ModArt } from "@/components/ModArt";
import { ContentForm } from "@/components/ContentForm";
import { ReviewList } from "@/components/reviews/ReviewList";
import { DiscussionBoard } from "@/components/discussion/DiscussionBoard";
import { ScrollActiveTab } from "@/components/discussion/ScrollActiveTab";
import { CATEGORY_META, visibleCategories } from "@/lib/discussion/categories";
import { pageMetadata, privateMetadata, sizeLabel } from "@/lib/seo";
import { resolveModVisual } from "@/lib/modMedia";
import {
  JsonLd,
  graph,
  faqSchema,
  breadcrumbSchema,
  ORGANIZATION_ID,
} from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";
import { getModLiveStats } from "@/lib/liveActivity";
import { PlayingNowBadge } from "@/components/ActivityStats";
import { ActivityStatsCard } from "@/components/ActivityStatsCard";
import { cn } from "@/lib/utils";
import { TelemetryOnce } from "@/components/TelemetryOnce";

const PLATFORM_LABELS: Record<string, string> = {
  all: "All platforms",
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

const MOD_TABS = ["overview", "guides", "discussion", "reviews"] as const;
type ModTab = (typeof MOD_TABS)[number];

function isModTab(v: string | undefined): v is ModTab {
  return Boolean(v && (MOD_TABS as readonly string[]).includes(v));
}

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const includeTesting = await viewerIsAdmin();
  const mod = await getMod(slug, { includeTesting });
  if (!mod) return { title: "Mod Not Found" };
  if (mod.status === "testing") return privateMetadata(mod.title);

  const baseGame = await getGame(mod.baseGameSlug, { includeTesting });
  const base = baseGame?.title ?? mod.baseGameSlug;

  return pageMetadata({
    title: `${mod.title} — Free ${base} Mod`,
    description: `${mod.whatItChanges || mod.tagline} Free add-on for ${base}${mod.sizeMB ? `, roughly ${sizeLabel(mod.sizeMB)}` : ""}. One-click install through PlayBound.`,
    path: `/mods/${mod.slug}`,
    images: (() => {
      const visual = resolveModVisual(mod, baseGame);
      return visual.kind === "image" ? [visual.url] : undefined;
    })(),
  });
}

export default async function ModPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    tab?: string;
    category?: string;
    sort?: string;
    filter?: string;
    q?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tab: ModTab = isModTab(sp.tab) ? sp.tab : "overview";
  const includeTesting = await viewerIsAdmin();
  const mod = await getMod(slug, { includeTesting });
  if (!mod) notFound();

  const session = await getServerSession(authOptions);
  const baseGame = await getGame(mod.baseGameSlug, { includeTesting });
  const canOneClickBase = baseGame ? isLauncherInstallable(baseGame) : false;

  let modInstalled = false;
  if (mod.downloadKind !== "external") {
    try {
      if (session?.user?.id) {
        await dbConnect();
        const entry = await LibraryModEntry.findOne({
          userId: session.user.id,
          modSlug: mod.slug,
          installed: true,
        })
          .select("_id")
          .lean();
        modInstalled = Boolean(entry);
      }
    } catch (err) {
      console.error("Mod page library load failed:", err);
    }
  }

  const base = baseGame?.title ?? mod.baseGameSlug;
  const showPlay = modInstalled && canOneClickBase;
  const liveStats = await getModLiveStats(mod.slug);
  const isSignedIn = Boolean(session?.user);

  return (
    <div>
      <JsonLd
        data={graph(
          {
            "@type": "SoftwareApplication",
            name: mod.title,
            url: absoluteUrl(`/mods/${mod.slug}`),
            description: mod.longDescription || mod.description,
            applicationCategory: "Game",
            applicationSubCategory: "Game Modification",
            license: mod.license,
            isAccessibleForFree: true,
            ...(mod.sizeMB ? { fileSize: `${mod.sizeMB} MB` } : {}),
            ...(mod.githubRepo
              ? { sameAs: [`https://github.com/${mod.githubRepo}`, mod.website] }
              : { sameAs: [mod.website] }),
            publisher: { "@id": ORGANIZATION_ID },
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            ...(baseGame
              ? {
                  requirements: `Requires ${baseGame.title}`,
                  isPartOf: {
                    "@type": "VideoGame",
                    name: baseGame.title,
                    url: absoluteUrl(`/games/${baseGame.slug}`),
                  },
                }
              : {}),
          },
          mod.installSteps?.length
            ? {
                "@type": "HowTo",
                name: `How to install ${mod.title} for ${base}`,
                description: `Step-by-step instructions for installing ${mod.title}, a free add-on for ${base}.`,
                estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
                step: mod.installSteps.map((s, i) => ({
                  "@type": "HowToStep",
                  position: i + 1,
                  name: `Step ${i + 1}`,
                  text: s.command ? `${s.text} Command: ${s.command}` : s.text,
                })),
              }
            : null,
          faqSchema(mod.faq ?? []),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Mods", path: "/mods" },
            { name: mod.title, path: `/mods/${mod.slug}` },
          ])
        )}
      />

      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-8 sm:px-6 lg:px-8">
        <div className="space-y-3">
          <ModArt
            mod={mod}
            baseGame={baseGame}
            className="h-48 w-full rounded-xl sm:h-56"
            alt={`${mod.title} cover`}
          />
          <Badge tone="brand">
            <Puzzle className="size-3" /> Mod
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight">{mod.title}</h1>
          <p className="text-lg text-muted-foreground">{mod.tagline}</p>
          <PlayingNowBadge count={liveStats.playingNow} />
          {baseGame && (
            <p className="text-sm text-muted-foreground">
              For{" "}
              <Link
                href={`/games/${baseGame.slug}`}
                className="font-semibold text-primary hover:underline"
              >
                {baseGame.title}
              </Link>
              {baseGame.launchMethods.includes("server") && (
                <>
                  {" · "}
                  <Link
                    href={`/servers?game=${encodeURIComponent(baseGame.slug)}&mod=${encodeURIComponent(mod.slug)}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    Browse servers
                  </Link>
                </>
              )}
            </p>
          )}
        </div>

        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border pb-px">
          <ScrollActiveTab activeKey={tab} />
          {MOD_TABS.map((t) => (
            <Link
              key={t}
              data-tab={t}
              href={t === "overview" ? `/mods/${mod.slug}` : `/mods/${mod.slug}?tab=${t}`}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold capitalize transition-colors",
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </Link>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {tab === "overview" && (
          <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-8">
              {mod.whatItChanges && (
                <section className="rounded-xl border-l-4 border-primary bg-card p-5">
                  <h2 className="text-xs font-semibold tracking-wide text-primary uppercase">
                    What it changes
                  </h2>
                  <p className="mt-2 leading-relaxed">{mod.whatItChanges}</p>
                </section>
              )}

              <section>
                <h2 className="sr-only">About {mod.title}</h2>
                {mod.longDescription ? (
                  <div className="space-y-4 leading-relaxed text-muted-foreground">
                    {mod.longDescription.split("\n\n").map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {mod.description}
                  </p>
                )}
              </section>

              {mod.compatibility && (
                <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
                  <span className="font-semibold">Compatibility: </span>
                  <span className="text-muted-foreground">{mod.compatibility}</span>
                </p>
              )}

              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold">
                  {mod.downloadKind === "external"
                    ? "Download page"
                    : "Install with the PlayBound Launcher"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {mod.downloadKind === "external" ? (
                    <>
                      This package isn&apos;t one-click yet. Open the official download page in your
                      browser, then place files in the game&apos;s mods folder.
                    </>
                  ) : (
                    <>
                      The launcher installs this into{" "}
                      <code className="text-play">
                        {mod.installRelativePath ? `${mod.installRelativePath}/` : "(game root)"}
                      </code>
                      {baseGame ? ` for ${baseGame.title}` : ""}. If the base game is missing, it will
                      install that first.
                    </>
                  )}
                </p>
                <div className="flex flex-wrap items-start gap-4">
                  {showPlay ? (
                    <a
                      href={launcherPlayModUrl(mod.slug)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-play px-4 py-2 text-sm font-bold text-play-foreground hover:brightness-110"
                    >
                      <Play className="size-4 fill-current" /> Play {base}
                    </a>
                  ) : null}
                  {mod.downloadKind === "external" ? (
                    <a
                      href={mod.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-full bg-play px-4 py-2 text-sm font-bold text-play-foreground"
                    >
                      Open download page
                    </a>
                  ) : (
                    <LauncherInstallButton
                      slug={mod.slug}
                      kind="install-mod"
                      label={showPlay ? "Reinstall mod" : "Install mod"}
                      className={
                        showPlay
                          ? "border border-border bg-secondary"
                          : "border-transparent bg-play text-play-foreground"
                      }
                    />
                  )}
                  {canOneClickBase && !showPlay && (
                    <LauncherInstallButton
                      slug={mod.baseGameSlug}
                      label={`Install ${baseGame?.title ?? "base game"}`}
                    />
                  )}
                  {baseGame && (
                    <Link
                      href={`/games/${baseGame.slug}?tab=mods`}
                      className="inline-flex items-center rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold"
                    >
                      All mods for {baseGame.title}
                    </Link>
                  )}
                </div>
              </div>

              {mod.installSteps?.length ? (
                <section>
                  <h2 className="text-xl font-bold">How to install {mod.title}</h2>
                  <ol className="mt-4 space-y-3">
                    {mod.installSteps.map((step, i) => (
                      <li key={i} className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            {step.platform !== "all" && (
                              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
                                <Monitor className="size-3" />
                                {PLATFORM_LABELS[step.platform] ?? step.platform}
                              </p>
                            )}
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {step.text}
                            </p>
                            {step.command && (
                              <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-2.5 text-xs">
                                <code className="flex items-center gap-2">
                                  <Terminal className="size-3 shrink-0 text-primary" />
                                  {step.command}
                                </code>
                              </pre>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {mod.faq?.length ? (
                <section>
                  <h2 className="text-xl font-bold">
                    Frequently asked questions about {mod.title}
                  </h2>
                  <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
                    {mod.faq.map((item) => (
                      <div key={item.q} className="p-4">
                        <h3 className="font-semibold">{item.q}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                          {item.a}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="min-w-0 space-y-4">
              <ActivityStatsCard
                playingNow={liveStats.playingNow}
                rows={[
                  { label: "Players this month", value: liveStats.playersThisMonth },
                  ...(liveStats.installsThisMonth > 0
                    ? [{ label: "Installs this month", value: liveStats.installsThisMonth }]
                    : []),
                  ...(liveStats.installsAllTime != null && liveStats.installsAllTime > 0
                    ? [{ label: "Total installs", value: liveStats.installsAllTime }]
                    : []),
                ]}
              />
            </aside>
          </div>
        )}

        {tab === "guides" && (
          <div className="space-y-6">
            <TelemetryOnce event="guide_viewed" properties={{ modSlug: mod.slug }} />
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Guides</h2>
              <ContentForm kind="guide" modSlug={mod.slug} isSignedIn={isSignedIn} />
            </div>
            {await (async () => {
              const items = await safeQuery(
                () =>
                  GuidePost.find({ modSlug: mod.slug }).sort({ createdAt: -1 }).limit(30).lean(),
                []
              );
              if (!items.length) {
                return <EmptyHint>No guides yet — be the first to write one.</EmptyHint>;
              }
              return (
                <div className="space-y-3">
                  {items.map((g) => (
                    <div key={String(g._id)} className="rounded-xl border border-border bg-card p-4">
                      <p className="font-semibold">{g.title}</p>
                      <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">
                        {g.body}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {g.username} · {new Date(g.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {tab === "reviews" && (
          <ReviewList
            modSlug={mod.slug}
            gameSlug={mod.baseGameSlug}
            isSignedIn={isSignedIn}
            items={await safeQuery(
              () => Review.find({ modSlug: mod.slug }).sort({ createdAt: -1 }).limit(30).lean(),
              []
            )}
          />
        )}

        {tab === "discussion" && (
          <ModDiscussionTab
            modSlug={mod.slug}
            modTitle={mod.title}
            baseGameSlug={mod.baseGameSlug}
            isSignedIn={isSignedIn}
            query={{
              category: sp.category,
              sort: sp.sort,
              filter: sp.filter,
              q: sp.q,
            }}
          />
        )}
      </div>
    </div>
  );
}

async function ModDiscussionTab({
  modSlug,
  modTitle,
  baseGameSlug,
  isSignedIn,
  query,
}: {
  modSlug: string;
  modTitle: string;
  baseGameSlug: string;
  isSignedIn: boolean;
  query: { category?: string; sort?: string; filter?: string; q?: string };
}) {
  const baseGame = await getGame(baseGameSlug);
  const categories = baseGame
    ? visibleCategories(baseGame)
    : (["general", "help", "technical", "guides", "feedback", "announcements", "mods"] as const).map(
        (id) => CATEGORY_META[id]
      );

  const filter = query.filter ?? "all";
  const sort = query.sort ?? "activity";
  const category = query.category;
  const q = query.q?.trim() ?? "";

  const mongoQuery: Record<string, unknown> = {
    modSlug,
    status: { $ne: "removed" },
  };
  if (category && category !== "all") mongoQuery.category = category;
  if (filter === "unanswered") {
    mongoQuery.replyCount = 0;
    mongoQuery.isSolved = false;
  } else if (filter === "solved") {
    mongoQuery.isSolved = true;
  } else if (filter === "pinned") {
    mongoQuery.isPinned = true;
  }
  if (q) mongoQuery.$text = { $search: q };

  let sortSpec: Record<string, 1 | -1> = { isPinned: -1, lastReplyAt: -1, createdAt: -1 };
  if (sort === "newest") sortSpec = { isPinned: -1, createdAt: -1 };
  else if (sort === "replies") sortSpec = { isPinned: -1, replyCount: -1, lastReplyAt: -1 };

  const all = await safeQuery(
    () => DiscussionTopic.find(mongoQuery).sort(sortSpec).limit(40).lean(),
    []
  );
  const pinned = all.filter((t) => t.isPinned);
  const topics = all.filter((t) => !t.isPinned || filter === "pinned");

  const mapTopic = (t: (typeof all)[number]) => ({
    _id: String(t._id),
    slug: t.slug,
    title: t.title,
    category: t.category,
    replyCount: t.replyCount,
    viewCount: t.viewCount,
    isPinned: Boolean(t.isPinned),
    isSolved: Boolean(t.isSolved),
    status: t.status,
    lastReplyAt: t.lastReplyAt,
    createdAt: t.createdAt,
    authorUsername: t.authorUsername,
    lastReplyUsername: t.lastReplyUsername,
  });

  return (
    <DiscussionBoard
      modSlug={modSlug}
      gameTitle={modTitle}
      isSignedIn={isSignedIn}
      categories={categories}
      topics={topics.map(mapTopic)}
      pinned={filter === "pinned" ? [] : pinned.map(mapTopic)}
      query={query}
    />
  );
}
