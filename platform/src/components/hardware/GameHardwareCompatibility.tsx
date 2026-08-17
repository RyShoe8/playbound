"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTelemetry } from "@/lib/telemetry";
import type { CompatibilityResult } from "@/lib/hardware/types";
import { visibleCompatibilityReasons } from "@/lib/hardware/compatibility";
import { CheckCompatibilityCta } from "@/components/hardware/CheckCompatibilityCta";

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

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 40_000;

function formatRam(mb?: number | null) {
  if (mb == null) return null;
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB`;
  return `${mb} MB`;
}

async function loadCompatibility(
  gameSlug: string,
  editionSlug?: string | null,
  modsKey?: string
) {
  const params = new URLSearchParams({ gameSlug });
  if (editionSlug) params.set("editionSlug", editionSlug);
  if (modsKey) params.set("modSlugs", modsKey);
  const res = await fetch(`/api/hardware/compatibility?${params.toString()}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  return {
    hasProfile: Boolean(data?.hasProfile),
    result: (data?.result ?? null) as CompatibilityResult | null,
  };
}

export function GameHardwareCompatibility({
  gameSlug,
  editionSlug,
  modSlugs,
}: {
  gameSlug: string;
  editionSlug?: string | null;
  modSlugs?: string[];
}) {
  const { status } = useSession();
  const { track } = useTelemetry();
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [result, setResult] = useState<CompatibilityResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncHint, setSyncHint] = useState<string | null>(null);

  const modsKey = (modSlugs || []).join(",");

  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const data = await loadCompatibility(gameSlug, editionSlug, modsKey);
        if (cancelled) return;
        setHasProfile(data.hasProfile);
        setResult(data.result);
        if (data.result) {
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
  }, [gameSlug, editionSlug, modsKey, status, track]);

  useEffect(() => {
    if (!syncing) return;
    let cancelled = false;
    const started = Date.now();

    const tick = async () => {
      try {
        const data = await loadCompatibility(gameSlug, editionSlug, modsKey);
        if (cancelled) return;
        setHasProfile(data.hasProfile);
        setResult(data.result);
        if (data.hasProfile) {
          setSyncing(false);
          setSyncHint(null);
          if (data.result) {
            track("game_compatibility_viewed", {
              gameSlug,
              verdict: data.result.verdict,
            });
          }
          return;
        }
      } catch {
        /* keep polling */
      }
      if (cancelled) return;
      if (Date.now() - started >= POLL_TIMEOUT_MS) {
        setSyncing(false);
        setSyncHint(
          "Still no profile — open PlayBound while signed in, then try again."
        );
        return;
      }
      window.setTimeout(() => {
        void tick();
      }, POLL_INTERVAL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [syncing, gameSlug, editionSlug, modsKey, track]);

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
          {syncing
            ? "Waiting for hardware sync…"
            : result?.summary ||
              "Open PlayBound while signed in to automatically check this game against your PC."}
        </p>
        <CheckCompatibilityCta
          gameSlug={gameSlug}
          surface="game_page"
          onLauncherOpened={() => {
            setSyncHint(null);
            setSyncing(true);
          }}
          statusHint={syncHint}
        />
      </section>
    );
  }

  const label = VERDICT_LABEL[result.verdict] || "Unknown";
  const color = VERDICT_COLOR[result.verdict] || "text-muted-foreground";
  const rec = result.compared.required.recommended || result.compared.required.min;
  const reasons = visibleCompatibilityReasons(result);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-lg font-bold">Will this run on your PC?</h2>
      <p className={`mt-2 text-base font-extrabold ${color}`}>{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{result.summary}</p>

      {reasons.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {reasons.map((r) => (
            <li key={`${r.code}-${r.message.slice(0, 40)}`}>{r.message}</li>
          ))}
        </ul>
      ) : null}

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
              <li>Recommended GPU: {rec.gpuText || rec.gpuTier}</li>
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
