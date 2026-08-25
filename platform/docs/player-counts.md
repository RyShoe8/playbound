# Player count policy

PlayBound reports real, current player activity. A missing source is unknown,
not zero. Never invent a population, substitute a different game's audience,
or present a community estimate as a live count.

## What the displayed total means

For a game, `Playing now` is the best non-duplicated total available from these
three source classes:

1. **Official game or master servers** — Prefer an official world list,
   metaserver, lobby API, or public server browser. Sum the players reported by
   the source when it exposes complete per-server populations. This is normally
   the best representation of the whole game, including players who do not use
   Steam or PlayBound.
2. **Steam concurrency** — Use Steam's current-player endpoint for the exact
   App ID when no more complete official population source exists. Steam counts
   everyone currently running that Steam application, not necessarily everyone
   in multiplayer. Label it as Steam concurrency rather than public-server
   population.
3. **PlayBound presence** — Count unique PlayBound users whose launcher or
   browser presence currently reports that exact game slug as `playing`.
   Expired heartbeats are excluded.

These numbers are not automatically additive. Choose a primary external count,
then add PlayBound-only players only when they can be proven absent from that
external source. In the usual case Steam, an official server list, and
PlayBound presence overlap, so the UI must show the primary count and the
PlayBound count as separate labelled facts rather than summing them.

## Source priority and deduplication

- Prefer a complete official population over Steam concurrency.
- Prefer Steam concurrency over an unofficial estimate.
- A public server list may be summed only when the source is intended to be a
  complete list. If it is partial, label the result `players on listed servers`.
- Do not add Steam concurrency to official-server totals unless the two
  populations are documented as mutually exclusive.
- Do not add PlayBound presence to Steam or official totals merely because the
  PlayBound user launched through PlayBound. That player is likely already in
  the external number.
- Deduplicate PlayBound presence by authenticated user ID. If no authenticated
  ID exists, use the launcher's stable anonymous installation ID. Never count
  browser tabs, heartbeats, parties, or sessions as players.
- An edition may have its own population only when the upstream source
  identifies that edition or realm. Otherwise the count belongs to the parent
  game and must not be copied to every edition.

## Zero, unknown, and errors

- `0` means a successful live source explicitly reported no players.
- `null` means the population is unknown or no honest public source exists.
- A timeout, parse failure, rate limit, missing credential, or upstream outage
  is an error/unknown state. It must never be converted to zero.
- Keep the last successful value only when the UI also shows its timestamp and
  marks it stale. Do not describe a cached value as live.
- Matchmaking-only games whose publishers expose no live population should show
  `Player count unavailable`, not `0 online`.

## Provider requirements

Every provider added under `src/lib/servers/providers/` must:

- use an official or first-party source when one exists;
- identify the exact game, edition, realm, and platform being counted;
- return the source timestamp when available and record PlayBound's fetch time;
- distinguish total concurrency from players visible in public matches;
- throw or return an error for malformed responses instead of returning zero;
- include parser tests, including a missing-count fixture that proves unknown
  data is not silently zeroed;
- document authentication, rate limits, cache duration, and known coverage gaps;
- avoid scraping terms-prohibited or login-gated pages;
- never use review counts, Discord members, downloads, registered accounts,
  peak records, or third-party modelled estimates as `Playing now`.

Register the provider in `src/lib/servers/registry.ts`. Games without an honest
source should remain unregistered and be documented in the registry's unsupported
source notes.

## UI labels

Use the narrowest truthful label:

- `Playing now` — complete official current population.
- `On official servers` — summed official server/world rows.
- `Playing on Steam` — Steam application concurrency.
- `On listed servers` — a known-partial public server list.
- `Playing via PlayBound` — current unique PlayBound presence.
- `Player count unavailable` — no honest source or a current source failure.

Every surfaced count should expose its source and last-updated time in supporting
text or a tooltip. The public API must preserve source metadata so clients do
not have to infer what a number means.

## Adding a newly catalogued game

1. Search for an official status, world, lobby, metaserver, or server-list API.
2. If none exists, check whether the exact PC build has a Steam App ID and a
   public current-player result.
3. Add and test a provider only when one of those sources is honest and stable.
4. Verify that PlayBound presence uses the same canonical game slug.
5. Confirm the page shows unknown—not zero—while the provider is absent or
   failing.
6. Record the decision and coverage caveat in the registry, including why a
   seemingly convenient proxy was rejected.

## Examples

- **Old School RuneScape:** use Jagex's official world list, not Steam, because
  Steam represents only a small fraction of the game's population.
- **Apex Legends:** Steam concurrency is a truthful Steam-only number. Do not
  imply that it includes EA app or console players.
- **Tomb Raider 1+2+3:** the master deliberately represents a trilogy, so its
  Steam portion sums the exact concurrent counts for Steam apps 224960, 225300,
  and 225320. Keep the three component rows labelled and do not include OpenLara
  or PlayBound presence in that Steam subtotal.
- **Dune Legacy:** use the official metaserver's active hosted games and player
  capacities when available. Do not count an empty metaserver as proof that no
  one is playing campaigns or private/LAN matches.
- **PlayBound parties:** party membership is not population. Count a member only
  after current presence reports the game as `playing`.
