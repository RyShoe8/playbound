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
 * Coarsen an address before it is stored: IPv4 loses its last octet and IPv6
 * keeps only its /48. Country comes from the edge headers, so analytics lose
 * nothing, but a stored event no longer points at a single household.
 */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  if (ip.includes(":")) {
    const head: string[] = [];
    for (const group of ip.split(":")) {
      if (group === "") break;
      head.push(group);
    }
    return `${head.slice(0, 3).join(":")}::`;
  }
  return null;
}

/** How far a client clock may lead the server before its timestamp is ignored. */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
/** How old a client timestamp may be and still count (queued or retried events). */
const MAX_PAST_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * One clock for every event.
 *
 * `createdAt` is what every admin report sorts, buckets and filters on, so it
 * has to come from the server clock. Client clocks are routinely wrong — a
 * launcher on a PC with a drifted clock used to file events days off, which is
 * what made the Recent events table look like it jumped around. A client
 * timestamp is honoured only when it is plausible (a slightly delayed retry);
 * otherwise the server's receive time wins, and the rejected value is kept in
 * the event's properties so the skew is still visible.
 */
export function resolveEventTime(
  clientTimestamp: string | Date | null | undefined,
  now: Date = new Date()
): { createdAt: Date; clientTimestamp?: string; rejected: boolean } {
  if (!clientTimestamp) return { createdAt: now, rejected: false };
  const parsed = new Date(clientTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return { createdAt: now, clientTimestamp: String(clientTimestamp).slice(0, 64), rejected: true };
  }
  const delta = parsed.getTime() - now.getTime();
  if (delta > MAX_FUTURE_SKEW_MS || delta < -MAX_PAST_AGE_MS) {
    return { createdAt: now, clientTimestamp: parsed.toISOString(), rejected: true };
  }
  // Never trust a "future" stamp past the server's own receive time.
  return { createdAt: delta > 0 ? now : parsed, rejected: false };
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

  // `webdriver` is a browser-reported automation signal; a client-supplied
  // `isBot` flag is not trusted, since anyone can send it.
  const isBot =
    Boolean(props.webdriver) ||
    (props.source !== "launcher" && isBotUserAgent(input.userAgent));

  const time = resolveEventTime(input.timestamp);
  if (time.rejected) {
    props.clientTimestampRejected = time.clientTimestamp;
  }

  const document = {
    event: input.event,
    properties: props,
    userId: input.userId ?? null,
    anonymousId: input.anonymousId ?? null,
    sessionId: input.sessionId ?? null,
    url,
    referrer,
    ip: truncateIp(input.ip),
    country: input.country ?? null,
    browser: isBot && client.browser === "unknown" ? "Bot" : client.browser,
    os: client.os,
    device: deviceFromProps || client.device,
    isBot,
    createdAt: time.createdAt,
  };

  if (input.event === "mod_installed" && typeof props.installationId === "string" && props.installationId.length >= 16) {
    const receipt = { event: "mod_installed", "properties.installationId": props.installationId };
    await TelemetryEvent.updateOne(
      receipt,
      { $setOnInsert: document },
      { upsert: true }
    );
    // Anonymous telemetry may arrive before the player links their launcher.
    // Attach the account to the existing receipt without creating a second install.
    if (input.userId) await TelemetryEvent.updateOne(receipt, { $set: { userId: input.userId } });
  } else if (input.event === "launcher_install" && input.anonymousId) {
    // Retried first contacts must keep the original install time and count.
    await TelemetryEvent.updateOne(
      { event: "launcher_install", anonymousId: input.anonymousId },
      { $setOnInsert: document },
      { upsert: true }
    );
  } else {
    await TelemetryEvent.create(document);
  }

  // The telemetry route is serverless: an unawaited write can be killed after
  // the response, making failures visible in Ops but absent from Bugs.
  // The event is already stored by this point. A bug-upsert failure must not
  // turn into a 503 — clients retry on one, and would double-count the event.
  try {
    await maybeUpsertAutoBugFromTelemetry({
      event: input.event,
      properties: props,
      userId: input.userId ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (err) {
    console.error("[telemetry] auto-bug upsert failed", err);
  }
}
