"use client";

import { Monitor } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { AddToLibraryButton } from "@/components/AddToLibraryButton";

export function GameIncompatibilityBanner({
  game,
  initiallyInLibrary,
  signedIn,
}: {
  game: Game;
  initiallyInLibrary: boolean;
  signedIn: boolean;
}) {
  const { device } = useCompatibilityFilter();
  const compatible = isGameCompatible(game, device.type);
  if (compatible) return null;

  const desktopOnly =
    (game.platforms ?? []).some((p) => /windows|macos|linux/i.test(p)) &&
    !(game.platforms ?? []).some((p) => /android|ios|web|browser/i.test(p)) &&
    !game.browserPlayable;

  const headline = desktopOnly
    ? "This game is designed for Windows PCs."
    : device.isDesktop
      ? "This game is built for mobile devices."
      : "This game is designed for desktop PCs.";

  return (
    <div className="border-b border-border bg-secondary/40 px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Monitor className="size-4 text-primary" aria-hidden />
          </span>
          <div>
            <p className="font-bold">{headline}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              You can still save it to your library and install it later.
            </p>
          </div>
        </div>
        <AddToLibraryButton
          slug={game.slug}
          initiallyInLibrary={initiallyInLibrary}
          signedIn={signedIn}
          saveForLater
        />
      </div>
    </div>
  );
}
