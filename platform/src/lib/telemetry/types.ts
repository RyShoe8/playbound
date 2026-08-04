/**
 * Provider-driven telemetry contracts.
 *
 * Application code talks only to the Telemetry singleton. Providers implement
 * this interface so GA4, Mongo, Console, PostHog, or The Ad Shop collector can
 * be swapped without touching call sites.
 */

export type TelemetryProperties = Record<string, unknown>;

export interface TelemetryProvider {
  readonly name: string;
  track(event: string, properties?: TelemetryProperties): void | Promise<void>;
  page(name: string, properties?: TelemetryProperties): void | Promise<void>;
  identify(userId: string, traits?: TelemetryProperties): void | Promise<void>;
  error(name: string, properties?: TelemetryProperties): void | Promise<void>;
  timing(metric: string, ms: number, properties?: TelemetryProperties): void | Promise<void>;
}

/** Auto-attached client context — never required from callers. */
export interface TelemetryContext {
  url?: string;
  path?: string;
  referrer?: string;
  title?: string;
  screen?: string;
  viewport?: string;
  timezone?: string;
  language?: string;
  deviceType?: "mobile" | "tablet" | "desktop" | "unknown";
  timestamp: string;
  sessionId: string;
  anonymousId: string;
  userId?: string | null;
}

export interface IdentifyTraits extends TelemetryProperties {
  username?: string | null;
  role?: string | null;
  email?: string | null;
}

/** Payload posted by the Mongo provider to /api/telemetry. */
export interface TelemetryIngestPayload {
  event: string;
  properties?: TelemetryProperties;
  timestamp: string;
  sessionId: string;
  anonymousId: string;
  userId?: string | null;
}

/** Traffic we never want in GA4 scripts or Mongo page views. */
export const TELEMETRY_EXCLUDED_PREFIXES = ["/admin", "/launcher/auth"] as const;

export function isTelemetryExcludedPath(pathname: string): boolean {
  return TELEMETRY_EXCLUDED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export const GA_MEASUREMENT_ID = "G-K41GXFDWJ2";
export const AHREFS_KEY = "9LCmsoftYLxkK0xA5d92ow";
