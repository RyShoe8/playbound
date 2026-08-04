"use client";

import type { Game } from "@/lib/data/types";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { AddToLibraryButton } from "@/components/AddToLibraryButton";

/** Picks Save vs Add based on whether the game runs on this device. */
export function AdaptiveAddToLibraryButton({
  game,
  initiallyInLibrary,
  signedIn,
  size = "md",
}: {
  game: Pick<Game, "platforms" | "browserPlayable" | "steamDeck" | "slug">;
  initiallyInLibrary: boolean;
  signedIn: boolean;
  size?: "md" | "lg";
}) {
  const { device } = useCompatibilityFilter();
  const compatible = isGameCompatible(game, device.type);
  return (
    <AddToLibraryButton
      slug={game.slug}
      initiallyInLibrary={initiallyInLibrary}
      signedIn={signedIn}
      size={size}
      saveForLater={!compatible}
    />
  );
}
