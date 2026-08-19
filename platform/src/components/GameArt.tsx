import { CoverImage } from "@/components/CoverImage";
import {
  Blocks,
  Bomb,
  Bug,
  Cog,
  Crosshair,
  Factory,
  Flag,
  Flame,
  Gamepad2,
  Landmark,
  Mountain,
  Orbit,
  Pill,
  Radar,
  Rocket,
  Skull,
  Snowflake,
  Sparkles,
  Swords,
  Target,
  TrainFront,
  Truck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Game } from "@/lib/data/types";
import { Badge } from "@/components/ui/bits";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  Blocks,
  Bomb,
  Bug,
  Cog,
  Crosshair,
  Factory,
  Flag,
  Flame,
  Landmark,
  Mountain,
  Orbit,
  Pill,
  Radar,
  Rocket,
  Skull,
  Snowflake,
  Sparkles,
  Swords,
  Target,
  TrainFront,
  Truck,
  Zap,
};

/**
 * Game cover: prefers a real coverImage, falls back to gradient + Lucide icon.
 */
export function GameArt({
  game,
  className,
  showTitle = true,
  iconSize = "lg",
}: {
  game: Game;
  className?: string;
  showTitle?: boolean;
  iconSize?: "sm" | "md" | "lg";
}) {
  const Icon = icons[game.art.icon] ?? Gamepad2;
  const iconClass =
    iconSize === "sm" ? "size-8" : iconSize === "md" ? "size-14" : "size-20";

  return (
    <div
      className={cn(
        "relative isolate flex items-center justify-center overflow-hidden",
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${game.art.from} 0%, ${game.art.to} 100%)`,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 30% 20%, rgba(255,255,255,0.22), transparent 60%), radial-gradient(90% 70% at 80% 90%, rgba(0,0,0,0.38), transparent 55%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <Icon
        className={cn(iconClass, "relative text-white/85 drop-shadow-[0_4px_14px_rgba(0,0,0,0.45)]")}
        strokeWidth={1.5}
      />
      {game.coverImage ? (
        <CoverImage
          src={game.coverImage}
          alt={`${game.title} cover`}
          className="z-[1]"
          sizes="(max-width: 768px) 50vw, 25vw"
        />
      ) : null}
      {showTitle && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-8 pb-2.5">
          <p className="min-w-0 truncate text-base font-bold text-white drop-shadow">{game.title}</p>
          {game.status === "testing" ? (
            <Badge tone="warn" className="shrink-0 text-[10px]">
              Testing
            </Badge>
          ) : null}
        </div>
      )}
    </div>
  );
}
