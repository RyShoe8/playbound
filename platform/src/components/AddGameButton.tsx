"use client";

import { useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { launcherLocateUrl } from "@/lib/launcher";

export function AddGameButton({ games }: { games: { slug: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = games.filter((g) =>
    g.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
      >
        <Plus className="mr-2 size-4" />
        Add Game
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-xl font-bold">Add Existing Install</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-4">
              <p className="mb-4 text-sm text-muted-foreground">
                Locate an existing game folder on your computer to add it to your PlayBound library.
              </p>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search for a game..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>

              <div className="no-scrollbar max-h-[300px] overflow-y-auto pr-2">
                {filtered.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No games found matching your search.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {filtered.map((game) => (
                      <a
                        key={game.slug}
                        href={launcherLocateUrl(game.slug)}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                      >
                        {game.title}
                        <span className="rounded bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm">
                          Locate
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
