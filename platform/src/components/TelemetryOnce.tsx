"use client";

import { useEffect, useRef } from "react";
import { useTelemetry } from "@/lib/telemetry";
import type { TelemetryEventName, TelemetryEventProps } from "@/lib/telemetry";

/**
 * Fires a single telemetry event on mount (StrictMode-safe).
 * Use from RSC pages via a tiny client island.
 */
export function TelemetryOnce<E extends TelemetryEventName>({
  event,
  properties,
}: {
  event: E;
  properties?: TelemetryEventProps<E>;
}) {
  const { track } = useTelemetry();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void track(event, properties);
    // Intentionally once per mount / event identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  return null;
}
