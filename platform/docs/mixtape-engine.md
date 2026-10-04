# Mixtape Engine

The PlayBound admin screen at `/admin/mixtape` owns the music library and the
menu soundtrack. The game fetches metadata at boot and every two minutes, so
publishing another track or changing menu music does not require a client patch.
The initial catalog is deliberately empty. No example artist music or discount
codes are published.

## Setting up the library

Upload artist-approved OGG, MP3 or WAV audio (up to 50 MiB) and PNG/JPG covers.
Add track and artist metadata, official links and any artist-supplied discount.
Select a tape in **Menu music** and save to set title/menu playback independently
of the player collection. Disabled tapes disappear from the playable catalog.
The admin library includes preview playback, filtering and collection counts.

Exactly five available tapes must be marked **Universal base tape**. At least
fifteen other available tapes are needed before the first starter pack can be
granted. The launch target is 100 (5 + 95); the empty or incomplete catalog never
consumes a player's grant. Once ready, an account receives the five base tapes
and fifteen unique random tapes, once, plus a default six-tape deck.

## In the game

**Mixtapes** opens the cassette shelf. Up/down browses, left/right selects a
deck slot, confirm equips, Start saves, and the slap button opens the J-Card.
Equipping a tape already in another slot swaps those slots. The J-Card displays
cover art, album/year, biography and the supplied discount code, with controls
to open the store, official website or Spotify. **Options > Audio > Music volume**
controls music independently of effects.

Signed-in Connect opponents register deck snapshots using their room
capabilities. Both receive the same alternating host/client twelve-tape playlist.
Playback advances at track completion and set boundaries. A local game uses the
local deck. Signed-out/LAN play still works, without collection rewards.
Audio does not enter the deterministic simulation or checksum.

The current asset is fetched asynchronously over HTTPS into a 300 MiB bounded
disk cache. Covers load on inspection; the full library is never loaded into
RAM. Failed songs are skipped; unreachable services leave gameplay available.

## Dubbing

Both signed-in players must report the same winner and stable result checksum
after rollback confirms the match is over. Only that winner can claim one
available unowned tape from the opponent's captured deck. The opponent retains
their original. Claims are atomic and retryable; an interrupted award can be
retried without selecting a second tape. **Dub Tapes** is on the online results
screen, with owned tapes marked **In Collection**.

This is a casual peer-confirmed reward flow, not authoritative ranked anti-cheat:
two cooperating players can agree on fabricated results. Ranked matchmaking and
server-side simulation verification are not yet present in HyperDisc.

Tester accounts can be reinitialized from the admin screen. Previous collections
are archived (last twenty resets). This control refuses regular accounts.

## API

`GET /api/mixtape/catalog` is public. The player and match routes require a
PlayBound game/launcher bearer and derive identity from it, never a body user ID.

- `GET /api/mixtape/player`: initialize once and return inventory/deck.
- `PUT /api/mixtape/player`: `{trackIds:[six distinct owned IDs]}`.
- `POST /api/mixtape/match`: `action: register | report | dub`.
- `GET /api/mixtape/match?matchId=...`: participant-only roster/result.
- `/api/admin/mixtape`: admin library, settings, statistics and tester reset.
- `/api/admin/mixtape/upload`: admin-scoped Blob uploads.

## Verification

Run Godot's `tests/run_tests.gd` and `tests/test_mixtape.gd`. The latter generates
temporary silent WAV audio to verify disk cache and decoding without publishing
music. `tests/mixtape_preview.tscn` renders synthetic cassette/J-Card fixtures.
PlayBound's `src/lib/mixtape` Vitest suite covers starter grants, deck ownership,
result agreement, room capabilities and concurrent reward claims.
