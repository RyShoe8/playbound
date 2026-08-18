"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function EcommerceMatchButton({ slug, label = "Match catalog" }: { slug?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ecommerce/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(slug ? { slug } : {}),
      });
      const json = (await res.json()) as {
        error?: string;
        summary?: { applied?: number; suggested?: number; skipped?: number };
      };
      if (!res.ok) {
        setMessage(json.error || "Match failed.");
        return;
      }
      const s = json.summary;
      setMessage(
        s
          ? `Applied ${s.applied ?? 0}, queued ${s.suggested ?? 0}, skipped ${s.skipped ?? 0}.`
          : "Done."
      );
      router.refresh();
    } catch {
      setMessage("Match failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
      >
        <RefreshCw className={`size-3 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Matching…" : label}
      </button>
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
    </span>
  );
}
