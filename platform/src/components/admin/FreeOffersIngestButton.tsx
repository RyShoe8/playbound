"use client";

import { useState } from "react";
import { RefreshCw, Check, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { StoreSlug } from "@/lib/freeOffers/types";
import { storeShortName } from "@/lib/freeOffers/labels";

export function FreeOffersIngestButton({ store }: { store?: StoreSlug }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const router = useRouter();

  async function handleIngest() {
    setLoading(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/admin/free-offers/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store ? { stores: [store] } : {}),
      });
      if (res.ok) {
        setStatus("success");
        router.refresh();
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleIngest}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary hover:border-primary/40 disabled:opacity-50"
    >
      <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
      {loading
        ? "Ingesting…"
        : status === "success"
        ? "Ingested!"
        : status === "error"
        ? "Failed"
        : store
        ? `Sync ${storeShortName(store)}`
        : "Sync All Stores"}
      {status === "success" && <Check className="size-3 text-play" />}
      {status === "error" && <AlertCircle className="size-3 text-destructive" />}
    </button>
  );
}
