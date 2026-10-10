"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { EditionChipMap } from "@/lib/editionChipsLive";
import { getEditionChips as staticChips } from "@/lib/data/editionChips";

const EditionChipsContext = createContext<EditionChipMap | null>(null);

/** Supplies live edition chips; `null` means "use the static generated data". */
export function EditionChipsProvider({
  chips,
  children,
}: {
  chips: EditionChipMap | null;
  children: ReactNode;
}) {
  return <EditionChipsContext.Provider value={chips}>{children}</EditionChipsContext.Provider>;
}

export function useEditionChips(gameSlug: string): Array<{ slug: string; name: string }> {
  const live = useContext(EditionChipsContext);
  if (!live) return staticChips(gameSlug);
  return (live[gameSlug] ?? []).map(([slug, name]) => ({ slug, name }));
}
