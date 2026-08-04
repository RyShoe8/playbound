/**
 * Client-side identity + auto metadata for telemetry events.
 * Safe to import from client bundles only (guards SSR).
 */

import type { TelemetryContext } from "./types";

const ANON_KEY = "pb_telemetry_anonymous_id";
const SESSION_KEY = "pb_telemetry_session_id";

let memoryUserId: string | null = null;
let memoryAnonId: string | null = null;
let memorySessionId: string | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readOrCreate(storageKey: string, memoryFallback: string | null): string {
  if (!isBrowser()) return memoryFallback || uuid();
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const created = uuid();
    window.localStorage.setItem(storageKey, created);
    return created;
  } catch {
    if (memoryFallback) return memoryFallback;
    return uuid();
  }
}

export function getAnonymousId(): string {
  memoryAnonId = readOrCreate(ANON_KEY, memoryAnonId);
  return memoryAnonId;
}

export function getSessionId(): string {
  // Session id: persist for the browser profile so multi-tab sessions aggregate;
  // regenerate when missing (new device / cleared storage).
  memorySessionId = readOrCreate(SESSION_KEY, memorySessionId);
  return memorySessionId;
}

export function setTelemetryUserId(userId: string | null): void {
  memoryUserId = userId;
}

export function getTelemetryUserId(): string | null {
  return memoryUserId;
}

function deviceType(): TelemetryContext["deviceType"] {
  if (!isBrowser()) return "unknown";
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

/** Build auto metadata. Callers never pass these. */
export function collectContext(
  overrides: Partial<TelemetryContext> = {}
): TelemetryContext {
  const base: TelemetryContext = {
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    anonymousId: getAnonymousId(),
    userId: memoryUserId,
  };

  if (!isBrowser()) {
    return { ...base, ...overrides };
  }

  return {
    ...base,
    url: window.location.href,
    path: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || undefined,
    title: document.title || undefined,
    screen:
      typeof window.screen?.width === "number"
        ? `${window.screen.width}x${window.screen.height}`
        : undefined,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timezone: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return undefined;
      }
    })(),
    language: navigator.language,
    deviceType: deviceType(),
    ...overrides,
  };
}

export function mergeProperties(
  properties?: Record<string, unknown>,
  context: TelemetryContext = collectContext()
): Record<string, unknown> {
  return {
    ...context,
    ...(properties || {}),
  };
}
