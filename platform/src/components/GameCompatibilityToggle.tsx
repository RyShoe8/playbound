"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { Check, MonitorSmartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import type { CompatibilityFilterMode } from "@/lib/compatibility/compatibility";

type Variant = "sidebar" | "topbar";

const OPTIONS: { value: CompatibilityFilterMode; label: string; short: string }[] = [
  { value: "compatible", label: "Compatible With This Device", short: "Compatible" },
  { value: "all", label: "All Games", short: "All Games" },
];

function announce(mode: CompatibilityFilterMode) {
  return mode === "compatible"
    ? "Showing games compatible with this device."
    : "Showing all games.";
}

/** Global shell control — sidebar (desktop) or compact topbar (mobile). */
export function GameCompatibilityToggle({
  variant,
  className,
}: {
  variant: Variant;
  className?: string;
}) {
  const { mode, setMode } = useCompatibilityFilter();

  if (variant === "topbar") {
    return (
      <div className={cn("flex items-center self-center", className)}>
        <TopbarControl mode={mode} setMode={setMode} />
        <span className="sr-only" role="status" aria-live="polite">
          {announce(mode)}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <SidebarControl mode={mode} setMode={setMode} />
      <span className="sr-only" role="status" aria-live="polite">
        {announce(mode)}
      </span>
    </div>
  );
}

function SidebarControl({
  mode,
  setMode,
}: {
  mode: CompatibilityFilterMode;
  setMode: (mode: CompatibilityFilterMode) => void;
}) {
  return (
    <div className="space-y-2 px-1">
      <div className="flex items-center gap-2 px-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
        <MonitorSmartphone className="size-3.5" aria-hidden />
        Games for
      </div>
      <div
        role="radiogroup"
        aria-label="Game compatibility filter"
        className="space-y-0.5"
      >
        {OPTIONS.map((opt) => {
          const selected = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(opt.value)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors",
                selected
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                {selected ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
              </span>
              {opt.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TopbarControl({
  mode,
  setMode,
}: {
  mode: CompatibilityFilterMode;
  setMode: (mode: CompatibilityFilterMode) => void;
}) {
  return (
    <label className="inline-flex h-8 shrink-0 items-center leading-none">
      <span className="sr-only">Game compatibility filter</span>
      <PremiumSelect
        aria-label="Game compatibility filter"
        value={mode}
        onChange={(e) => setMode(e.target.value as CompatibilityFilterMode)}
        className="h-8 appearance-none rounded-full border border-input bg-secondary/60 px-2.5 py-0 text-xs font-semibold leading-none outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.short}
          </option>
        ))}
      </PremiumSelect>
    </label>
  );
}
