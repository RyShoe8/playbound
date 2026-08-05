"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";

/**
 * Reorder a game's editions.
 *
 * Order is submitted as one list rather than per-edition PATCHes: reordering
 * five editions should not be five round trips, and a failure partway through
 * would leave the list jumbled.
 */
export function EditionReorderList({
  gameSlug,
  editions,
}: {
  gameSlug: string;
  editions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [order, setOrder] = useState(editions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const dirty = order.some((e, i) => e.id !== editions[i]?.id);

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/editions/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameSlug, order: order.map((e) => e.id) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Reorder failed");
        setBusy(false);
        return;
      }
      setSaved(true);
      setBusy(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm font-bold">Display order</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Order shown on the game page. The default edition is always pinned first regardless.
      </p>

      <ul className="mt-3 space-y-2">
        {order.map((e, i) => (
          <li
            key={e.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
          >
            <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
            <button
              type="button"
              onClick={() => move(i, i - 1)}
              disabled={i === 0}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label={`Move ${e.name} up`}
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => move(i, i + 1)}
              disabled={i === order.length - 1}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label={`Move ${e.name} down`}
            >
              <ArrowDown className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save order"}
        </button>
        {saved && !dirty && <span className="text-xs text-muted-foreground">Order saved.</span>}
      </div>
    </div>
  );
}
