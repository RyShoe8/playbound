"use client";

import { useMemo, useState } from "react";
import { PremiumSelect } from "@/components/ui/PremiumSelect";
import { partyGameOptionLabel } from "@/lib/playTogether/partyPlatforms";

type PickerGame = { slug: string; title: string; genres?: string[]; status?: string };

/**
 * The leader's game choice: narrow by genre, type to search, scroll to browse.
 * The list opens in the page's flow so a panel with hidden overflow cannot clip it.
 */
export function PartyGamePicker({
  games,
  selectedSlug,
  selectedTitle,
  onSelect,
}: {
  games: PickerGame[];
  selectedSlug: string;
  selectedTitle: string;
  onSelect: (slug: string) => void;
}) {
  const [genre, setGenre] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const genres = useMemo(
    () => [...new Set(games.flatMap((g) => (g.genres || []).map((x) => x.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b)),
    [games]
  );
  const visible = games.filter(
    (g) =>
      (!genre || (g.genres || []).some((x) => x.trim() === genre)) &&
      g.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Genre</span>
        <PremiumSelect value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </PremiumSelect>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Game</span>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="party-game-list"
          autoComplete="off"
          value={open ? query : selectedTitle}
          placeholder={selectedTitle || "Type to search games"}
          onFocus={() => { setQuery(""); setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
            if (e.key === "Enter" && visible[0]) {
              e.preventDefault();
              onSelect(visible[0].slug);
              e.currentTarget.blur();
            }
          }}
          className="h-10 w-full rounded-lg border border-border bg-secondary/50 px-3 text-sm shadow-sm"
        />
      </label>
      {open ? (
        <div id="party-game-list" role="listbox" className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card">
          {visible.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">No games match.</p> : null}
          {visible.map((g) => (
            <button
              key={g.slug}
              type="button"
              role="option"
              aria-selected={g.slug === selectedSlug}
              // Before the input's blur closes the list, including on a scrollbar drag.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(g.slug); setOpen(false); (document.activeElement as HTMLElement | null)?.blur(); }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary aria-selected:font-bold"
            >
              {partyGameOptionLabel(g.title, {
                testing: g.status === "testing" || g.status === "ready",
                genres: g.genres,
                hideGenre: genre,
              })}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
