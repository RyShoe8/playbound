import { after } from "next/server";
import { saveEvent, type SaveTelemetryEventInput } from "./saveEvent";

/**
 * Fire-and-forget telemetry for request handlers that must not wait on it.
 *
 * A bare `void saveEvent(...)` is unsafe on serverless: the platform may freeze
 * the function as soon as the response is sent, killing the write mid-flight —
 * which is how events went missing without any error. `after()` keeps the
 * invocation alive until the write finishes while still returning the response
 * immediately. Outside a request (cron helpers, tests) `after` is unavailable,
 * so the write simply runs in the background there. Never throws and never
 * rejects.
 */
export function trackServerEvent(input: SaveTelemetryEventInput): Promise<void> {
  const run = () =>
    saveEvent(input).catch((err) => {
      console.error(`[telemetry] ${input.event} was not recorded`, err);
    });
  try {
    after(run);
    return Promise.resolve();
  } catch {
    return run();
  }
}
