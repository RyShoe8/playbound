import type { GameArt } from "@/lib/data/types";

export type ModVisualInput = {
  title: string;
  coverImage?: string | null;
  art?: GameArt | { from: string; to: string; icon?: string } | null;
};

export type BaseGameVisualInput = {
  coverImage?: string | null;
  title?: string;
} | null;

export type ModVisual =
  | { kind: "image"; url: string; source: "mod" | "baseGame" }
  | { kind: "gradient"; from: string; to: string; label: string };

const NEUTRAL = {
  kind: "gradient" as const,
  from: "#312e81",
  to: "#a78bfa",
  label: "?",
};

/**
 * Cover cascade for mod cards/details:
 * mod cover → mod art gradient → base-game cover → neutral gradient.
 */
export function resolveModVisual(
  mod: ModVisualInput,
  baseGame?: BaseGameVisualInput
): ModVisual {
  const modCover = (mod.coverImage || "").trim();
  if (modCover) {
    return { kind: "image", url: modCover, source: "mod" };
  }

  const baseCover = (baseGame?.coverImage || "").trim();
  if (baseCover) {
    return { kind: "image", url: baseCover, source: "baseGame" };
  }

  const from = mod.art?.from?.trim();
  const to = mod.art?.to?.trim();
  if (from && to) {
    return {
      kind: "gradient",
      from,
      to,
      label: (mod.title || "?").charAt(0).toUpperCase(),
    };
  }

  return {
    kind: "gradient",
    from: NEUTRAL.from,
    to: NEUTRAL.to,
    label: (mod.title || "?").charAt(0).toUpperCase(),
  };
}
