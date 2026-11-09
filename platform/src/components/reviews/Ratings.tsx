import Link from "next/link";
import { ExternalLink, Newspaper, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatOutletScore, normalizedScore, toneForScore, MIN_COMMUNITY_RATINGS, MIN_EDITORIAL_REVIEWS, type RatingTone } from "@/lib/ratings";
import type { Ratings } from "@/lib/ratingsData";

const TONE_BG: Record<RatingTone, string> = {
  positive: "bg-emerald-500 text-black",
  mixed: "bg-amber-400 text-black",
  negative: "bg-red-500 text-white",
};

/** The square score tile used for both ratings and for each outlet's score. */
export function ScoreTile({
  value,
  tone,
  size = "md",
  className,
}: {
  value: string | null;
  tone: RatingTone | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-extrabold tabular-nums",
        size === "sm" && "h-7 min-w-7 px-1 text-xs",
        size === "md" && "h-10 min-w-10 px-1.5 text-base",
        size === "lg" && "h-16 min-w-16 px-2 text-2xl",
        tone ? TONE_BG[tone] : "border border-border bg-muted text-muted-foreground",
        className
      )}
    >
      {value ?? "tbd"}
    </span>
  );
}

/**
 * Compact pair for the hero: Editorial and Community side by side. Renders
 * nothing when neither has anything to show, so unreviewed games keep a clean
 * hero. Links to the Reviews tab, where the numbers are explained.
 */
export function RatingBadges({ ratings, href }: { ratings: Ratings; href: string }) {
  const { editorial, community } = ratings;
  if (editorial.totalCount === 0 && community.count === 0) return null;
  return (
    <Link
      href={href}
      className="inline-flex flex-wrap items-center gap-3 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-white transition hover:bg-black/55"
    >
      <span className="inline-flex items-center gap-2">
        <ScoreTile size="sm" value={editorial.score == null ? null : String(editorial.score)} tone={editorial.verdict?.tone ?? null} />
        <span className="text-xs leading-tight">
          <span className="block font-semibold">Editorial Rating</span>
          <span className="block text-white/70">
            {editorial.score == null ? `${editorial.scoredCount} of ${MIN_EDITORIAL_REVIEWS} reviews` : `${editorial.scoredCount} reviews`}
          </span>
        </span>
      </span>
      <span className="inline-flex items-center gap-2">
        <ScoreTile size="sm" value={community.score == null ? null : community.score.toFixed(1)} tone={community.verdict?.tone ?? null} className="rounded-full" />
        <span className="text-xs leading-tight">
          <span className="block font-semibold">Community Rating</span>
          <span className="block text-white/70">
            {community.count} {community.count === 1 ? "rating" : "ratings"}
          </span>
        </span>
      </span>
    </Link>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  tile,
  verdict,
  detail,
}: {
  icon: typeof Users;
  title: string;
  tile: React.ReactNode;
  verdict: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
      {tile}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5" /> {title}
        </p>
        <p className="mt-0.5 font-bold">{verdict}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

/** Both aggregates, explained, at the top of a Reviews tab. */
export function RatingsSummary({ ratings, subject }: { ratings: Ratings; subject: string }) {
  const { editorial, community } = ratings;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SummaryCard
        icon={Newspaper}
        title="Editorial Rating"
        tile={<ScoreTile size="lg" value={editorial.score == null ? null : String(editorial.score)} tone={editorial.verdict?.tone ?? null} />}
        verdict={editorial.verdict?.label ?? "Not enough reviews yet"}
        detail={
          editorial.score == null
            ? `Shown once ${MIN_EDITORIAL_REVIEWS} scored outlet reviews of ${subject} are in (${editorial.scoredCount} so far).`
            : `Average of ${editorial.scoredCount} published outlet reviews, out of 100.`
        }
      />
      <SummaryCard
        icon={Users}
        title="Community Rating"
        tile={
          <ScoreTile
            size="lg"
            className="rounded-full"
            value={community.score == null ? null : community.score.toFixed(1)}
            tone={community.verdict?.tone ?? null}
          />
        }
        verdict={community.verdict?.label ?? "Not enough ratings yet"}
        detail={
          community.score == null
            ? `Shown once ${MIN_COMMUNITY_RATINGS} PlayBound players have rated ${subject} (${community.count} so far).`
            : `From ${community.count} PlayBound player ratings, out of 10.`
        }
      />
    </div>
  );
}

/** Outlet snippets, highest score first, each linking out to the full review. */
export function EditorialReviewList({ ratings }: { ratings: Ratings }) {
  if (ratings.reviews.length === 0) return null;
  return (
    <section>
      <h3 className="text-sm font-bold">Editorial reviews</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Scores as each outlet published them, shown out of 100 for the average. Every review links to the full piece.
      </p>
      <div className="space-y-3">
        {ratings.reviews.map((r) => {
          const n = normalizedScore(r);
          return (
            <article key={r.id} className="flex gap-4 rounded-xl border border-border bg-card p-5">
              <ScoreTile value={n == null ? "—" : String(n)} tone={n == null ? null : toneForScore(n)} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-bold">{r.outlet}</span>
                  {r.author && <span className="text-muted-foreground">by {r.author}</span>}
                  {formatOutletScore(r) && <span className="text-muted-foreground">· scored {formatOutletScore(r)}</span>}
                  {r.publishedAt && (
                    <time dateTime={r.publishedAt} className="text-muted-foreground">
                      ·{" "}
                      {new Date(r.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}
                    </time>
                  )}
                </p>
                {r.snippet && <blockquote className="mt-2 text-sm leading-relaxed">&ldquo;{r.snippet}&rdquo;</blockquote>}
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  Read the full review <ExternalLink className="size-3.5" />
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
