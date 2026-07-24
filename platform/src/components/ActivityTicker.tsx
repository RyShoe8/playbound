"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import type { ActivityItem } from "@/lib/data/types";
import { cn } from "@/lib/utils";

/** Rotating one-line feed that keeps the platform feeling alive. */
export function ActivityTicker({ items }: { items: ActivityItem[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % items.length);
        setVisible(true);
      }, 250);
    }, 4500);
    return () => clearInterval(timer);
  }, [items.length]);

  const item = items[index];

  return (
    <div className="flex items-center gap-2.5 overflow-hidden rounded-full border border-border bg-card px-4 py-2">
      <Activity className="size-4 shrink-0 text-play" />
      <div
        className={cn(
          "min-w-0 flex-1 transition-all duration-250",
          visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        )}
      >
        {item.gameSlug ? (
          <Link href={`/games/${item.gameSlug}`} className="block truncate text-sm hover:underline">
            {item.text}
          </Link>
        ) : (
          <p className="truncate text-sm">{item.text}</p>
        )}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{item.timeAgo} ago</span>
    </div>
  );
}
