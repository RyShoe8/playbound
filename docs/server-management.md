# PlayBound server management

The full-inventory rollout is tracked in
[server-hosting-parity-plan.md](server-hosting-parity-plan.md). New hosting games
and editions must follow
[dedicated-server-game-checklist.md](dedicated-server-game-checklist.md).

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

Self-hosted party leaders also have a typed Restart local server action on the
web and in Ctrl+P. It increments the desired revision atomically without
overwriting settings, then the host launcher reconciles it. Only ready local
servers qualify; public/community/VPS servers do not use this action. Refresh
status reads the acknowledged state without adding continuous polling.

Launcher source includes host-only local diagnostics in the existing Server
tab. Both server output pipes are drained; the preview retains at most 100 lines,
omits lines over 4 KB, and redacts known secret settings/credential labels.
No output is uploaded. The IPC handler rechecks party leadership and local
ownership before reading. Replaced/stopped child exits cannot mark successors
offline, and asynchronous spawn errors are handled without an uncaught crash.
These launcher additions require the next distributed launcher build.

Local argument builders now distinguish OpenRA/OpenHV `key=value`, Teeworlds/DDNet
console arguments, BZFlag flags, DarkPlaces commands, Quake cvars plus map
commands, and TES3MP config-only settings. The cross-layer local-delivery suite
exercises all declared defaults and enum options for nine existing profiles.
OpenE2140 retains its explicit `Game.Mod=e2140`; this does not enable its still
unassessed management profile. Unassessed local engines retain the legacy path
until their own native delivery is implemented and verified.

Protocol references: [OpenRA's dedicated launch script](https://github.com/OpenRA/OpenRA/blob/bleed/launch-dedicated.sh),
[Teeworlds server setup](https://www.teeworlds.com/?page=docs&wiki=server_setup),
[Teeworlds console argument parser](https://github.com/teeworlds/teeworlds/blob/master/src/engine/shared/console.cpp),
and [BZFlag server setup](https://wiki.bzflag.org/Creating_a_server).

Ctrl+P keeps quick in-game settings, maps, bots, player refresh/moderation,
permitted lifecycle actions, and game console together with game/controller
help. Stop and Restart explicitly warn about disconnections. Starting is
disabled when the runtime is pending or unreachable. Billing, team management,
and destructive world restoration belong in My Servers rather than over a game.

## Saved-file management

The Files tab is available to owners/administrators for the 13 recipes with
an explicitly isolated saved-data directory. Moderators cannot access it.
The web and native launcher support folders, download, upload, text edits,
file deletion, and restoring previous file versions. File writes require a
fully stopped server on both the control plane and agent. The agent uses the
same per-server lock as process startup and executes its small file operation
synchronously, preventing a start from racing the stopped check.

The service chooses the recipe from the server's profile. Clients cannot name
host directories or recipes. Traversal, hidden paths, symlinks, hard links,
special files, executable extensions, plugin/script directories, and sensitive
filenames are rejected. Host environment/configuration and shared binaries are
outside the accessible roots. Readable content is trusted only as data.

Browser transfers are limited to 3 MB (fits the control plane's request/response
limits); text editing is limited to 256 KB. Larger saves are visible but cannot
be transferred through this browser interface. The server must have been
started once to initialize its saved-data folder. Every overwrite/delete
retains the previous file, with at most 50 revisions per server. Updates require
the opened file's SHA-256 version, so stale editors fail rather than overwrite
other changes. Writes reserve at least 2 GB and 10% of host disk and enforce a
5 GB saved-data/history ceiling. File history is not a world backup.

Arbitrary executable plugins need isolation beyond the current shared OS
account before customer installation is enabled. Customer file access does
not grant permission to modify shared game installations.

## Coordinated installation updates

The existing game-servers admin panel has an operator-owned update queue for
CS2 (Steam app 730), Team Fortress 2 (232250), Unturned (1110390),
Counter-Strike: Source (232330), Core Keeper (1963720), Don't Starve Together
(343050), Barotrauma (1026340), and Necesse (1169370). These
are the installed anonymous-SteamCMD distributions currently supported.
Customer owners and moderators cannot update shared binaries. Admin Viewer
can read the queue; writes recheck the administrator's current database role.

Queueing an update immediately pauses new starts for that installation,
including party servers, community servers, customer servers, and aliases.
Already-running servers are never stopped by the queue. Stop them deliberately
when players are finished. A 15-second agent check waits for affected rooms
and in-flight starts, then uses a root-owned **read-only** process scanner to
check for unmanaged processes too. Unknown scan results fail closed. The
scanner inspects executable/cwd paths only, never command lines or environments.
Only one installation worker runs at a time.

The detached worker copies the installation to a sibling staging directory
without following customer-save symlinks. SteamCMD updates that copy with
fixed anonymous app IDs; no customer URL, command, token, or path is accepted.
Copy and download commands run at low CPU/I/O priority with a 90-minute bound.
Before copying, free disk must cover 125% of the current installation's size
plus the larger of 8 GB or 10% of the disk. During commands, reaching that disk
reserve stops the operation. SteamCMD success, a complete matching manifest,
and required executable files are checked before activation; processes are
checked again immediately before swapping directories.

Activation renames the old installation into a retained rollback directory,
then renames the verified staging directory into place. Rollback is queued
with the same offline checks and start gate. No servers are automatically
restarted. A completed update confirms installation files, not client Join
compatibility. Current desired-state reconcilers can resume servers normally.
Root operators must also honor this maintenance window when starting binaries
manually; no control-plane lock can prevent an unrelated root shell's exec.

Job state, actor ID, build IDs, and worker process identity are persisted under
the agent state directory. An agent restart adopts a still-running worker.
If the worker disappears or activation becomes uncertain, starts stay blocked
and the admin panel reports `interrupted`. Operator recovery requires checking
the manifest, affected processes, and generated `.pb-update-*`/`.pb-rollback-*`
directories before repairing the installation and resolving that job. Do not
blindly retry or clear an interrupted job. A waiting job can be cancelled.

Retained rollback and partial staging copies are intentionally not pruned
automatically. An operator must archive/remove unneeded generated copies after
inspection; only paths directly under the configured games root may be removed,
and customer save symlinks must never be followed. New jobs fail on insufficient
space; at 500 history rows further jobs require operator archival. The scanner
currently supports `/opt/playbound-host/games` only; other roots fail closed
until a root-owned scanner is explicitly configured for them.

Install the scanner separately with
`platform/game-host/install-update-scanner.sh` as root. It installs a root-owned
helper and a sudoers rule permitting only its eight fixed read-only scans.
Workers and SteamCMD continue running as the agent service user. No game
installation or privileged shell is run by that helper.

Executable plugin/Workshop support remains blocked on per-customer OS/container
isolation: current recipes share the `playbound` account and host installations.
Restricting upload extensions alone cannot isolate a plugin's filesystem,
process, network, or secret access. This queue does not enable arbitrary plugins.

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

This is not complete feature parity with those platforms. FTP/SFTP,
process-log streaming, a general task scheduler,
plugin/Workshop installation, database administration, and customer-triggered
binary updates are not implemented by these changes. Shared binary updates
are deliberately admin-only and limited to the eight installations above. None
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
