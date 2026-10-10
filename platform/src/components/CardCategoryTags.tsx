import { cn } from "@/lib/utils";

const has = (values: string[], pattern: RegExp) => values.some((value) => pattern.test(value));

/** Compact, consistent genre and play-feature labels for game cards. */
export function CardCategoryTags({
  genres = [],
  features = [],
  tags = [],
  className,
  max = 3,
  size = "sm",
  controller = false,
  variant = "game",
}: {
  genres?: string[];
  features?: string[];
  tags?: string[];
  className?: string;
  max?: number;
  size?: "sm" | "md";
  controller?: boolean;
  variant?: "game" | "mod";
}) {
  const genreLabels = [...new Set(genres.map((value) => value.trim()).filter(Boolean))].slice(0, max);
  const source = [...features, ...tags];
  const featureLabels = [
    controller && "Controller",
    has(source, /^(multiplayer|online multiplayer|online co-op|dedicated servers|matchmaking|mmo|mmorpg|pvp|cross-play|crossplay)$/i) && "Online Multiplayer",
    has(source, /^(couch co-op|split-screen co-op|local co-op|local multiplayer|hotseat)$/i) && "Couch Multiplayer",
    has(source, /^(mod support|mods|modding|workshop)$/i) && "Mods",
    has(source, /^(co-op|coop|cooperative|online co-op|local co-op|couch co-op|split-screen co-op)$/i) && "Co-Op",
  ].filter((value): value is string => Boolean(value));

  const chipClass = cn(
    "rounded-md border border-border/80 bg-secondary/60 px-1.5 py-0.5 font-semibold text-muted-foreground",
    size === "md" ? "text-[12px]" : "text-[10px]"
  );
  if (variant === "mod") {
    const labels = [...new Set([...genres, ...tags].map((value) => value.trim()).filter(Boolean))].slice(0, max);
    if (!labels.length) return null;
    return (
      <p className={cn("flex flex-wrap gap-1", className)}>
        {labels.map((label) => <span key={label} className={chipClass}>{label}</span>)}
      </p>
    );
  }
  if (!genreLabels.length && !featureLabels.length) return null;
  return (
    <div className={cn("space-y-1.5", className)}>
      {genreLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[10px] font-bold text-muted-foreground">Genre</span>
          {genreLabels.map((label) => <span key={label} className={chipClass}>{label}</span>)}
        </div>
      )}
      {featureLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[10px] font-bold text-muted-foreground">Features</span>
          {featureLabels.map((label) => <span key={label} className={chipClass}>{label}</span>)}
        </div>
      )}
    </div>
  );
}
