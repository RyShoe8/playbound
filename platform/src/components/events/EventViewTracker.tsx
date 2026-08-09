"use client";

import { useEffect } from "react";
import { telemetry } from "@/lib/telemetry";

export function EventViewTracker({
  eventId,
  eventType,
  gameSlug,
}: {
  eventId: string;
  eventType: string;
  gameSlug?: string | null;
}) {
  useEffect(() => {
    void telemetry.track("event_viewed", {
      eventId,
      eventType,
      gameSlug: gameSlug || undefined,
    });
  }, [eventId, eventType, gameSlug]);
  return null;
}
