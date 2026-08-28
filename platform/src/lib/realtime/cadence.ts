import cadence from "./cadence.json";

/**
 * How often each live surface re-reads, for the website and the launcher alike.
 *
 * These used to be hardcoded separately in both clients, which is how they
 * drifted: notifications polled every 6s in the launcher and every 45s on the
 * web, for identical data. The numbers now live once in `cadence.json`, and
 * `launcher/scripts/sync-cadence.js` generates the launcher's copy at build
 * time — the same arrangement `catalog.js` already uses. Change a value here
 * and both clients pick it up; never reintroduce a literal at a call site.
 *
 * ── Why each value is what it is ────────────────────────────────────────────
 *
 * `notificationPollMs` — 10s. Notifications are not a background feed: they
 * are the ONLY delivery path for `party_invite`, `play_invite` and
 * `party_launched` ("we are starting, get in"). Nobody should learn that a
 * match started 45 seconds ago, which is what the web was doing. It is also
 * not worth 6s of polling forever, which is what the launcher was doing. Ten
 * seconds is the compromise: a visible improvement for the web, and slightly
 * cheaper than the launcher's old rate.
 *
 * `friendsPollMs` / `livePartyPollMs` — presence and roster. A party lobby is
 * the one place seconds are visible (someone readies up and everyone should
 * see it), so a live party polls faster than an idle friends list.
 *
 * `partyChatPollMs` — chat feels broken if it lags much past this.
 *
 * `discoverablePartiesMinMs` / `upcomingEventsTtlMs` — throttles for the two
 * expensive extras that ride along with the party payload. Neither has to be
 * current to the second, and computing them every pass dominated the cost of
 * the poll they were attached to.
 *
 * `couchSignal*` — WebRTC signalling for phone controllers. Handshakes are
 * bursty: a flurry of offer/ice while a phone connects, then silence for the
 * rest of the session. Polling at the active rate throughout meant ~120
 * requests a minute to be told "nothing happened". The client polls at
 * `couchSignalActiveMs`, decays to `couchSignalIdleMs` after
 * `couchSignalIdleAfterEmptyPolls` consecutive empty replies, and snaps back
 * the moment anything arrives. The idle rate is deliberately not slower than
 * this: a second phone joining mid-session is a fresh offer arriving after a
 * long quiet stretch, and that player waits the idle interval to connect.
 */
export const CADENCE = {
  notificationPollMs: cadence.notificationPollMs,

  friendsPollMs: cadence.friendsPollMs,
  livePartyPollMs: cadence.livePartyPollMs,
  partyChatPollMs: cadence.partyChatPollMs,
  discoverablePartiesMinMs: cadence.discoverablePartiesMinMs,
  upcomingEventsTtlMs: cadence.upcomingEventsTtlMs,

  couchSignalActiveMs: cadence.couchSignalActiveMs,
  couchSignalIdleMs: cadence.couchSignalIdleMs,
  couchSignalIdleAfterEmptyPolls: cadence.couchSignalIdleAfterEmptyPolls,
} as const;

export type Cadence = typeof CADENCE;
