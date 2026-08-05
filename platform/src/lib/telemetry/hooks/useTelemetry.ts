"use client";

import { telemetry } from "../telemetry";

/**
 * Stable API object — must not be recreated per render or effects that
 * depend on `track` will abort/restart on every state update.
 */
const api = {
  track: telemetry.track.bind(telemetry),
  page: telemetry.page.bind(telemetry),
  identify: telemetry.identify.bind(telemetry),
  error: telemetry.error.bind(telemetry),
  timing: telemetry.timing.bind(telemetry),
};

/**
 * React hook wrapping the telemetry singleton.
 * Prefer this inside components; outside React, import `telemetry` directly.
 */
export function useTelemetry() {
  return api;
}
