import { Globe, Monitor, Smartphone, TabletSmartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { platformBadgeLabels } from "@/lib/compatibility/compatibility";
import type { GameLike } from "@/lib/compatibility/compatibility";

const ICONS: Record<string, LucideIcon> = {
  Browser: Globe,
  Windows: Monitor,
  macOS: Monitor,
  Linux: Monitor,
  Android: TabletSmartphone,
  iPhone: Smartphone,
  "Steam Deck": Monitor,
};

export function GamePlatformBadges({
  game,
  className,
  compact = false,
}: {
  game: GameLike;
  className?: string;
  compact?: boolean;
}) {
  const labels = platformBadgeLabels(game);
  if (!labels.length) return null;

  return (
    <ul
      className={cn(
        "flex flex-wrap gap-1",
        compact ? "mt-1" : "mt-1.5",
        className
      )}
      aria-label="Supported platforms"
    >
      {labels.map((label) => {
        const Icon = ICONS[label] ?? Monitor;
        return (
          <li
            key={label}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-border/80 bg-secondary/50 font-medium text-muted-foreground",
              compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
            )}
          >
            <Icon className={compact ? "size-2.5" : "size-3"} aria-hidden />
            {label}
          </li>
        );
      })}
    </ul>
  );
}
