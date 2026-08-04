import type { TelemetryIngestPayload, TelemetryProvider } from "../types";
import { isTelemetryExcludedPath } from "../types";

function stripInternal(properties?: Record<string, unknown>): {
  payloadProps: Record<string, unknown>;
  sessionId: string;
  anonymousId: string;
  userId?: string | null;
  timestamp: string;
} {
  const p = { ...(properties || {}) };
  const sessionId = String(p.sessionId || "");
  const anonymousId = String(p.anonymousId || "");
  const userId =
    p.userId === null || p.userId === undefined ? null : String(p.userId);
  const timestamp =
    typeof p.timestamp === "string" ? p.timestamp : new Date().toISOString();

  // Keep useful context on the wire; identity fields also top-level for schema.
  return { payloadProps: p, sessionId, anonymousId, userId, timestamp };
}

async function postEvent(
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  if (typeof window === "undefined") return;
  if (isTelemetryExcludedPath(window.location.pathname)) return;

  const { payloadProps, sessionId, anonymousId, userId, timestamp } =
    stripInternal(properties);

  if (!sessionId || !anonymousId) return;

  const body: TelemetryIngestPayload = {
    event,
    properties: payloadProps,
    timestamp,
    sessionId,
    anonymousId,
    userId,
  };

  try {
    const res = await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (!res.ok && process.env.NODE_ENV === "development") {
      console.warn("[telemetry/mongo] ingest failed", res.status);
    }
  } catch {
    // Fail-soft: network errors must never surface to UX.
  }
}

/**
 * Mongo provider — POSTs to /api/telemetry. Never writes Mongoose from client.
 */
export function createMongoProvider(): TelemetryProvider {
  return {
    name: "mongodb",

    track(event, properties) {
      return postEvent(event, properties);
    },

    page(name, properties) {
      return postEvent("page_view", { ...properties, path: name || properties?.path });
    },

    identify(userId, traits) {
      return postEvent("identify", { ...traits, identifiedUserId: userId });
    },

    error(name, properties) {
      return postEvent("error", { ...properties, errorName: name });
    },

    timing(metric, ms, properties) {
      return postEvent("timing", {
        ...properties,
        metric,
        milliseconds: ms,
      });
    },
  };
}
