# Dedicated hosting parity execution plan

## Coverage contract

The target is **every dedicated-server game and hosted edition PlayBound offers**.
This includes the union of community-hostable, dedicated-only/customer-hostable,
and party-dedicated recipes in `platform/src/lib/gameHost/catalog.ts`, their
aliases, and the operational profiles for published games/editions. Do not use
only `HOSTABLE_GAMES` as the full inventory; paid/dedicated-only games also count.
New games must complete `docs/dedicated-server-game-checklist.md`.

Assess each feature per engine: applicable and verified, not yet implemented,
or unavailable with a concrete engine/transport reason. The universal scope is
a release requirement, not a claim that every engine supports bots or plugins.
Keep current fourteen-game update support and thirteen-game file support explicit
until the additional handlers pass their gates. No placeholder controls.

## Implementation order and gates

1. **Self-host foundations and diagnostics.** Drain server output, bound local
   logs, handle spawn errors, prevent stale exits from resetting new processes,
   and make restart costs honest in the helper. Read-only local diagnostics are
   host-only and never uploaded. Verify party/leader boundaries and Electron UI.
2. **Per-game capability and delivery audit.** Cover every offered recipe/edition
   across web, launcher workspace, party settings, and Ctrl+P. Verify native
   settings delivery, local binary detection, player/bot counts, map controls,
   moderation, lifecycle, and compatibility. Expand local live controls through
   constrained typed operations; never add a cloud shell into a user's PC.
3. **Updates for the entire inventory.** Extend installation-family handling
   beyond the eight delivered Steam installations. Add separate verified strategies for official archives,
   GitHub/AppImage packages, Java/.NET, Wine/source builds, and OS-managed packages.
   OS packages may require a narrowly scoped root-owned installer; never grant
   the game agent general package-manager/shell sudo. Every handler needs offline
   dependency checks, staged validation, stable saves, rollback and crash recovery.
4. **Runtime isolation before executable plugins.** Establish per-customer process
   identity/container isolation, isolated writable saves and read-only shared
   installs, restricted mounts/proc/network, resource/process limits, and private
   credentials. Adapt process recovery, queries, file access, backups, updates,
   and diagnostics to those identities. Verify cross-customer denial and host
   secret protection before exposing code/plugin installation.
5. **Trusted plugin/Workshop and content support.** Assess every game; expose only
   supported, compatible sources/versions with dependency validation, status,
   backups, rollback and permissions. Separate maps/data from executable plugins.
6. **Remaining management parity.** Add authenticated bounded log streaming,
   larger save transfer/SFTP where appropriate, general typed scheduled tasks,
   and per-game backup/restore coverage. Keep subscription/admin controls in
   existing pages; keep quick safe controls in the single game helper.
7. **Full release gate.** Every offered recipe/edition has saved acceptance
   evidence or an explicit surfaced limitation; essential hosting/query/Join
   paths pass live verification. Check all roles and narrow layouts, preserve
   populated servers and user saves, run relevant suites/builds, and release a
   launcher binary for launcher changes.

## Current delivered scope

- Empty-server maintenance now accepts selected UTC weekdays instead of
  requiring a daily restart. Legacy schedules remain daily without migration;
  writes from older launchers preserve saved weekdays. The web/native workspace
  shows the next saved window and the most recent check reason. Occupied or
  unknown-player checks overwrite one status snapshot and retry within the
  window, without generating repeated Activity rows. Atomic claims include the
  weekday, and the schedule is checked again after backup before requesting a
  restart. No schedule is enabled by deployment. This is the existing typed
  restart task; arbitrary commands, task chains and additional task kinds remain
  separate work. Native UI changes need the next launcher release.

- Owner/administrator log viewing uses a fixed-ID, read-only agent endpoint.
  Each request reads at most 64 KiB and returns at most 200 complete lines;
  cut edges, links and non-regular files are rejected or omitted. Credential
  labels, known agent/runtime secret values, URLs and token-shaped values are
  scrubbed before output reaches the control plane. My Servers web/native and
  the existing Ctrl+P Server tab refresh only on request, with no background
  log polling. Moderators and public-server party leaders have no log access.
  RimWorld's fixed private console files are included, including stopped
  servers. ANEURISM reads a bounded sanitized snapshot through its root-owned
  helper, never exposing the private control directory or Steam credentials.
  Every five minutes, managed/RimWorld logs over 8 MiB roll over in place,
  retaining one private tail of at most 64 KiB. Existing append-mode writers
  keep their inode; RimWorld console commands hold the same lock as retention.
  Copytruncate can lose concurrent diagnostic output at rollover and is not an
  audit log. Stopped ANEURISM logs are trimmed; new ANEURISM supervisors bound
  their own writer. A currently running legacy ANEURISM supervisor keeps its
  log untouched until its next natural restart. No game is restarted for this.
  OS isolation and remaining engine-specific native log files remain work;
  redaction is defense in depth, not permission to log credentials. Launcher
  UI changes require the next binary release.

- Existing web/native/overlay management, role checks, map/bot/player controls
  where declared, restore points, supported saved-file roots, daily maintenance.
- Admin-coordinated staged updates for CS2, TF2 and Unturned, with rollback,
  shared-installation start gates, read-only process checks and persisted jobs.
- The same staged Steam update path now covers Counter-Strike: Source, Core Keeper,
  Don't Starve Together and Necesse. Installed manifests/executables
  were inspected on the VPS; isolated per-depot update/rollback fixtures cover
  fixed app IDs and required files. No production binary update is implied by
  that fixture verification, and a real client Join remains a separate check.
- Barotrauma updates baseline stopped private runtime copies before changing the
  shared depot. On their next start, copies refresh through a staged directory
  swap, retaining saves/settings/permissions and the complete prior runtime.
  Unknown modifications, links, low disk or ambiguous recovery block the change.
  VPS fixtures (2026-10-14) exercised the actual installed files and a cloned
  legacy test runtime; no production game binary or customer world was updated.
  An isolated fresh copy started the real dedicated executable and bound its
  UDP port with the required default tuning present, then was stopped/removed.
  This is migration evidence, not a live client Join or save-format compatibility test.
- Local settings delivery now uses native OpenRA/OpenHV key/value arguments,
  Teeworlds/DDNet console arguments, BZFlag flags, DarkPlaces commands, Quake
  cvars/map commands and TES3MP config-only settings. Cross-layer tests cover
  every declared setting and enum option for nine existing profiles. Other
  engines still need their native delivery audit; argument tests are not a
  live Join/occupancy test.
- Targeted VPS engine check (2026-10-14): an isolated Teeworlds process received
  the native console arguments for CTF, map `ctf1`, and six slots. Its real
  game query reported zero humans and six maximum players. The temporary
  process/home were removed; no community server or database data was changed.
  This verifies argument delivery and query response, not a client Join.
- Shared process-launch safeguard: all new agent-started games now receive an
  allowlist of runtime environment variables after recipe overrides. Agent/API,
  database and deployment credentials and undeclared variables are not inherited.
  Existing processes are not restarted to retrofit that environment. The shared
  OS account and filesystem access still require the isolation work in step 4;
  environment filtering alone does not make executable plugins safe.
- The all-game update handlers and executable plugin isolation above remain
  pending. Expand with verified handlers rather than treating the supported
  distributions as a universal installer.
- Mindustry is the first non-Steam update handler: official stable GitHub server
  JAR, required release SHA-256 digest, bounded trusted HTTPS redirects/download,
  ZIP integrity, dedicated entry point/version and installed Java checks. The
  existing queue, start gates, staged activation and rollback remain shared.
  VPS check (2026-10-14): isolated 159.7 -> 160.7 -> 159.7 update/rollback;
  the actual 160.7 executable answered a game query with zero players/two slots.
  Production JAR and customer data stayed unchanged. A real client Join remains
  separate. Custom wrappers/alternate JARs require review; unclassified JVMs
  conservatively hold the queue without stopping other servers.
- OpenRA adds coordinated official AppImage updates for Red Alert, Tiberian
  Dawn and Dune 2000 together. Packages require published SHA-256 or reviewed
  historical pins; extraction uses bounded unsquashfs without executing them.
  A complete Dune 2000 engine supplies the D2k assembly omitted by the old
  combined installer. A hash-checked installation baseline refuses custom-file
  loss; support directories stay outside the installation swap. Bootstrap
  requires an exact reviewed reference, never a blind snapshot of unknown files.
  VPS fixtures (2026-10-14) covered real archives, activation/rollback, and all
  three modes' startup/protocol handshake. This does not establish client Join
  or player-count tracking. Other OpenRA-based games keep their own installs.

- OpenHV now shares the coordinated update queue with fixed official AppImage
  selection, required published SHA-256, bounded embedded engine/mod metadata
  checks, and cached installation integrity checks. It retains the existing
  AppImage launch format and support data outside the installation swap.
  Custom installation files or an unrecognized legacy binary block updates.
  OpenRA starts/rooms conservatively hold the OpenHV maintenance lock because
  that recipe can select the shared OpenHV binary; unclassified AppImage mount
  processes also hold the queue. VPS acceptance (2026-10-14) downloaded official
  20250725, activated and rolled back an isolated installation, then verified
  protocol 7/client ID 0 from its dedicated server. The live game binary stayed
  unchanged. This is not a human Join or occupancy verification.

- Earth 2140 Trilogy / OpenE2140 now has a fixed official GitHub AppImage
  handler using the same verified-image implementation as OpenHV. Profiles
  keep separate repositories, tags, engine/mod metadata paths and legacy pins;
  no HTTP caller selects those values. OpenRA rooms and starts hold this
  installation lock, and the `opene2140` alias uses the canonical lock.
  VPS acceptance (2026-10-14) downloaded release-20260920, performed isolated
  same-version activation/rollback and received protocol 7/client ID 0.
  Production binaries and support data were not changed. A real player Join
  and original-client asset compatibility remain separate release checks.

- The existing installation-update panel now includes a read-only coverage
  inventory for the union of platform hosting recipes and actual agent recipe
  names, including dedicated-only games such as ANEURISM. Aliases are folded
  into canonical recipes. Missing handlers show distribution-specific work
  rather than disappearing; Combined Arms, Red Alert 2 and Open Fortress
  retain explicit edition-package gaps instead of inheriting base-game claims.
  A future unknown recipe appears as requiring review with no update action.
  This inventory changes neither hosting eligibility nor curated catalog rows,
  and adds no database queries, sampling or background tests. It identifies
  remaining work; it does not complete those handlers or client Join checks.

- Hypersomnia now uses a signed rolling-headless-image handler. The upstream
  Ed25519 public key and SSH `self_updater` namespace are pinned; malformed
  signatures, wrong signers, tampering, oversized downloads, unexpected
  redirects, version mismatch and update-channel downgrades fail closed.
  Only after signature verification does `--version` run with an empty
  environment and isolated HOME/cwd/temp directory. New server launches
  explicitly disable upstream startup self-updates so they cannot bypass
  the coordinated queue. Existing per-server appdata remains outside the swap.
  VPS acceptance (2026-10-14) independently matched the current 3.0.0 image
  using upstream SSH verification, then exercised same-version download,
  activation/rollback and an isolated dedicated UDP bind with public listing
  disabled. Production game files stayed unchanged; this is not a real player
  Join or human/bot-query verification. Coverage now has 13 handled families
  and 38 remaining game/edition entries.

- AssaultCube adds a native-component archive handler. Only `bin_unix` is
  staged and swapped; configuration, maps, logs, demos, mods, private data and
  the stable `ac_server` link remain in place, including across later rollback.
  The historical official 1.3.0.2 archive has a reviewed SHA-256 pin (GitHub
  supplies no historical digest), and extracted x86_64 executable hashes must
  match the reviewed package. A bounded unprivileged Python reader writes only
  the two expected regular native files; links, traversal, duplicates, special
  permissions and oversized entries fail closed. New release versions require
  explicit engine/protocol compatibility review rather than blindly replacing
  data or assuming the current maps/configuration are compatible.
  Component activation/restore failures retain the existing start gates;
  ambiguous restore keeps the installation interrupted for operator recovery.
  VPS acceptance (2026-10-14) exercised actual archive download, same-version
  native update/rollback, preservation of newer configuration/data-root inode,
  and a real dedicated query reporting zero players/two slots. Production
  native binaries and server data stayed unchanged. A human Join remains
  separate. Coverage is now 14 handled families and 37 remaining entries.
