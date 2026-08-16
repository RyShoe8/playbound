import { cn } from "@/lib/utils";
import { CoverImage } from "@/components/CoverImage";
import { resolveModVisual, type BaseGameVisualInput, type ModVisualInput } from "@/lib/modMedia";

/**
 * Mod banner/art — cascade: mod cover → mod gradient → base-game cover.
 */
export function ModArt({
  mod,
  baseGame,
  className,
  alt,
}: {
  mod: ModVisualInput;
  baseGame?: BaseGameVisualInput;
  className?: string;
  alt?: string;
}) {
  const visual = resolveModVisual(mod, baseGame);

  if (visual.kind === "image") {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden bg-secondary text-[36px] font-black text-white/90 [text-shadow:0_2px_10px_rgba(0,0,0,0.5)]",
          className
        )}
      >
        {(mod.title || "?").charAt(0)}
        <CoverImage
          src={visual.url}
          alt={alt || `${mod.title} cover`}
          sizes="(max-width: 768px) 50vw, 33vw"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden text-[36px] font-black text-white/90 [text-shadow:0_2px_10px_rgba(0,0,0,0.5)]",
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${visual.from}, ${visual.to})`,
      }}
      aria-hidden={alt ? undefined : true}
      role={alt ? "img" : undefined}
      aria-label={alt}
    >
      {visual.label}
    </div>
  );
}
