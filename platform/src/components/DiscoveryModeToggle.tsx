"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { Check, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDiscoveryMode } from "@/hooks/useDiscoveryMode";
import type { DiscoveryMode } from "@/lib/access/discoveryMode";

type Variant = "sidebar" | "topbar";

const OPTIONS: { value: DiscoveryMode; label: string; short: string }[] = [
  { value: "FREE", label: "Free", short: "Free" },
  { value: "ALL", label: "All", short: "All" },
];

function announce(mode: DiscoveryMode) {
  return mode === "FREE"
    ? "Showing games you can play without spending anything."
    : "Showing every PlayBound-approved game up to $15.";
}

/** Global shell control — sidebar (desktop) or compact topbar (mobile). */
export function DiscoveryModeToggle({
  variant,
  className,
}: {
  variant: Variant;
  className?: string;
}) {
  const { mode, setMode } = useDiscoveryMode();

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
  mode: DiscoveryMode;
  setMode: (mode: DiscoveryMode) => void;
}) {
  return (
    <div className="space-y-2 px-1">
      <div className="flex items-center gap-2 px-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
        <Coins className="size-3.5" aria-hidden />
        Discover
      </div>
      <div role="radiogroup" aria-label="Discovery mode" className="space-y-0.5">
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
              {opt.label}
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
  mode: DiscoveryMode;
  setMode: (mode: DiscoveryMode) => void;
}) {
  return (
    <label className="inline-flex h-8 shrink-0 items-center leading-none">
      <span className="sr-only">Discovery mode</span>
      <PremiumSelect
        aria-label="Discovery mode"
        value={mode}
        onChange={(e) => setMode(e.target.value as DiscoveryMode)}
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
