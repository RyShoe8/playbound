"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { GameCard } from "@/components/GameCard";
import { cn } from "@/lib/utils";

interface GenreGameRowProps {
  genre: string;
  games: Game[];
  playingNowBySlug?: Record<string, number>;
  className?: string;
}

export function GenreGameRow({
  genre,
  games,
  playingNowBySlug = {},
  className,
}: GenreGameRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 6);
  }, []);

  useEffect(() => {
    checkScroll();
    const handleResize = () => checkScroll();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [checkScroll, games]);

  const handleScroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = Math.max(el.clientWidth * 0.75, 280);
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  if (games.length === 0) return null;

  return (
    <section
      id={`genre-${genre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      className={cn("space-y-3.5", className)}
    >
      {/* Row Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl font-bold tracking-tight text-foreground">{genre}</h2>
          <span className="inline-flex items-center rounded-full bg-secondary/80 px-2 py-0.5 text-xs font-semibold text-muted-foreground border border-border/40 tabular-nums">
            {games.length}
          </span>
        </div>

        {/* Navigation Arrow Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleScroll("left")}
            disabled={!canScrollLeft}
            aria-label={`Scroll ${genre} games left`}
            className={cn(
              "flex size-8 items-center justify-center rounded-full border border-border/80 bg-card/90 text-muted-foreground shadow-sm transition-all duration-150 backdrop-blur-sm",
              "hover:border-primary/50 hover:bg-secondary hover:text-foreground active:scale-95",
              !canScrollLeft && "opacity-25 cursor-not-allowed pointer-events-none"
            )}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => handleScroll("right")}
            disabled={!canScrollRight}
            aria-label={`Scroll ${genre} games right`}
            className={cn(
              "flex size-8 items-center justify-center rounded-full border border-border/80 bg-card/90 text-muted-foreground shadow-sm transition-all duration-150 backdrop-blur-sm",
              "hover:border-primary/50 hover:bg-secondary hover:text-foreground active:scale-95",
              !canScrollRight && "opacity-25 cursor-not-allowed pointer-events-none"
            )}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Scrolling Row */}
      <div className="relative group/row">
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-r from-background to-transparent transition-opacity" />
        )}

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="no-scrollbar -mx-1 flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-1 pt-1 pb-2 scroll-smooth"
        >
          {games.map((g) => (
            <div key={g.slug} className="shrink-0 snap-start">
              <GameCard game={g} playingNow={playingNowBySlug[g.slug] ?? 0} />
            </div>
          ))}
        </div>

        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-l from-background to-transparent transition-opacity" />
        )}
      </div>
    </section>
  );
}
