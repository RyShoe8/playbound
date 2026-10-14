# PlayBound server management

The website's My Servers detail and the launcher's native My Servers workspace
use `/api/hosting/servers/:id`. The Ctrl+P helper uses the same permissions and
game settings through the hosted overlay endpoint. Community servers remain
read-only to ordinary party leaders; administrators manage them through the
existing administration pages.

## Everyday controls

- Overview: connection address, players, runtime status, and per-process CPU
  cores and memory. Unknown and stale measurements are not shown as zero.
- Settings: name, description, visibility, and validated game rules. Private
  visibility hides the listing; it is not a game password.
- Maps and Bots: shown when the game declares these capabilities. Map
  rotation, next map, and live/restart changes follow the game's adapter.
- Players: connected players, kick, bans, and unban where the game supports
  them. Names and IDs are escaped; player addresses are not sent to clients.
- Backups: configuration restore points and separately labelled world-data
  backups. World support depends on an isolated, declared data directory.
- Access: owner, administrator, and moderator roles, checked on every request.
- Activity: recorded changes with actor and time.
- Console: advanced game commands and responses, restricted by the existing
  customer console guard. This is not a shell or a stream of process logs.

The launcher's workspace bridge allows exact endpoint/method pairs only.
It does not grant permissions: the API authorizes every operation again.

Ctrl+P keeps quick in-game settings, maps, bots, player refresh/moderation,
permitted lifecycle actions, and game console together with game/controller
help. Stop and Restart explicitly warn about disconnections. Starting is
disabled when the runtime is pending or unreachable. Billing, team management,
and destructive world restoration belong in My Servers rather than over a game.

## Daily maintenance

Daily maintenance is off by default. Owners/administrators may select a UTC
hour for an optional empty-server restart. The existing VPS hosting timer
checks every 15 minutes. Maintenance:

1. Requires a running customer server and a successful zero-human-player query.
2. Atomically claims the server's UTC date before dispatching side effects.
3. Saves a configuration restore point using the subscription's retention.
4. Queries occupancy again and rechecks desired state, runtime identity, and
   the enable switch immediately before requesting a restart.
5. Records the outcome in Maintenance and Activity.

Occupied/unreachable servers wait within the hour. A missed window waits until
the next day. A claimed attempt is not replayed that day after a worker crash
or ambiguous response; recovery is handled by the existing hosting reconciler.
This favors avoiding duplicate restarts. It cannot atomically prevent a player
joining between the final game query and the restart request.

Maintenance does not update binaries or save world files. Configuration
backups are not substitutes for world backups.

## Scope of the comparison

The reference platforms' common management features informed these controls:
[Pelican](https://pelican.dev/),
[GameServerApp](https://www.gameserverapp.com/feature/game-server-manager),
[GameAP](https://gameap.com/),
[Pterodactyl](https://pterodactyl.io/),
[PufferPanel](https://docs.pufferpanel.com/en/2.x/featuretour.html), and
[AMP](https://cubecoders.com/AMP).

This is not complete feature parity with those platforms. Arbitrary file
editing/uploads, FTP/SFTP, process-log streaming, a general task scheduler,
plugin/Workshop installation, database administration, and customer-triggered
binary updates are not implemented by these changes. Several PlayBound
recipes share installed binaries, so a per-server Update button must first
have coordinated versioning and protection for other running servers. None
of these features is represented by a nonfunctional button.

No hosting backend is replaced or installed. Existing recipes, measured
capacity, stable server identities, and ServerControlAdapter remain authoritative.

## Verification

`platform/src/lib/dedicatedHosting/maintenance.test.ts` covers the UTC window,
validation, role denial, concurrent claims, unknown/occupied queries, backup
failure, and players joining during preparation. Existing Dedicated integration
tests cover lifecycle, settings, maps, bans, roles, and restore points.

`launcher/scripts/smoke/hosting.spec.js` starts the real Electron application
with an isolated offline fixture. It checks owner/moderator navigation, typed
bot settings, maintenance persistence, disabled restore controls while online,
console escaping/error handling, and a compact window. No live game or database
is changed by that test.
