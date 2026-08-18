"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EcommerceSuggestionActions({
  id,
  candidates,
}: {
  id: string;
  candidates: Array<{ title: string; url: string; priceCents: number | null }>;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function accept(url: string) {
    setBusy(true);
    await fetch(`/api/admin/ecommerce/suggestions/${id}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    router.refresh();
    setBusy(false);
  }

  async function dismiss() {
    setBusy(true);
    await fetch(`/api/admin/ecommerce/suggestions/${id}/dismiss`, { method: "POST" });
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-1">
      {candidates.map((c) => (
        <div key={c.url} className="flex flex-wrap items-center gap-2 text-xs">
          <a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
            {c.title}
          </a>
          {c.priceCents != null ? <span className="text-muted-foreground">${(c.priceCents / 100).toFixed(2)}</span> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void accept(c.url)}
            className="font-semibold text-primary hover:underline disabled:opacity-50"
          >
            Use this
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={() => void dismiss()}
        className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
      >
        Dismiss
      </button>
    </div>
  );
}
