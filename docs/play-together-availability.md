# Play Together availability matching

The website and launcher homepage use the same edition-level popularity feed,
ranked by human playtime over the last **14 days**, cached for 15 minutes.

On the website, Play Together starts closed below 801px. The keyboard-accessible
toggle reveals scheduling, preferences and matches; the desktop panel stays open.
The mobile party lobby keeps the selected game, readiness, voice, roster and chat
visible, with game/hosting settings behind an expandable control.

## Notification path

- Saving availability or play preferences schedules matching with Next `after()`;
  saving does not wait for matching. Existing notification polling delivers results.
- The existing five-minute `/api/cron/presence-sweep` also runs matching, after
  stale memberships are released. This catches recurring and future play windows
  when they become active, even without an open homepage or launcher heartbeat.
- `/api/cron/ltp-match` remains an authenticated manual entry point into the same
  worker. There is no second scheduled job or per-user background poll.
- Matches are **site-wide**, between people currently publishing availability.
  They honor blocks, disabled accounts, activity privacy, play-invite and activity
  notification preferences, both people's game/genre preferences, installed
  editions/platforms, and explicit willingness to download a free game.
- A compatible public forming/ready party is reused where possible. Otherwise the
  normal party creation path opens a public lobby with one leader; the other
  player is never silently enrolled. Server/game startup still requires the normal
  readiness and launch controls. Existing memberships and playing parties are not moved.
- Both notifications point to **the same party**, carry `actions: ["join"]`, and
  work from the website bell, launcher bell/toast and native notification click.
  Mobile web sign-in retains the party destination.

## Retry and load behavior

`PlayTogetherLease` uses Mongo's built-in unique `_id` index to serialize cron and
save-triggered workers. The lease expires after two minutes if a worker dies.
Matching has a bounded 40-second scan and yields between batches of comparisons.
Current-time schedule checks avoid scanning six hours minute by minute.

Automatic parties retain an `availabilityMatch` journal (participant IDs, window
key and expiry). A later worker can repair partially delivered notifications
without creating another lobby. Notification upserts use the existing unique
`{ userId, dedupeKey }` index. Reading an alert does not reset its deduplication;
ending a matched party does not reopen it during the same availability window.

Validation uses an isolated Mongo database and browser fixtures. It never sends
test invitations to production users. Normal deployment must include the model
registry/index checks; new launcher notification behavior requires a launcher build.
