import Link from "next/link";
import { Pin, MessagesSquare } from "lucide-react";
import type { CategoryMeta, DiscussionCategory } from "@/lib/discussion/categories";
import { CATEGORY_META } from "@/lib/discussion/categories";
import { formatRelative } from "@/lib/discussion/formatRelative";
import { TopicComposer } from "@/components/discussion/TopicComposer";
import { EmptyHint } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { CommunityCard } from "@/components/discussion/CommunityCard";
import type { GameCommunityLinks } from "@/lib/data/types";

export type TopicListItem = {
  _id: string;
  slug: string;
  title: string;
  category: DiscussionCategory;
  replyCount: number;
  viewCount: number;
  isPinned: boolean;
  isSolved: boolean;
  status: string;
  lastReplyAt?: string | Date | null;
  createdAt: string | Date;
  authorUsername: string;
  lastReplyUsername?: string | null;
};

export function DiscussionBoard({
  gameSlug,
  modSlug,
  gameTitle,
  isSignedIn,
  categories,
  topics,
  pinned,
  communityLinks,
  query,
  presence,
}: {
  gameSlug?: string;
  modSlug?: string;
  gameTitle: string;
  isSignedIn: boolean;
  categories: CategoryMeta[];
  topics: TopicListItem[];
  pinned: TopicListItem[];
  communityLinks?: GameCommunityLinks | null;
  query: {
    category?: string;
    sort?: string;
    filter?: string;
    q?: string;
  };
  presence?: { online?: number; members?: number } | null;
}) {
  const root = modSlug ? `/mods/${modSlug}` : `/games/${gameSlug}`;
  const base = `${root}?tab=discussion`;
  const topicPath = (topicSlug: string) => `${root}/discussion/${topicSlug}`;
  const withParams = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    p.set("tab", "discussion");
    const merged = { ...query, ...extra };
    if (merged.category && merged.category !== "all") p.set("category", merged.category);
    if (merged.sort && merged.sort !== "activity") p.set("sort", merged.sort);
    if (merged.filter && merged.filter !== "all") p.set("filter", merged.filter);
    if (merged.q) p.set("q", merged.q);
    return `${root}?${p.toString()}`;
  };

  const activeCategory = query.category ?? "all";
  const chips = [{ id: "all", shortLabel: "All", label: "All" }, ...categories];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Discussion</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask questions, share fixes, and talk about {gameTitle}.
            </p>
          </div>
          <TopicComposer
            gameSlug={gameSlug}
            modSlug={modSlug}
            categories={categories}
            isSignedIn={isSignedIn}
          />
        </div>
        {!modSlug && gameSlug ? (
          <CommunityCard
            gameSlug={gameSlug}
            gameTitle={gameTitle}
            communityLinks={communityLinks}
            presence={presence}
            compact
          />
        ) : null}
      </div>

      <form action={base} method="get" className="flex flex-wrap gap-2">
        <input type="hidden" name="tab" value="discussion" />
        {query.category && <input type="hidden" name="category" value={query.category} />}
        {query.sort && <input type="hidden" name="sort" value={query.sort} />}
        {query.filter && <input type="hidden" name="filter" value={query.filter} />}
        <input
          name="q"
          defaultValue={query.q ?? ""}
          placeholder={`Search ${gameTitle} discussions...`}
          className="h-9 min-w-[16rem] flex-1 rounded-lg border border-input bg-secondary/50 px-3 text-sm"
        />
        <button
          type="submit"
          className="rounded-full bg-secondary px-4 py-2 text-sm font-bold hover:bg-secondary/70"
        >
          Search
        </button>
      </form>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {chips.map((c) => (
          <Link
            key={c.id}
            href={withParams({ category: c.id === "all" ? undefined : c.id })}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
              activeCategory === c.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            {c.shortLabel}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {[
          ["activity", "Recent activity"],
          ["newest", "Newest"],
          ["replies", "Most replied"],
          ["unanswered", "Unanswered"],
          ["solved", "Solved"],
          ["pinned", "Pinned"],
        ].map(([id, label]) => (
          <Link
            key={id}
            href={withParams({
              sort: id === "unanswered" || id === "solved" || id === "pinned" ? undefined : id,
              filter:
                id === "unanswered" || id === "solved" || id === "pinned"
                  ? id
                  : undefined,
            })}
            className={cn(
              "rounded-full px-3 py-1 font-semibold",
              (query.filter ?? "all") === id ||
                ((query.filter ?? "all") === "all" && (query.sort ?? "activity") === id)
                ? "bg-card border border-border text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {pinned.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Pinned
          </h3>
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {pinned.map((t) => (
              <TopicRow key={String(t._id)} href={topicPath(t.slug)} topic={t} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Recent discussions
        </h3>
        {topics.length === 0 ? (
          <EmptyHint icon={MessagesSquare}>No discussion yet — be the first.</EmptyHint>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-border md:block">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Title</th>
                    <th className="px-4 py-2 font-semibold">Replies</th>
                    <th className="px-4 py-2 font-semibold">Views</th>
                    <th className="px-4 py-2 font-semibold">Last activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {topics.map((t) => (
                    <tr key={String(t._id)} className="hover:bg-secondary/20">
                      <td className="px-4 py-3">
                        <Link href={topicPath(t.slug)} className="font-semibold hover:text-primary">
                          {t.isPinned && <Pin className="mr-1 inline size-3.5 text-primary" />}
                          {t.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {CATEGORY_META[t.category]?.shortLabel}
                          {t.isSolved ? " · Solved" : ""}
                          {t.status === "locked" ? " · Locked" : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">{t.replyCount}</td>
                      <td className="px-4 py-3">{t.viewCount}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatRelative(t.lastReplyAt ?? t.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 md:hidden">
              {topics.map((t) => (
                <Link
                  key={String(t._id)}
                  href={topicPath(t.slug)}
                  className="block rounded-xl border border-border bg-card p-4"
                >
                  <p className="font-semibold">{t.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {CATEGORY_META[t.category]?.shortLabel} · {t.replyCount} replies
                    {t.isSolved ? " · Solved" : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last reply {formatRelative(t.lastReplyAt ?? t.createdAt)}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function TopicRow({ href, topic: t }: { href: string; topic: TopicListItem }) {
  return (
    <Link href={href} className="flex items-start gap-2 px-4 py-3 hover:bg-secondary/20">
      <Pin className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <p className="font-semibold">{t.title}</p>
        <p className="text-xs text-muted-foreground">
          {CATEGORY_META[t.category]?.shortLabel}
          {t.isSolved ? " · Solved" : ""}
        </p>
      </div>
    </Link>
  );
}
