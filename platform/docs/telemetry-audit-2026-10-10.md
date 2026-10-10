# Telemetry audit — 2026-10-10

Scope: browser provider → `/api/telemetry` → `saveEvent` → `TelemetryEvent`, the
launcher's `telemetry.js`, server-side emitters, and the admin analytics views.
Code review only; the live-data checks at the bottom still need an admin session.

## Fixed in this pass

| # | Finding | Fix |
|---|---------|-----|
| 1 | **Recent events looked broken.** The page merged up to 25 "pinned" rare events (launcher install, errors) into the latest 40 by timestamp, so the table showed an hour of live traffic and then jumped back days. | Pinned events removed. Recent events is a plain newest-first feed of 50, filterable by any event. `PINNED_ANALYTICS_EVENTS` and its test deleted. |
| 2 | **`createdAt` came from the client clock.** `saveEvent` stored whatever `timestamp` the browser or launcher sent. A PC with a drifted clock filed events days off, and every report sorts and buckets on `createdAt`. | `resolveEventTime`: the server clock is authoritative. A client time is honoured only when it is at most 48 h old and no more than 5 min ahead (delayed retries); a future stamp is clamped to receive time. Rejected values are kept in `properties.clientTimestampRejected` so skew stays visible. |
| 3 | **"Today", the 14-day chart and date filters used the server's timezone (UTC)**, and `to=2026-10-09` meant UTC midnight so it excluded the day it named. | Day boundaries follow the admin's timezone (cookie `pb_admin_tz`, set by the admin layout, plus a `tz` field on the filter forms). `to` now includes the whole day. Applies to Analytics and Gameplay. |
| 4 | Event identifiers (`launcher_install`) shown raw in admin. | `formatEventName` → "Launcher Install". Used in Top events, Recent events, the filter, and the Ops console. Raw name kept in the `title` tooltip. |
| 6 | A failing auto-bug upsert made ingest return 503 after the event was already stored, so clients retried and could double-count. | The upsert is now caught inside `saveEvent`. |
| 5 | No way to filter by an event unless you typed its exact name. | Event dropdown lists every event seen in the last 90 days with counts (cached 5 min). |

Times in tables were already viewer-local (`LocalTime` formats in the browser,
with a UTC fallback on first paint). Storage is UTC throughout.

## Fixed in the follow-up pass

| # | Finding | Fix |
|---|---------|-----|
| 7 | 18 `void saveEvent(...)` call sites lost events when the serverless function froze after responding. | New `trackServerEvent` (uses `after()`, falls back to a background write outside a request, never rejects). All 18 call sites switched; awaited callers unchanged. |
| 8 | Any caller could mint any event name. | Ingest accepts only `^[a-z][a-z0-9_]{1,63}$`. Every emitter in the launcher and platform already conforms. |
| 9 | Rate limit was 60/min per IP, so shared addresses dropped events. | Per installation (`anonymousId`) 120/min, plus a 600/min per-IP backstop. |
| 10 | Launcher dropped any event sent while offline. | `telemetry-queue.json` in userData holds failed events (max 200, 24 h). Network errors, timeouts, 429 and 5xx are queued; other 4xx are dropped. Flushed on startup and after any successful send, oldest first. `launcher_install` keeps its own receipt-based retry. |
| 11 | Properties over 8 KB were replaced wholesale by `{_truncated: true}`. | Long strings are shortened first; if still too big the largest values are dropped one by one and named in `_droppedKeys`, so identifying fields survive. |
| 12 | No retention. | Partial TTL index: `page_view` rows expire after 180 days. Every other event is kept. Takes effect when the index builds on the next deploy; **it deletes page views older than 180 days**. |
| 13 | A client-supplied `isBot` flag set the bot column. | Ignored. `webdriver` (browser-reported) and user-agent detection remain. |
| 14 | Raw IPs stored. | IPv4 last octet zeroed, IPv6 reduced to /48 before storage. Country still comes from edge headers. Update the privacy policy wording if it promises full-IP handling either way. |
| 15 | Dashboard (`/admin`) and Content analytics bucketed days in server time. | `periodDocumentCounts`, `periodDistinctUsers` and the Content page read the admin timezone cookie. |
| 16 | `/api/admin/telemetry` parsed `from`/`to` as UTC midnight. | Plain dates are calendar days in the admin's timezone (`to` inclusive); full timestamps still work. |

## Live-data results (2026-10-10, production)

- **Clock skew.** Compared stored `createdAt` with the insert time embedded in each
  document id. Web events (967 sampled, last 8 h): worst skew 5 s. Launcher events (3,000
  sampled back to 28 Aug): median 0.7 s, but 8 were off by more than a minute and 5 were
  off by almost exactly one hour behind (-3601 s), the signature of a wrong timezone or
  DST setting on the player's PC. These are the events fix 2 now corrects.
- **Sources.** Events are labelled `source` = web (no label), `website` (server-side
  emitters) or `launcher`. 32 of 1,000 recent events have no `sessionId` (server-side
  emitters), as expected.
- **Launcher funnel.** 34 `launcher_install` and 24 `launcher_connected` in total; the
  newest install was 6 Oct. Launcher volume in the sample: 715 launch attempts, 598
  launches, 546 game-ended, 97 launch failures, 85 install failures, 51 errors.
- **Unknown or retired names.** Every event name seen in the sample is one the code
  emits; none looked like typos.
- Not measured: volume per event over the full history (needs an aggregate query; the
  new event dropdown on `/admin/analytics` shows 90-day counts once deployed).
