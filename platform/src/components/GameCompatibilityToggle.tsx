"use client";

import { Check, MonitorSmartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import type { CompatibilityFilterMode } from "@/lib/compatibility/compatibility";

type Variant = "radios" | "select" | "sidebar" | "topbar";

const OPTIONS: { value: CompatibilityFilterMode; label: string; short: string }[] = [
  { value: "compatible", label: "Compatible With This Device", short: "Compatible" },
  { value: "all", label: "All Games", short: "All Games" },
];

function announce(mode: CompatibilityFilterMode) {
  const msg =
    mode === "compatible"
      ? "Showing games compatible with this device."
      : "Showing all games.";
  return msg;
}

export function GameCompatibilityToggle({
  variant = "radios",
  className,
  showMessage = false,
}: {
  variant?: Variant;
  className?: string;
  /** Listing surfaces: short copy under the control. */
  showMessage?: boolean;
}) {
  const { mode, setMode, device } = useCompatibilityFilter();

  return (
    <div className={cn("space-y-2", className)}>
      {variant === "radios" && (
        <Radios mode={mode} setMode={setMode} />
      )}
      {variant === "select" && <SelectControl mode={mode} setMode={setMode} />}
      {variant === "sidebar" && <SidebarControl mode={mode} setMode={setMode} />}
      {variant === "topbar" && <TopbarControl mode={mode} setMode={setMode} />}

      {showMessage && mode === "compatible" && (
        <p className="text-sm text-muted-foreground">
          {device.isDesktop
            ? "Showing games that work on your computer."
            : "Showing games compatible with your device."}{" "}
          <button
            type="button"
            className="font-semibold text-primary underline-offset-2 hover:underline"
            onClick={() => setMode("all")}
          >
            Show all games
          </button>
        </p>
      )}

      <span className="sr-only" role="status" aria-live="polite">
        {announce(mode)}
      </span>
    </div>
  );
}

function Radios({
  mode,
  setMode,
}: {
  mode: CompatibilityFilterMode;
  setMode: (mode: CompatibilityFilterMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Game compatibility filter"
      className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
    >
      <span className="text-sm font-semibold text-muted-foreground">Showing:</span>
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
              "inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors",
              selected
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded-full border",
                selected ? "border-primary" : "border-muted-foreground/50"
              )}
              aria-hidden
            >
              {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SelectControl({
  mode,
  setMode,
}: {
  mode: CompatibilityFilterMode;
  setMode: (mode: CompatibilityFilterMode) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold">Compatible With This Device</span>
      <select
        aria-label="Game compatibility filter"
        value={mode}
        onChange={(e) => setMode(e.target.value as CompatibilityFilterMode)}
        className="h-10 rounded-lg border border-input bg-secondary/60 px-3 font-semibold outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.short}
          </option>
        ))}
      </select>
    </label>
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
    <label className="flex shrink-0 items-center gap-1.5">
      <span className="sr-only">Game compatibility filter</span>
      <select
        aria-label="Game compatibility filter"
        value={mode}
        onChange={(e) => setMode(e.target.value as CompatibilityFilterMode)}
        className="h-9 max-w-[9.5rem] rounded-full border border-input bg-secondary/60 px-2.5 text-xs font-semibold outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.short}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Sticky chip for mobile listing pages. */
export function CompatibilityListingBar({ className }: { className?: string }) {
  const { device } = useCompatibilityFilter();
  const variant = device.isDesktop ? "radios" : "select";

  return (
    <div
      className={cn(
        "sticky top-14 z-20 -mx-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none",
        className
      )}
    >
      <GameCompatibilityToggle variant={variant} showMessage />
    </div>
  );
}
