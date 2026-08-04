import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import { parseUserAgent } from "./parseUserAgent";

export interface SaveTelemetryEventInput {
  event: string;
  properties?: Record<string, unknown>;
  timestamp?: string | Date;
  sessionId?: string | null;
  anonymousId?: string | null;
  userId?: string | null;
  url?: string | null;
  referrer?: string | null;
  ip?: string | null;
  country?: string | null;
  userAgent?: string | null;
}

/**
 * Single write path for telemetry ingest (API route + future server callers).
 */
export async function saveEvent(input: SaveTelemetryEventInput): Promise<void> {
  await dbConnect();

  const props = { ...(input.properties || {}) };
  const url =
    input.url ??
    (typeof props.url === "string" ? props.url : null) ??
    null;
  const referrer =
    input.referrer ??
    (typeof props.referrer === "string" ? props.referrer : null) ??
    null;

  const ua = parseUserAgent(input.userAgent);
  const deviceFromProps =
    typeof props.deviceType === "string" ? props.deviceType : null;

  const createdAt = input.timestamp
    ? new Date(input.timestamp)
    : new Date();

  await TelemetryEvent.create({
    event: input.event,
    properties: props,
    userId: input.userId ?? null,
    anonymousId: input.anonymousId ?? null,
    sessionId: input.sessionId ?? null,
    url,
    referrer,
    ip: input.ip ?? null,
    country: input.country ?? null,
    browser: ua.browser,
    os: ua.os,
    device: deviceFromProps || ua.device,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
  });
}
