"use client";

import { telemetry } from "../telemetry";

/**
 * React hook wrapping the telemetry singleton.
 * Prefer this inside components; outside React, import `telemetry` directly.
 */
export function useTelemetry() {
  return {
    track: telemetry.track.bind(telemetry),
    page: telemetry.page.bind(telemetry),
    identify: telemetry.identify.bind(telemetry),
    error: telemetry.error.bind(telemetry),
    timing: telemetry.timing.bind(telemetry),
  };
}
