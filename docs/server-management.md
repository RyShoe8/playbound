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

- Logs: owner/administrator access to the latest captured output, up to 200
  complete lines. Refresh manually or opt into live output, which requests a
  fresh bounded snapshot every five seconds while the Logs tab/window is visible.
  Requests never overlap; pause, navigation and permission/host errors stop
  following. Each request rechecks log access. This uses short authenticated
  requests, not a permanent connection or unbounded retained transcript.
  Credential-bearing lines and token-shaped
  values are redacted. Managed stdout/stderr, RimWorld's console capture and
  ANEURISM's privileged capture share the same view. Retention runs every five
  minutes, rolling logs over 8 MiB to a private 64 KiB tail. Active legacy
  ANEURISM writers adopt their bounded retention on the next natural restart.
  Diagnostic output can be lost at rollover; use Activity for management audit.

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
- Maintenance: choose UTC weekdays, an hour, and either configuration backup
  only or backup followed by an empty-server restart. Backup-only tasks keep
  running/stopped state unchanged and do not depend on a player query. The next
  saved window is shown in your local time. For restarts, player-count
  failures and occupied servers wait safely; the last check explains why.
  Only one check snapshot is retained, with one restart claim per calendar day.
  Existing daily schedules remain unchanged until their owner edits them.
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

Web and native launcher transfers are limited to 64 MB per file, using 1 MB
chunks with progress and cancellation. The agent hashes and copies large files
in bounded memory; the browser assembles downloads up to the 64 MB limit.
Uploads are scoped to the authenticated user, server, recipe and destination,
expire after one hour and allow at most two pending sessions per server.
Only a complete upload with an unchanged destination is atomically installed;
interrupted uploads leave the original file intact. Downloads reject file
changes between chunks. Text editing remains limited to 256 KB.
The server must have been
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
(343050), Necesse (1169370), and Barotrauma (1026340). These
are the installed anonymous-SteamCMD distributions currently supported.
Mindustry adds a separate official GitHub JAR handler to the same queue. It
requires a stable `Anuken/Mindustry` release, the exact `server-release.jar`
asset and its published SHA-256 digest. HTTPS redirects stay on GitHub artifact
hosts; download size/time and free disk are bounded. Before activation, ZIP CRC,
dedicated-server entry point, matching release version, and installed Java are
checked without executing the downloaded JAR. Java and unzip must already be
installed; the updater never installs OS packages. Existing custom wrappers or
alternate `Mindustry.jar` installs require operator review.

Mindustry saves/configuration remain in their existing per-server homes outside
the installation. Its scanner covers these homes and conservatively waits for
unclassified Java processes, since a JVM can open a JAR from any working
directory. This can delay an update while another Java server is running;
the queue never stops that server or inspects its arguments/environment.
VPS fixtures verified 159.7 -> 160.7 -> 159.7, retaining the production JAR;
a temporary 160.7 server answered the real zero-player/two-slot query. Client
Join and save-format compatibility are separate checks.
The package and launch method follow the [official server documentation](https://github.com/MindustryGame/wiki/blob/master/docs/servers.md)
and [upstream releases](https://github.com/Anuken/Mindustry/releases).

OpenRA's official Red Alert, Tiberian Dawn and Dune 2000 installation is updated
as one family. All three Linux x86_64 AppImages must belong to the same stable
release. Packages need a published GitHub SHA-256 digest or an explicitly
reviewed historical pin. The 20250330 pins were checked against official assets
and upstream zsync checksums on 2026-10-14. Unknown releases without a digest
fail closed; no checksum is silently invented at download time.

The handler uses installed `unsquashfs`, never executes the AppImage, and limits
paths, file types, extracted size, CPU workers, buffers, output and disk use.
It uses Dune 2000's complete engine plus all official mod data: the historical
RA-first installer omitted `OpenRA.Mods.D2k.dll`. Fresh installs now choose the
complete engine first; existing installs are repaired through the queue.
Engine and mod release versions and runtime declarations must agree. Combined
Arms, OpenHV and Earth 2140 distributions are not updated by this handler.

An initial `.pb-openra-manifest.json` must be adopted with
`seedOpenRABaseline(current, reference)` against an exact independently rebuilt
official reference. For historical installs, `buildOpenRARelease` can produce
the old RA-first reference with `createLegacyReference: true`. Never generate
a baseline merely by trusting the installed files. Every later update/rollback
checks the full baseline; extra/modified files or links require operator review.
The current installation remains intact until the normal guarded swap, and
the complete previous copy remains available. Support data is not rewritten.
Isolated VPS checks exercised real archives, activation/rollback, and the TCP
protocol handshake for all three modes. A handshake is not a full client Join
or a player-count query.

Barotrauma uses private runtime copies. Before updating the shared installation,
the worker inventories stopped copies against their saved baseline (or the
current depot for legacy copies). Unknown modifications block the update.
At the next start, each copy receives the new binaries through a staged swap,
preserving server settings, campaigns, bans, permissions and logs. Shared
identity/settings files, bans, permissions and worlds are never seeded into a
new customer copy; fresh copies receive default karma/campaign tuning only.
Complete previous
runtime copies stay in that server's home; after three retained copies an
operator must archive them before further migrations. Linked files, insufficient
disk and uncertain crash recovery fail closed. A crash between swaps restores
the prior runtime and retains staging for inspection. The read-only process
scanner covers both shared and private Barotrauma paths.

Rolling back binaries preserves the current save data; it does not rewind a
campaign or guarantee that an older engine can read a newer save format. Use
world backups deliberately when such a restore is needed. Migration fixtures
cover updates/rollback, legacy copies, interrupted swaps and save isolation;
a real game/client compatibility check remains separate.

The state paths follow the [official configuration reference](https://barotraumagame.com/wiki/List_of_Config_Files)
and [custom permission preset guidance](https://github.com/FakeFishGames/Barotrauma/blob/master/Barotrauma/BarotraumaShared/Data/permissionpresets.xml).
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
helper and a sudoers rule permitting only its twenty-three fixed read-only scans.
Workers and SteamCMD continue running as the agent service user. No game
installation or privileged shell is run by that helper.

Executable plugin/Workshop support remains blocked on per-customer OS/container
isolation: current recipes share the `playbound` account and host installations.
Restricting upload extensions alone cannot isolate a plugin's filesystem,
process, network, or secret access. This queue does not enable arbitrary plugins.

## Daily maintenance

Daily maintenance is off by default. Owners/administrators may select a UTC
hour and weekdays for a configuration backup or an empty-server restart. The
existing VPS hosting timer checks every 15 minutes. Configuration-only tasks
also include stopped servers with active subscriptions, require backup permission,
claim the UTC date before writing, respect existing retention, and never launch,
stop or restart the game. These are configuration restore points, not world-save
backups or software updates. Arbitrary scheduled console/shell commands are not
accepted. Restart maintenance:

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
are deliberately admin-only and limited to the twenty-three declared installation handlers. None
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

### OpenHV installation updates

OpenHV uses its official stable GitHub x86_64 AppImage, preserving the existing
launch format. Updates require the release SHA-256, exact official asset URL,
bounded ELF/SquashFS checks and matching embedded `mods/hv/mod.yaml` version.
The engine VERSION is a separate OpenRA release identifier and is validated
independently. AppImage code is not executed during download/validation.
The installed image is hashed with a bounded buffer and cached by file identity,
size, timestamps and permissions; custom files and unknown legacy images refuse
replacement. The reviewed 20250725 digest supports the existing VPS installation
without rewriting it. Settings/support data remain outside the binary swap.

OpenRA rooms and pending starts also hold the OpenHV lock, since OpenRA editions
can use its binary. Unclassified AppImage FUSE mounts conservatively delay the
update; running servers are never terminated to clear the queue. Activation
and rollback reuse the existing persisted worker and retained previous copies.
The isolated VPS check downloaded 20250725, exercised same-version update and
rollback and received the dedicated protocol handshake. A real player Join is
still separate. See the [official OpenHV server documentation](https://github.com/OpenHV/OpenHV/wiki/Server).

### Earth 2140 Trilogy / OpenE2140 updates

The OpenE2140 official AppImage shares OpenHV's bounded, checksum-verified
implementation with a separate fixed source profile. Its mod version must
match the `release-YYYYMMDD` GitHub release; its separate
`opene2140-engine-YYYYMMDD` engine identifier is validated independently.
The current 20260920 official digest was matched against the VPS image.
Unknown installation files or modified binaries refuse replacement. Existing
per-server/support data and proprietary game assets are outside this swap.

OpenRA editions and `opene2140` aliases hold the canonical installation lock.
Unclassified AppImage mounts conservatively delay updates. The VPS acceptance
check exercised an isolated same-version download/update/rollback and actual
dedicated protocol handshake, without updating production game files. This
does not verify a human Join or redistribute original Earth 2140 assets.
Upstream packaging and asset requirements: [OpenE2140](https://github.com/OpenE2140/OpenE2140).

### Update coverage inventory

The Shared installation updates panel includes a collapsed coverage list for
all declared hosting recipes and additional recipe names reported by the agent.
Missing handlers explain whether they need package-manager coordination, archive
validation, a custom build, private runtime handling or separate edition work.
Alias names are deduplicated. The supported-family count refers to implemented
handlers, not proof that every installation or edition is ready.

The coverage response is read-only and uses the existing authenticated status
request. It performs no catalog writes, extra database queries or resource
sampling. Older agents remain compatible; unavailable handlers are labelled
for deployment review. New unknown recipes remain visible with no queue action.
Base TF2 updates do not certify Open Fortress overlay updates, and official
OpenRA package updates do not certify Combined Arms or Red Alert 2.

### Hypersomnia signed rolling updates

Hypersomnia's official headless channel supplies an OpenSSH artifact signature
with its version metadata. The updater pins the upstream Ed25519 public key,
requires the `self_updater` namespace and SHA-512 signing algorithm, bounds
metadata/image size, disables redirects, and verifies the exact downloaded
bytes before executing anything. Signed images then report their version in
a temporary HOME/cwd with an empty environment. Lower-version rolling updates
are refused; deliberate retained-copy rollback remains a separate queue action.

The current VPS 3.0.0 image was independently matched to that signature, so
known legacy bytes can be reviewed without rewriting the active installation.
Other modifications/custom files block replacement. Installed-image hashing
uses the same bounded/cached verification as OpenHV and OpenE2140.
New Hypersomnia launches pass `--no-update-on-launch` and disable the startup
updater in their configuration; daily updates remain off. Recovered processes
are preserved, and subsequent agent starts use the current guarded recipe.
Unclassified AppImage mounts/extraction directories conservatively hold updates
regardless of their temporary-directory location. Per-server appdata is retained.

The isolated VPS check covered signed download, same-version update/rollback
and dedicated UDP binding without public listing. Player Join/query validation
remains separate. Protocol/key sources: [upstream verification](https://github.com/TeamHypersomnia/Hypersomnia/blob/master/src/application/main/verify_signature.h),
[public signer](https://github.com/TeamHypersomnia/Hypersomnia/blob/master/src/signing_keys.h),
and [startup update control](https://github.com/TeamHypersomnia/Hypersomnia/blob/master/src/cmd_line_params.h).

### AssaultCube native component updates

AssaultCube's updater replaces only `bin_unix`. The installation root,
`ac_server` link, configuration, maps/packages, private files, logs, demos and
mods are neither copied into binary rollback nor restored from it. This avoids
reverting settings changed after an update. The existing shared queue waits
for affected rooms and unmanaged processes, blocks new starts, and retains
the previous native directory. Failed activation restores it; ambiguous
restoration remains interrupted and requires operator inspection.

The reviewed 1.3.0.2 official archive is pinned by SHA-256 and both native
executables must match their reviewed x86_64 hashes. GitHub provides no digest
for this historical asset; the pin was computed from the fixed official URL
and matched against the installed binaries. Unrecognized releases require
compatibility review before this handler accepts them. This is a native-binary
update, not automatic mod/map/configuration migration.

The Python archive reader is unprivileged, memory/CPU/file-size limited and
never extracts an arbitrary tree: it writes only the two expected regular
executables into a new directory. Unsafe paths, links, duplicate names, special
permissions, excessive counts/sizes and incomplete packages fail closed.
`nativeArchive.py` must deploy with the imported JavaScript modules.

An isolated VPS acceptance test covered download, activation/rollback,
preservation of post-update configuration and the stable data-root inode, and
a real game query (zero players, two slots). It did not perform a human Join.
Package source: [official AssaultCube release](https://github.com/assaultcube/AC/releases/tag/v1.3.0.2).

### Factorio stable headless updates

Factorio uses the publisher's stable headless channel and official SHA-256
checksum list. Metadata, downloads, redirects and expanded archives are bounded;
only fixed HTTPS publisher/CDN hosts are allowed. The unprivileged extractor
rejects traversal, links, duplicate entries and special files. No executable runs
until the downloaded archive passes its published checksum. Installation checks
then verify the entire package manifest, x86_64 headless binary, base-data version
and installed runtime using `--version` with no service credentials in its environment.

Existing installations need an offline comparison against that verified official
package before an integrity marker is added; custom/missing/modified files block
updates. This comparison does not replace binaries or saved worlds. The current
VPS 2.0.77 installation matched its official package. The admin update inventory
shows a specific baseline requirement when verification has not passed.

Updates and rollback use the existing shared-installation queue and fixed root
process scan. Saves, per-server configuration and player progress remain in
`factorio-servers/pb-<id>` outside the installation swap. Stable-channel downgrades
and major-version upgrades are refused. Explicit binary rollback retains the
previous verified installation, but **does not undo saved-world format changes**.
Take a world backup before starting a newer engine; restore a compatible world
separately if necessary. This updater does not install mods or change eligibility.

VPS acceptance (2026-10-15) verified the actual official 2.0.77 download, same-version
queued update/rollback, save preservation, world creation, loopback UDP startup
and clean stop. This is not a human client Join or occupied-player query test.
Sources: [official download API](https://wiki.factorio.com/Download_API),
[publisher checksums](https://factorio.com/download/sha256sums/),
[official multiplayer documentation](https://wiki.factorio.com/Multiplayer).

### Terraria reviewed Linux package updates

Terraria has a reviewed 1.4.5.8 Linux-server handler. Its fixed official ZIP is
pinned by size and SHA-256; all 31 Linux files have reviewed sizes and hashes in
`game-host/terraria1458.json`. These were measured from the official HTTPS
package and matched against the installed VPS files on 2026-10-15. The publisher
does not provide a separate checksum feed. Changed packages/new versions require
an explicit pin, matching recipe paths and client/world compatibility review;
this is not an automatic latest-version updater.

The bounded unprivileged ZIP reader extracts only `1458/Linux`, rejecting
traversal, links, duplicates, special files and oversized entries. Package hashes
are checked before native dependency validation. Custom Linux files and modified
assemblies block updates. The version-folder component swap retains other
platform files; root-level configuration and customer worlds remain outside it.
Updates and rollback reuse the existing queue, start gate and read-only scanner.

VPS acceptance covered official download, queued update/rollback, generated-world
TCP startup, graceful console shutdown, unchanged world bytes after rollback and
preservation of newer configuration outside the component. Human Join remains
separate. Source: [official server download](https://terraria.org/api/download/pc-dedicated-server/terraria-server-1458.zip)
and [official server documentation](https://terraria.wiki.gg/wiki/Servers).

### Reviewed Ubuntu native-server updates

BZFlag, Hedgewars, OpenTTD, Luanti and Teeworlds use fixed Ubuntu 24.04 amd64 packages in
`game-host/nativePackageProfiles.json`. Package size/SHA-256 and the extracted
native file's size/SHA-256 are reviewed against signed APT metadata and the
installed VPS binary. New distro versions require explicit pin, library/data
and client-protocol review. These are not automatic distribution upgrades.

Only the selected ELF file is extracted by an unprivileged bounded reader.
No package installation or maintainer script runs; OS libraries and game data
stay in place. Missing libraries, changed bytes, extra custom files and unsafe
links block staging. The root-owned promotion helper accepts only a fixed game
and operation UUID and copies matching bytes into that worker directory. Install
it as root with `game-host/install-package-native.sh`; full `install.sh` also
installs it. Never grant apt/dpkg/shell sudo to the game service.

Managed copies are root-owned. Customer sandboxes mount just that executable
read-only over its expected system path. Luanti uses the underlying Minetest
ELF rather than the wrapper that injects shared config/log paths. The root
scanner checks the mounted executable inode; independent OS-binary processes
are unchanged by these updates. Queue gating and binary rollback remain
admin-only. Server settings, maps and worlds stay outside the native swap.

VPS acceptance (2026-10-15) covered actual downloads, native-library validation,
queued update/rollback, namespace-mounted process detection, sandbox startup,
stop and saved-file preservation for all four. BZFlag, Hedgewars and OpenTTD
answered zero-player queries. Luanti initialized and preserved world metadata;
its master-list/player query was not certified by the isolated bind test.
Human client Join can be observed during normal use; it is not a release gate for these four.

### Wesnoth and RimWorld Together updates

Wesnoth pins Debian's 1:1.18.5-1 server package, matching both current VPS
copies and the 1.18 client series. Its published package checksum is recorded
in `nativePackageProfiles.json`. The single-file target swaps only `wesnothd`;
`wesnothd.cfg`, accepted-version policy and the existing directory remain in
place through update/rollback. No Ubuntu 1.16 downgrade or PPA change occurs.
Source: [Debian package checksum](https://packages.debian.org/trixie/amd64/wesnoth-1.18-server/download).

RimWorld Together uses its reviewed PlayBound source build rather than an
unpatched upstream binary. `game-host/rimworldBuild.json` pins source, bridge,
SDK, runtime, dependency lock, all downloaded NuGet blobs and compiled output.
See `game-host/rimworld/README.md`. Builds run unprivileged with isolated
home/cache/temp and a clean environment; compiler reuse is disabled. The
existing queue and process/start gates stage, validate, activate and roll back
the shared installation. Configs, Assets, Backups and permissions remain in
each server's private directory. New source/SDK/dependency/client versions need
review; binary rollback cannot reverse colony-format changes. Custom files in
the shared installation fail closed. The original patched server remains a
verified rollback baseline; its CRLF license is accepted without rewriting it.

VPS acceptance (2026-10-15) verified Wesnoth download, queue update/rollback,
unchanged config/root, dedicated startup, zero-player query and stop. RimWorld
acceptance used an isolated copy: reproducible source output, real queue
update/rollback, console, connecting-client snapshots 0 -> 1 -> 0, running
rollback held, full stop and fixture data preservation. These are not licensed
human Join or actual colony-migration tests. The live agent exposes both
handlers; production RimWorld binaries and all saves were unchanged.

### FlightGear fgms relay updates

FlightGear hosting uses fgms 0.13.10. The reviewed CMake source handler pins the
source archive/commit, compiler/CMake versions, source-date epoch, license and
native output in `game-host/fgmsBuild.json`. Source extraction rejects links,
traversal, duplicate/special files and oversized trees. Builds run unprivileged,
serially, with a clean environment and isolated home. Missing toolchains,
libraries or changed output fail closed; no compiler/package installer runs.

Only the `fgms` native file is staged and swapped. Logs and configuration remain
in their current parent across update/rollback; a custom launch wrapper blocks
the handler for review. The recipe explicitly stays in the foreground and
reserves both UDP gameplay and TCP status in a two-port bundle. It disables
the separate unused native admin listener and never falls back to launching
the graphical FlightGear client as a dedicated server.

VPS acceptance (2026-10-15) passed queued source update/rollback, deterministic
output, unchanged config/log/root, foreground startup, real zero-player query,
running rollback protection and complete port release. The original installed
binary also passed the new launch arguments. Aircraft Join/occupied-player
verification and customer sandbox expansion remain separate. Production relay
bytes and DB rows were unchanged.
Sources: [official fgms mirror](https://github.com/FlightGear/fgms),
[official multiplayer-server documentation](https://wiki.flightgear.org/Howto%3ASet_up_a_multiplayer_server).

### Teeworlds managed updates and isolated UID runtimes

The reviewed native handler also covers Teeworlds 0.7.5-2. An enrolled
`teeworlds-unix-v1` runtime no longer silently runs the OS engine after a managed
update. Its fixed root supervisor opens the managed executable without following
links, checks ownership/permissions/size/SHA-256 using the root-installed profile,
then seals a private copy before dropping to the server UID. Bubblewrap copies
and mounts that sealed engine read-only over its normal system path. Configuration
and saved files remain separate. Unknown/partial managed engines fail closed.

Install `tools/install-customer-runtime.sh` after `install-package-native.sh`;
full `install.sh` handles that order. This does not enroll or restart customer
servers. The process scanner holds Teeworlds updates conservatively while any
server uses that namespace executable, since sealed copies have independent
inodes. VPS acceptance covered real zero-player queries, queue holding, update/
rollback, UID launch, same-process recovery and complete shutdown. Human Join
remains a separate check. New package versions still require explicit review.

### SuperTuxKart and OpenArena native updates

SuperTuxKart 1.4 and OpenArena's installed ioquake3 engine are reviewed package
profiles. Both swap only their native executable and retain configuration,
parent directories and existing distro data. OpenArena's recipe explicitly
preserves the distro wrapper's baseoa data path and protocol 71 when running the
managed ELF directly. Package or matching asset changes require review.

Real VPS fixtures passed update/rollback, running queue holds, stop and settings
preservation. OpenArena returned 0/4 via getstatus. SuperTuxKart returned 0/4 in a
private network namespace. Its shared host discovery port (UDP 2757) is owned by
one listener; additional instances can return unknown because discovery reaches
another server. Do not interpret that as zero players, and do not treat these
fixtures as human Join or multi-instance tracking certification. No automatic
hosting eligibility was changed by this deployment.

### 0 A.D. and Xonotic engine updates

0 A.D. uses the reviewed Ubuntu Alpha 26 native engine, with the existing matching
system libraries/data retained. Canonical `0ad` and recipe alias `0-ad` hold the
same installation. A legacy alternate engine blocks validation. Only the native
file is swapped, preserving settings and the parent directory. Headless startup,
update/rollback, alias holds and clean shutdown passed VPS acceptance; player
queries and human Join remain unverified.

Xonotic updates only its reviewed 0.8.6 dedicated ELF. The fixed HTTPS mirror is
listed on the [official download page](https://xonotic.org/download/); archive
bytes match the [publisher SHA-512](https://dl.xonotic.org/xonotic-0.8.6.sha512),
with a separately pinned native SHA-256. The primary host's expired certificate
is not bypassed. The extractor never installs maps, configuration, scripts or a
shell updater. Existing 0.8.6 assets stay in place, and new releases require a
joint engine/data compatibility review. Downloads use bounded Node HTTPS streams
and disk checks; only one fixed executable can activate. Fresh installation uses
the same mirror/checksum. Staging passed query 0/4, zero bots, update/rollback,
queue hold, clean stop and saved-file preservation. Human Join remains separate.
# Daily server-file release checks

The always-on game-host agent checks supported upstream release feeds every 24
hours. Its one-minute scheduler only tests whether a daily check is due; it does
not download games or create database/test records every minute. A single atomic
`daily-installation-updates.json` report under the agent state directory retains
the last result per installation, next check time and attempted build/job.
Restart catches up a missed check; an interrupted check can retry after an hour.

Automatic discovery and queueing currently cover the nine declared Steam depots,
Mindustry, OpenRA's official packages, OpenHV, OpenE2140, Hypersomnia and stable
Factorio. ET: Legacy, OpenMoHAA and Unvanquished also check their official release feeds;
only reviewed engine/module packages can queue automatically. Future unreviewed
versions are surfaced for compatibility review. Steam reads the public branch using an isolated, credential-free
SteamCMD metadata home. Non-public installed branches are left for review.
GitHub sources require stable official tags; download workers still enforce
their existing digest/signature, version, runtime, disk and compatibility checks.
Major Factorio upgrades require review. Only a newer version queues an update;
unchanged builds create no jobs or rollback copies.

Queued updates pause new starts and wait for every affected process to exit.
They do not disconnect players or automatically restart servers. Existing fleet
retirement or an operator stopping the last affected runtime releases the queue.
The previous installation remains available for rollback; binary rollback does
not reverse save-format migrations. Failed/cancelled/applied builds are not
automatically attempted again, including after a rollback. Use Queue update to
retry deliberately, or wait for a genuinely newer upstream build.

The existing admin hosting Updates section shows the daily report and queue.
Reviewed/pinned distro packages, custom builds and games without an installation
handler are explicitly review-required/coverage gaps. They are not silently
upgraded to unreviewed binaries or repeatedly reinstalled. Extending an updater
requires the dedicated-server checklist and compatibility/rollback validation.
