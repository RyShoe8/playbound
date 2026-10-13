# Friends play availability

The Friends page offers one-time play windows and an optional usual-week template. Multiplayer includes a compact summary and shortcuts to share a two-hour window or open Friends to plan a session.

Availability lives in `PlayAvailability`, keyed uniquely by user ID. It does not change Presence, LFG, party membership, the catalog, or any hosting setting. `/api/friends/availability` supports session and linked-launcher authentication; writes always target the authenticated user. Reads return only that user and accepted friends. Pending, blocked, unrelated, disabled, appear-offline, and activity-hidden accounts do not appear in the friends response. Responses are private and uncached.

Users may explicitly enable “Show me in Looking to Party during my play windows.” It defaults off, including for existing records. The public count and authenticated player list merge currently active opted-in windows with manual LFG, deduplicated by user ID. The same offline/activity privacy settings apply. The full schedule is never returned in the wider player list. Scheduled availability does not write Presence or enqueue automatic matchmaking. Stopping Looking to Party disables automatic listing without deleting availability. Availability writes invalidate the activity cache; boundaries are evaluated on each fresh list/count read.

One-time windows expire at their end; expired windows are omitted on read. Weekly windows persist until changed or stopped, use an IANA timezone, and never opt users in by default. Overnight weekly windows must be split across the two calendar days. The shared-time finder scans real instants over seven days, comparing each person's local weekly schedule; skipped and repeated DST hours therefore follow that person's timezone. It offers 30-, 60-, or 120-minute sessions. Unsaved edits do not affect matching.

Creating a Game Night uses the existing `/api/events` service and event view. It creates an ordinary community-hosted, unlisted event. Unlisted means accessible by link, not access-controlled. No selected friend is automatically RSVPed or messaged. The organizer shares the event link themselves. Installed games shared by everyone are highlighted; other multiplayer games remain selectable.

The initial UI is on the website, including `/new`; the launcher can use the same authenticated API, but its native Friends UI has not been changed by this feature.

Regression coverage includes expiration, exact-minute overlaps, cross-timezone matching, both DST transitions, validation, anonymous access, write ownership, isolated-Mongo friendship/privacy filtering, idempotent availability writes, and ordinary unlisted Event creation. Tests use an ephemeral database and do not write to production.
