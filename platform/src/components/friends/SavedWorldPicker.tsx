"use client";

import { useEffect, useState } from "react";
import { PremiumSelect } from "@/components/ui/PremiumSelect";
import type { SavedWorldSummary } from "@/lib/savedWorldGames";

/**
 * Which saved world a party's PlayBound server runs (games with persistent
 * dedicated saves, e.g. Morrowind). Lists worlds the signed-in user has
 * played on; anyone who was in a party on a world can load it.
 */
export function SavedWorldPicker({
  gameSlug,
  value,
  onChange,
  disabled,
}: {
  gameSlug: string;
  value: string | null;
  onChange: (worldId: string | null) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [worlds, setWorlds] = useState<SavedWorldSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/saved-worlds?gameSlug=${encodeURIComponent(gameSlug)}`)
      .then((r) => (r.ok ? r.json() : { worlds: [] }))
      .then((d: { worlds?: SavedWorldSummary[] }) => {
        if (!cancelled) setWorlds(Array.isArray(d.worlds) ? d.worlds : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gameSlug, value]);

  // The party's current world may be one this user has not played on yet.
  const known = !value || worlds.some((w) => w.id === value);

  return (
    <PremiumSelect
      value={value || ""}
      disabled={disabled}
      onChange={(e) => void onChange(e.target.value || null)}
    >
      <option value="">New world</option>
      {!known && value ? <option value={value}>This party&apos;s world</option> : null}
      {worlds.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
          {w.lastPlayedAt ? ` — ${new Date(w.lastPlayedAt).toLocaleDateString()}` : ""}
        </option>
      ))}
    </PremiumSelect>
  );
}
