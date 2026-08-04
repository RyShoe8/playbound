import Link from "next/link";
import type { CatalogModPublic } from "@/lib/mods";
import { cn } from "@/lib/utils";
import { ModArt } from "@/components/ModArt";

type BaseGameInfo = {
  slug?: string;
  title?: string;
  coverImage?: string | null;
} | null;

type Props = {
  mod: CatalogModPublic;
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
 * Launcher-parity mod card: banner + title + tagline + meta.
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

  return (
    <div
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-[14px] border border-border bg-card transition-all duration-[250ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_12px_30px_rgba(0,0,0,0.5)]",
        className
      )}
    >
      <Link href={link} className="block">
        <ModArt mod={mod} baseGame={baseGame} className="h-[120px] w-full" />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Link href={link} className="font-bold group-hover:text-primary">
          {mod.title}
        </Link>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{mod.tagline}</p>
        {footer ? (
          <p className="mt-auto pt-3 text-[11px] text-muted-foreground">{footer}</p>
        ) : null}
        {actions ? <div className="mt-3 flex flex-wrap items-start gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
