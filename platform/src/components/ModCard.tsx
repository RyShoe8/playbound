import Link from "next/link";
import type { ModCardMod } from "@/lib/mods";
import { cn } from "@/lib/utils";
import { ModArt } from "@/components/ModArt";
import { CardCategoryTags } from "@/components/CardCategoryTags";

type BaseGameInfo = {
  slug?: string;
  title?: string;
  coverImage?: string | null;
} | null;

type Props = {
  mod: ModCardMod;
  baseGame?: BaseGameInfo;
  className?: string;
  /** Extra footer line (e.g. license · size) — defaults to base game + size. */
  meta?: string;
  /** Optional action row under the body (install buttons, etc.). */
  actions?: React.ReactNode;
  /** When true, card body is not wrapped in the main link (for action buttons). */
  href?: string;
};

/**
 * Discover CatalogCard-parity mod card: banner + title + tagline + meta + View.
 * Used on /mods, homepage strips, and the game hub Mods tab.
 */
export function ModCard({
  mod,
  baseGame,
  className,
  meta,
  actions,
  href,
}: Props) {
  const link = href ?? `/mods/${mod.slug}`;
  const footer =
    meta ??
    [
      baseGame?.title ? `For ${baseGame.title}` : mod.baseGameSlug ? `For ${mod.baseGameSlug}` : null,
      mod.sizeMB ? `~${mod.sizeMB} MB` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const body = (
    <>
      <ModArt mod={mod} baseGame={baseGame} className="h-[152px] w-full" />
      <div className="flex flex-1 flex-col p-4">
        <p className="truncate text-[19px] font-bold leading-tight">{mod.title}</p>
        <p className="mt-1 flex-1 text-[14px] leading-relaxed text-muted-foreground line-clamp-2">
          {mod.tagline}
        </p>
        <CardCategoryTags
          genres={mod.license ? [mod.license] : []}
          tags={mod.tags}
          className="mt-2"
          max={3}
          size="md"
        />
        <div className="mt-3.5 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground/70">
            {footer || "\u00a0"}
          </span>
          <span className="shrink-0 rounded-full border border-border bg-secondary/50 px-3 py-1 text-[13px] font-semibold text-secondary-foreground transition-colors group-hover:border-primary/30 group-hover:bg-secondary">
            View
          </span>
        </div>
      </div>
    </>
  );

  const shellClass = cn(
    "group flex h-full flex-col overflow-hidden rounded-[14px] border border-border bg-card transition-all duration-[250ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-[var(--border-focus,oklch(1_0_0/18%))] hover:bg-[var(--bg-card-hover,oklch(0.24_0.018_278))] hover:shadow-[0_12px_30px_rgba(0,0,0,0.5)]",
    className
  );

  if (actions) {
    return (
      <div className={shellClass}>
        <Link href={link} className="flex min-h-0 flex-1 flex-col">
          {body}
        </Link>
        <div className="flex flex-wrap items-start gap-2 border-t border-border px-4 py-3">{actions}</div>
      </div>
    );
  }

  return (
    <Link href={link} className={shellClass}>
      {body}
    </Link>
  );
}
