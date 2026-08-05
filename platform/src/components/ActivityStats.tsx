import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** Compact hero chip for live player counts. */
export function PlayingNowBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/80 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm",
        className
      )}
    >
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-play opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-play" />
      </span>
      <Users className="size-3.5 text-muted-foreground" />
      {count.toLocaleString()} playing now
    </span>
  );
}
