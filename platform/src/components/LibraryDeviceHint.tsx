"use client";

import { Monitor, Smartphone } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible, isMobileDevice } from "@/lib/compatibility/compatibility";
import { Badge } from "@/components/ui/bits";

/** Chip on library rows for titles that aren’t for the current device. */
export function LibraryDeviceHint({ game }: { game: Game }) {
  const { device } = useCompatibilityFilter();
  if (isGameCompatible(game, device.type)) return null;

  if (isMobileDevice(device.type)) {
    return (
      <Badge tone="neutral">
        <Monitor className="size-3" /> Install on PC
      </Badge>
    );
  }

  return (
    <Badge tone="neutral">
      <Smartphone className="size-3" /> Play Later
    </Badge>
  );
}
