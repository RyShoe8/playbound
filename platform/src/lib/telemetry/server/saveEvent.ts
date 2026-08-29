import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import { isBotUserAgent, launcherOsLabel, parseUserAgent } from "./parseUserAgent";
import { maybeUpsertAutoBugFromTelemetry } from "@/lib/autoBugReport";

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

  /*
   * The launcher states what it is in the payload — `source: "launcher"` and
   * an exact `platform` — so prefer that over reading its User-Agent. The
   * header can be rewritten or dropped in transit; the body cannot, and this
   * keeps launcher events labelled correctly even then.
   */
  const client =
    props.source === "launcher"
      ? {
          browser: "Launcher",
          os: launcherOsLabel(props.platform) || ua.os,
          device: "desktop",
        }
      : ua;

  const isBot =
    Boolean(props.isBot) ||
    Boolean(props.webdriver) ||
    (props.source !== "launcher" && isBotUserAgent(input.userAgent));

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
    browser: isBot && client.browser === "unknown" ? "Bot" : client.browser,
    os: client.os,
    device: deviceFromProps || client.device,
    isBot,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
  });

  void maybeUpsertAutoBugFromTelemetry({
    event: input.event,
    properties: props,
    userId: input.userId ?? null,
    userAgent: input.userAgent ?? null,
  });
}
