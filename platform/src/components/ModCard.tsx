"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { ModCardMod } from "@/lib/mods";
import { cn } from "@/lib/utils";
import { ModArt } from "@/components/ModArt";

type BaseGameInfo = {
  slug?: string;
  title?: string;
  coverImage?: string | null;
} | null;

type Props = {
  mod: ModCardMod;
  baseGame?: BaseGameInfo;
  className?: string;
  /** Optional custom footer — defaults to the base game's name. */
  meta?: string;
  /** Optional action row under the body (install buttons, etc.). */
  actions?: ReactNode;
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
  const gameName = baseGame?.title || mod.baseGameSlug?.replace(/-/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
  const footer = meta ?? (gameName ? `For ${gameName}` : "");

  const body = (
    <>
      <ModArt mod={mod} baseGame={baseGame} className="preview-mod-art h-[152px] w-full" />
      <div className="flex flex-1 flex-col p-4">
        <p className="truncate text-[19px] font-bold leading-tight">{mod.title}</p>
        <p className="mt-1 flex-1 text-[14px] leading-relaxed text-muted-foreground line-clamp-2">
          {mod.tagline}
        </p>
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
    "preview-mod-card group flex h-full flex-col overflow-hidden rounded-[14px] border border-border bg-card transition-all duration-[250ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-[var(--border-focus,oklch(1_0_0/18%))] hover:bg-[var(--bg-card-hover,oklch(0.24_0.018_278))] hover:shadow-[0_12px_30px_rgba(0,0,0,0.5)]",
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
