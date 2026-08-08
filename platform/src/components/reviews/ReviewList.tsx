import Link from "next/link";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyHint } from "@/components/ui/bits";
import { ContentForm } from "@/components/ContentForm";

export interface ReviewItem {
  _id: unknown;
  rating?: number;
  title?: string;
  body?: string;
  username?: string;
  editionSlug?: string | null;
  createdAt?: Date | string;
}

/** Average rating, or null when there is nothing to average. */
export function averageRating(items: ReviewItem[]): number | null {
  const rated = items.filter((r) => typeof r.rating === "number");
  if (rated.length === 0) return null;
  return rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length;
}

export function RatingStars({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            size,
            i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
          )}
        />
      ))}
    </div>
  );
}

/**
 * Shared reviews block for both the game page and an edition page.
 *
 * `editionSlug` decides what a newly written review attaches to and what the
 * empty state says; the caller decides which reviews to pass in. Keeping both
 * surfaces on one component means the rating maths, the empty state and the
 * form stay identical rather than drifting apart.
 */
export function ReviewList({
  gameSlug,
  modSlug,
  gearSlug,
  gearCategory,
  isSignedIn,
  items,
  editionSlug,
  editionName,
  /** Label each review with the edition it covers — used on the game page. */
  showEditionLabels = false,
  editionNamesBySlug,
}: {
  gameSlug?: string;
  modSlug?: string;
  gearSlug?: string;
  gearCategory?: string;
  isSignedIn: boolean;
  items: ReviewItem[];
  editionSlug?: string;
  editionName?: string;
  showEditionLabels?: boolean;
  editionNamesBySlug?: Map<string, string>;
}) {
  const avg = averageRating(items);
  const subject = editionName
    ? `the ${editionName} edition`
    : gearSlug
      ? "this product"
      : modSlug
        ? "this mod"
        : "it";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-4xl font-extrabold">{avg == null ? "—" : avg.toFixed(1)}</p>
            <div className="mt-1 flex justify-center">
              <RatingStars value={avg ?? 0} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {items.length} {gearSlug ? "review" : "player review"}
            {items.length === 1 ? "" : "s"}
            {editionName ? ` of ${editionName}` : ""}
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-bold">
          {editionName
            ? `Review ${editionName}`
            : gearSlug
              ? "Review this product"
              : modSlug
                ? "Review this mod"
                : "Write a review"}
        </h3>
        <ContentForm
          kind="review"
          gameSlug={gameSlug}
          modSlug={modSlug}
          gearSlug={gearSlug}
          gearCategory={gearCategory}
          isSignedIn={isSignedIn}
          editionSlug={editionSlug}
          editionName={editionName}
        />
      </div>

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((r) => {
            const label = r.editionSlug
              ? (editionNamesBySlug?.get(r.editionSlug) ?? r.editionSlug)
              : null;
            return (
              <article key={String(r._id)} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold">&ldquo;{r.title}&rdquo;</p>
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    <Star className="size-3.5 fill-amber-400 text-amber-400" /> {r.rating}
                  </span>
                </div>
                {/* Which edition a review covers changes how to read it, so on
                    the game page — where reviews of several editions sit side
                    by side — each one says what it is about. */}
                {showEditionLabels && label && gameSlug && (
                  <Link
                    href={`/games/${gameSlug}/editions/${r.editionSlug}`}
                    className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase text-muted-foreground hover:text-foreground"
                  >
                    {label}
                  </Link>
                )}
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {r.body}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {r.username}
                  {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString()}` : ""}
                </p>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyHint icon={Star}>
          No reviews yet — rate {subject} after your first session.
        </EmptyHint>
      )}
    </div>
  );
}
