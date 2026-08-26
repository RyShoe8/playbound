"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Coins, MonitorSmartphone, SlidersHorizontal, X } from "lucide-react";
import { useDiscoveryMode } from "@/hooks/useDiscoveryMode";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { cn } from "@/lib/utils";

export function MobileCatalogPreferences({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { mode: discoveryMode, setMode: setDiscoveryMode } = useDiscoveryMode();
  const { mode: compatMode, setMode: setCompatMode } = useCompatibilityFilter();

  // Close on outside click or Escape key
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const isFreeOnly = discoveryMode === "FREE";
  const isDeviceOnly = compatMode === "compatible";
  const hasActiveCustomization = isFreeOnly || isDeviceOnly;

  return (
    <div className={cn("relative shrink-0", className)} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Catalog and device preferences"
        title="Catalog & Device Preferences"
        className={cn(
          "relative flex size-9 items-center justify-center rounded-full border border-input bg-secondary/80 text-muted-foreground transition-all hover:bg-secondary hover:text-foreground active:scale-95",
          open && "border-primary/50 bg-secondary text-foreground ring-2 ring-primary/30",
          hasActiveCustomization && "border-primary/40 text-primary"
        )}
      >
        <SlidersHorizontal className="size-4" />
        {hasActiveCustomization && (
          <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card/95 p-3.5 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 sm:p-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
            <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-foreground">
              <SlidersHorizontal className="size-3.5 text-primary" />
              Catalog Preferences
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Close preferences"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-4 pt-3">
            {/* Discovery Mode (Pricing) */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                <Coins className="size-3.5 text-primary" />
                <span>Pricing & Access</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/60 bg-secondary/40 p-1">
                <button
                  type="button"
                  onClick={() => setDiscoveryMode("FREE")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all",
                    isFreeOnly
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="flex items-center gap-1">
                    {isFreeOnly && <Check className="size-3" />} Free Only
                  </span>
                  <span className={cn("text-[10px] font-normal", isFreeOnly ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    $0 games only
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDiscoveryMode("ALL")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all",
                    !isFreeOnly
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="flex items-center gap-1">
                    {!isFreeOnly && <Check className="size-3" />} All Games
                  </span>
                  <span className={cn("text-[10px] font-normal", !isFreeOnly ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    Up to $15
                  </span>
                </button>
              </div>
            </div>

            {/* Game Compatibility */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                <MonitorSmartphone className="size-3.5 text-primary" />
                <span>Device Compatibility</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/60 bg-secondary/40 p-1">
                <button
                  type="button"
                  onClick={() => setCompatMode("compatible")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all",
                    isDeviceOnly
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="flex items-center gap-1">
                    {isDeviceOnly && <Check className="size-3" />} This Device
                  </span>
                  <span className={cn("text-[10px] font-normal", isDeviceOnly ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    Playable here
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCompatMode("all")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all",
                    !isDeviceOnly
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="flex items-center gap-1">
                    {!isDeviceOnly && <Check className="size-3" />} All Systems
                  </span>
                  <span className={cn("text-[10px] font-normal", !isDeviceOnly ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    All platforms
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
