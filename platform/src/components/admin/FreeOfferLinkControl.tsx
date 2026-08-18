"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FreeOfferLinkControl({
  offerId,
  games,
}: {
  offerId: string;
  games: Array<{ slug: string; title: string }>;
}) {
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function link() {
    if (!slug) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/free-offers/${offerId}/link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameSlug: slug }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Could not link.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <select
        className="max-w-[160px] rounded border border-border bg-secondary px-1 py-0.5 text-[11px]"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
      >
        <option value="">Link to game…</option>
        {games.map((g) => (
          <option key={g.slug} value={g.slug}>
            {g.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!slug || busy}
        onClick={() => void link()}
        className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
      >
        Link
      </button>
      {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
    </span>
  );
}
