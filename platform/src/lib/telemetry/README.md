# Playbound Telemetry

Provider-driven product telemetry. Application code only ever calls:

```ts
import { telemetry, useTelemetry } from "@/lib/telemetry";

telemetry.track("game_started", { gameSlug: "openra", installMethod: "launcher" });
telemetry.page("/games/openra");
telemetry.identify(userId, { username, role });
telemetry.error("checkout_failed", { code: "stripe_4xx" });
telemetry.timing("catalog_load", 128);
```

Never import `gtag`, `window.dataLayer`, or call `fetch("/api/telemetry")` from UI code.

## Architecture

```
Components / hooks
       │
       ▼
 telemetry.*  (singleton)
       │
       ▼
 Provider layer (fan-out, fail-soft)
       ├── GA4Provider      → window.gtag (client, production scripts)
       ├── MongoProvider    → POST /api/telemetry → TelemetryEvent
       ├── ConsoleProvider  → pretty logs (development only)
       └── (future) Ad Shop / PostHog / Mixpanel / Amplitude
```

Long-term path to **The Ad Shop**:

```
Playbound → telemetry.track() → Abstraction → Providers → Mongo | GA4 | Ad Shop Collector
```

Replace the Mongo provider with an HTTP provider that posts to The Ad Shop collector. **No application call sites change.**

## Packages layout

| Path | Role |
|------|------|
| `telemetry.ts` | Singleton + registry |
| `types.ts` | `TelemetryProvider` contract, exclusions, IDs |
| `events.ts` | Typed event catalog |
| `context.ts` | session / anonymous ids + auto metadata |
| `providers/*` | Destinations |
| `hooks/useTelemetry.ts` | React helper |
| `server/saveEvent.ts` | Mongo write path |
| `POST /api/telemetry` | Ingest (Zod + rate limit + UA enrichment) |
| `GET /api/admin/telemetry` | Admin reads |
| `/admin/analytics` | Admin dashboard |

## Auto metadata

Every event receives (callers never pass these):

- `url`, `path`, `referrer`, `title`
- `screen`, `viewport`, `timezone`, `language`, `deviceType`
- `timestamp`, `sessionId`, `anonymousId`, `userId` (after identify)

## Page tracking

`TelemetryProvider` watches App Router navigations and calls `telemetry.page()`. Paths under `/admin` and `/launcher/auth` are excluded (scripts not loaded; Mongo page views skipped).

### Required GA4 setting

`send_page_view: false` only suppresses the initial config pageview. In GA4:

**Admin → Data Streams → Enhanced Measurement → Page views → advanced → uncheck “Page changes based on browser history events”**

Otherwise soft navigations are double-counted.

## Providers

Every provider implements:

```ts
interface TelemetryProvider {
  track(event, properties?)
  page(name, properties?)
  identify(userId, traits?)
  error(name, properties?)
  timing(metric, ms, properties?)
}
```

Providers are registered once inside `TelemetryProvider`. Failures are isolated with `try/catch` per provider.

### Add a provider

1. Create `providers/posthog.ts` exporting `createPosthogProvider(): TelemetryProvider`.
2. Register it in `TelemetryProvider` / `registerProvidersOnce()`.
3. Do **not** change any `telemetry.track` call sites.

Example Ad Shop collector:

```ts
export function createAdShopProvider(endpoint: string): TelemetryProvider {
  return {
    name: "ad-shop",
    track(event, properties) {
      return fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, properties }),
        keepalive: true,
      }).then(() => undefined).catch(() => undefined);
    },
    page(name, properties) {
      return this.track("page_view", { ...properties, path: name });
    },
    identify(userId, traits) {
      return this.track("identify", { ...traits, userId });
    },
    error(name, properties) {
      return this.track("error", { ...properties, errorName: name });
    },
    timing(metric, ms, properties) {
      return this.track("timing", { ...properties, metric, milliseconds: ms });
    },
  };
}
```

Then remove or stop registering `createMongoProvider()` when The Ad Shop owns storage.

## Typed events

See `events.ts` for the catalog (`page_view`, `signup`, `login`, `game_started`, …). TypeScript autocompletes properties for known event names.

## React

```tsx
"use client";
import { useTelemetry } from "@/lib/telemetry";

export function InstallButton({ slug }: { slug: string }) {
  const { track } = useTelemetry();
  return (
    <button
      type="button"
      onClick={() => track("install_clicked", { gameSlug: slug, source: "game_page" })}
    >
      Install
    </button>
  );
}
```

Outside React, import `{ telemetry }` from `@/lib/telemetry`.

## Development

In development, ConsoleProvider logs:

```
Telemetry  game_started
Event: game_started
Properties: { gameSlug: "openra", ... }
```

GA4 / Ahrefs scripts load only when `gaEnabled` is true (production via `IS_PRODUCTION`).

## Best practices

1. **Never block UX** on telemetry — fire-and-forget; providers already fail-soft.
2. **No PII** in properties beyond `userId` / username traits used for identify.
3. **Use the catalog** for shared events so dashboards stay consistent.
4. **Do not** call gtag or the ingest API from components.
5. Prefer `useTelemetry()` in client components; `telemetry` is fine in event handlers and non-React modules that are client-only.

## Admin

`/admin/analytics` shows volumes, top events, daily bars, and a filterable recent feed. Admin APIs require `requireAdminSession()`.

## Ingest API

`POST /api/telemetry`

```json
{
  "event": "game_started",
  "properties": { "gameSlug": "openra" },
  "timestamp": "2026-08-04T10:00:00.000Z",
  "sessionId": "...",
  "anonymousId": "...",
  "userId": null
}
```

Validated with Zod. Rate-limited (~60/min/IP). Enriches `ip`, `country`, `browser`, `os`, `device`.
