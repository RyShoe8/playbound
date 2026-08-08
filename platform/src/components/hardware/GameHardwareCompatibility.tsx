"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTelemetry } from "@/lib/telemetry";
import type { CompatibilityResult } from "@/lib/hardware/types";

const VERDICT_LABEL: Record<string, string> = {
  excellent: "Runs Great",
  good: "Runs Well",
  playable: "Playable",
  limited: "Limited",
  unsupported: "Unsupported",
  unknown: "Unknown",
};

const VERDICT_COLOR: Record<string, string> = {
  excellent: "text-play",
  good: "text-play",
  playable: "text-amber-500",
  limited: "text-orange-500",
  unsupported: "text-destructive",
  unknown: "text-muted-foreground",
};

function formatRam(mb?: number | null) {
  if (mb == null) return null;
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB`;
  return `${mb} MB`;
}

export function GameHardwareCompatibility({ gameSlug }: { gameSlug: string }) {
  const { status } = useSession();
  const { track } = useTelemetry();
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [result, setResult] = useState<CompatibilityResult | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/hardware/compatibility?gameSlug=${encodeURIComponent(gameSlug)}`
        );
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        setHasProfile(Boolean(data?.hasProfile));
        setResult(data?.result ?? null);
        if (data?.result) {
          track("game_compatibility_viewed", {
            gameSlug,
            verdict: data.result.verdict,
          });
        }
      } catch {
        if (!cancelled) setResult(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameSlug, status, track]);

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-bold">Will this run on your PC?</h2>
        <p className="mt-2 text-sm text-muted-foreground">Checking…</p>
      </section>
    );
  }

  if (!hasProfile || !result || result.verdict === "unknown") {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-bold">Will this run on your PC?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {result?.summary ||
            "Download or open PlayBound to automatically check this game against your PC."}
        </p>
        <Link
          href="/launcher"
          onClick={() =>
            track("check_compatibility_cta_clicked", { gameSlug, surface: "game_page" })
          }
          className="mt-3 inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:brightness-110"
        >
          Check compatibility
        </Link>
      </section>
    );
  }

  const label = VERDICT_LABEL[result.verdict] || "Unknown";
  const color = VERDICT_COLOR[result.verdict] || "text-muted-foreground";
  const rec = result.compared.required.recommended || result.compared.required.min;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-lg font-bold">Will this run on your PC?</h2>
      <p className={`mt-2 text-base font-extrabold ${color}`}>{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{result.summary}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your PC
          </p>
          <ul className="mt-1.5 space-y-0.5 text-sm">
            {result.compared.user.gpu ? <li>{result.compared.user.gpu}</li> : null}
            {result.compared.user.cpu ? <li>{result.compared.user.cpu}</li> : null}
            {result.compared.user.ramMB != null ? (
              <li>{formatRam(result.compared.user.ramMB)} RAM</li>
            ) : null}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Game
          </p>
          <ul className="mt-1.5 space-y-0.5 text-sm">
            {rec?.gpuText || rec?.gpuTier ? (
              <li>
                Recommended GPU: {rec.gpuText || rec.gpuTier}
              </li>
            ) : null}
            {rec?.ramMB ? <li>Recommended RAM: {formatRam(rec.ramMB)}</li> : null}
            {result.compared.required.target?.resolution ||
            result.compared.required.target?.fps ||
            result.compared.required.target?.preset ? (
              <li>
                Target:{" "}
                {[
                  result.compared.required.target?.resolution,
                  result.compared.required.target?.fps
                    ? `${result.compared.required.target.fps} FPS`
                    : null,
                  result.compared.required.target?.preset,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </section>
  );
}
