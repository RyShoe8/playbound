"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, X, ShieldCheck } from "lucide-react";
import type { QualityBar } from "@/lib/data/types";
import { QUALITY_BAR } from "@/lib/site";

const STORAGE_KEY = "pb-quality-bar-dismissed";
const DISMISS_EVENT = "pb-quality-bar-change";

/**
 * Dismissal is read through useSyncExternalStore rather than an effect.
 * Setting state from an effect meant a user who had already dismissed the
 * panel still saw it render once and then vanish on every game page.
 */
function subscribeDismissed(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DISMISS_EVENT, onChange);
  };
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // private mode
  }
}

// The server cannot know the visitor's choice, so it always renders the panel;
// this keeps hydration consistent and leaves the content visible to crawlers.
const serverDismissed = () => false;

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The PlayBound Bar checklist. Client-side dismiss persists in localStorage so
 * the panel stays gone after close; first paint still renders for crawlers.
 */
export function QualityBarPanel({
  bar,
  gameTitle,
  compact = false,
  dismissible = true,
}: {
  bar: QualityBar;
  gameTitle: string;
  compact?: boolean;
  dismissible?: boolean;
}) {
  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    readDismissed,
    serverDismissed
  );
  const hidden = dismissible && dismissed;

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }, []);

  if (hidden) return null;

  const passed = QUALITY_BAR.filter((c) => bar[c.key]).length;
  const total = QUALITY_BAR.length;

  return (
    <section
      aria-labelledby="playbound-bar"
      className="rounded-xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="playbound-bar" className="flex items-center gap-2 text-lg font-bold">
          <ShieldCheck className="size-5 text-primary" />
          The PlayBound Bar
        </h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
            {passed} of {total} met
          </span>
          {dismissible && (
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss PlayBound Bar"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {bar.verdict && (
        <p className="mt-3 leading-relaxed font-medium">{bar.verdict}</p>
      )}

      <ul className="mt-4 space-y-2.5">
        {QUALITY_BAR.map((criterion) => {
          const met = bar[criterion.key];
          return (
            <li key={criterion.key} className="flex gap-3">
              {met ? (
                <Check
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-label="Meets criterion"
                />
              ) : (
                <X
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-label="Does not meet criterion"
                />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold">{criterion.title}</p>
                {!compact && (
                  <p className="text-sm text-muted-foreground">
                    {criterion.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        {bar.lastVerified && (
          <>
            {gameTitle} last verified against the bar on{" "}
            <time dateTime={bar.lastVerified}>{formatDate(bar.lastVerified)}</time>.{" "}
          </>
        )}
        <Link href="/standards" className="font-semibold text-primary hover:underline">
          Read the full standard →
        </Link>
      </p>
    </section>
  );
}
