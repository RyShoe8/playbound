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
Keep current twenty-eight-family update support and thirteen-game file support explicit
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

- Network isolation now has an operator-only opt-in Teeworlds managed profile,
  a root-only kernel preflight and verified query transport. A transient scope denied
  IPv4/IPv6 loopback control connections as an unprivileged UID while retaining
  public IPv4 connectivity. Candidate CIDRs are fixed; other private CIDRs and
  public IPv6 were not individually exercised. No production filter is enabled.
  Teeworlds queries can explicitly target a literal IPv4 address, reject invalid
  endpoints as unknown and ignore another peer's replies. An existing server
  returned the same zero-player/eight-slot result locally and via the public IP.
  A separate UID/namespace/resource-limited filtered fixture returned unknown on
  loopback and zero players/four slots over the public interface, then was removed.
  Public Join/occupied counts, other engines, administration-port/tenant protections
  and executable-plugin isolation remain gates.
  All four endpoint/peer/handshake checks passed on the VPS. The full local agent
  suite passed 207 tests with 17 platform skips. Query code/operator helper are
  deployed; eleven existing managed process identities were preserved and no
  production network profile or UID enrollment was enabled.
  The preflight also confirms actual BPF ingress/egress attachments on its exact
  scope before probing (one of each on the VPS), rather than accepting inherited
  parent policy or systemd configuration alone. The initial syscall ABI is
  explicitly x86_64-only; unsupported kernels/architectures fail closed.
  Completed UID migrations can explicitly select/clear `public-game-v1` through
  offline root commands. They verify stopped jobs, no retained room, identity/data
  phase, both UIDs offline and the runtime lock; enabling requires kernel preflight.
  Only the root journal chooses policy. The supervisor applies fixed CIDRs to its
  current scope before execution and verifies kernel hooks. Recovery checks the
  root binding/journal and that exact scope's hooks; room metadata retains the
  profile and public query address. Missing configuration/enforcement is unknown
  or failed readiness, never an unprotected launch or a fake empty player count.
  Managed VPS acceptance passed filtered public query, unchanged game PID through
  agent restart, full scope stop, explicit disable without UID downgrade, and
  successful unfiltered resume; saved fixture bytes survived. Test processes/homes
  were removed. Production profile/UID enrollment remains zero. Twenty-seven data/
  enrollment tests, fourteen root-runtime tests, seven network boundary tests,
  TypeScript and the full agent suite (209 passed, 17 platform skips) passed.
  Latest guarded deployment preserved all twelve then-running managed process
  identities; no party rooms, UID enrollments or production filters were active.
  See [customer-network-isolation.md](customer-network-isolation.md).

- Legacy Teeworlds migration has operator-only checkpoint preparation, atomic
  data activation/rollback, journal recovery and explicit offline runtime-profile
  enrollment/rollback completion. General production migration stays off.
  `customer-data-migration.py prepare <serverId>`
  requires a direct root operator and refuses while any process uses the old
  service UID. No agent sudo rule, API or automatic enrollment invokes it.
  It derives fixed paths, walks with no-follow directory/file descriptors,
  rejects links/special files/unsafe ownership, and bounds depth, entry count,
  individual size and total bytes. A second source scan and SHA-256 manifest
  verify the private, fsynced checkpoint before publication. Repetition verifies
  the existing checkpoint; changed source data requires operator review rather
  than overwriting it. Failed stages remain private and are never activated.
  Preparation leaves original files and active UID data untouched. Activation
  copies verified data into the reserved UID home and privately retains originals,
  leaving a root-owned placeholder that rejects legacy launches. Data rollback
  copies the latest UID progress back while retaining originals and the UID copy.
  Inode-bound journals distinguish interruptions before/after swaps; unknown
  locations or changed legacy progress fail closed. UID starts reject incomplete
  or rolled-back journals. Nonempty-data enrollment needs root-verified activation,
  never an agent-owned flag. Normal creation keeps identity mode off.
  Twenty-six Linux fixture tests passed, including binary/maps preservation, mutation
  and link rejection, limits, idempotency, source drift and checkpoint tampering.
  The installed VPS tool refused a fixture preparation while the real agent was
  active, preserved the fixture bytes and created no runtime workspace. The
  fixture was removed without restarting live services. An isolated managed-agent
  acceptance then started migrated fixture data, queried zero humans/four slots,
  retained the same game PID through restart, stopped its full scope and rolled
  back subsequent writes made as the reserved game UID. That fixture used another
  reserved legacy UID to avoid stopping real games; actual CLI always requires the
  old service UID offline. All fixtures were removed. Guarded agent deployment
  preserved eleven production managed process identities; no customer was migrated.
  Explicit `enroll`/`complete-rollback` commands change only the selected stopped
  Teeworlds job after verifying data phase/identity, both UIDs offline, no retained
  room and the runtime lock. Journaled actor/time and pending/completed status make
  retries safe; UID launch refuses an unfinished enrollment. A separate VPS fixture
  used the real agent registry reader to verify both profile changes, unchanged
  neighboring job and preserved newer progress. Actual CLI fixes all paths and the
  legacy UID; fixtures never changed the production registry. Twelve root-helper
  boundary tests and the full local agent suite (204 passed, 16 platform skips)
  passed, as did four platform deployment-chain checks and all twenty Linux
  namespace/gate/migration-proof tests run as the real service account.
  Operator procedure: [customer-identity-migration.md](customer-identity-migration.md).

- Teeworlds has an explicitly opted-in managed UID handoff (`teeworlds-unix-v1`).
  Normal website/customer creation leaves it off. Once selected, enrollment is
  retained in managed jobs across stop, failure and agent restart, so a later
  client omitting the flag cannot silently revert to the service user or the old
  data directory. Existing nonempty service-owned data blocks this profile without
  root-verified completed migration; no empty replacement or fallback occurs.
  A fixed root-owned supervisor validates the placed gate and actual limits,
  including its own inherited cgroup, and drops to the reserved UID/GID with no
  supplementary groups before executing the reviewed engine through Bubblewrap.
  Configuration is bounded/allowlisted and supplied through a sealed memory FD;
  no caller executable, host path, environment or signal is accepted. Private
  game data lives under a root-controlled per-server parent, outside agent data.
  Root-owned bindings tie stop/status to the original gate identity. Scoped stop
  waits for the whole cgroup to empty; a reused PID or another server's binding
  cannot authorize it. Gate loss also fences the supervisor and game tree.
  Teeworlds has no declared browser world-file/backup support to redirect; those
  permission bridges and migration remain gates for other engines.
  VPS acceptance used an isolated loopback agent and fixture identity, covering
  concurrent/idempotent starts, real zero-player/four-slot queries, metrics,
  unchanged gate/game PIDs across agent restart, stop acknowledgment only after
  the scope emptied, resume without the opt-in flag, stable UID and private data,
  denied wrong-identity/server stops and cleanup after forced gate loss. Test
  processes, private homes/config and staging state were removed; identity
  reservations remain. Eleven Python boundary tests and 18 Linux namespace/gate
  tests passed; the local agent suite passed 202 tests with 16 platform skips.
  Cancellation terminates the unprivileged gate without waiting for privileged
  children, so fencing does not depend on an agent-side delayed cleanup timer.
  Live checks covered both SIGTERM cancellation and forced SIGKILL gate loss.
  Human Join, maintenance rollout, network restrictions, other engine handoffs and
  executable plugins are not covered, and production identity mode stays off.
  Final controlled deployment of the guarded agent path preserved all eleven existing
  production runtime identities/PIDs; no production server was enrolled.

- The Unix identity broker is installed as a separate foundation, **not enabled
  for production game launches**. Its only operation is `ensure <serverId>`;
  callers cannot choose a UID, path, command, group, login shell or deletion.
  A private root-owned registry durably reserves IDs before host account changes,
  uses a cross-process lock and atomic/fsynced writes, and never recycles a
  reservation. The initial bounded pool is 40000–40255; existing host users and
  groups are skipped. Each server gets its own UID/GID, locked-password non-login
  account, no home creation, no subordinate-ID allocation and no supplementary
  groups. Repeated requests preserve identity; partial account creation can
  resume, while account drift, corrupt state and unregistered names fail closed.
  The agent's sudo rule permits only this fixed helper operation, never general
  account tools. Agent access cannot read or rewrite the registry.
  VPS acceptance (2026-10-15 UTC) used two reserved fixture identities and proved
  own-data access plus peer-data, agent-fixture-data, registry-read and peer-signal
  denial. Temporary processes/data were removed; the two fixture account
  reservations intentionally remain stable and are reused by manual retests.
  Fifteen tests cover boundaries, partial creation, corrupt/linked state,
  exhausted pools and real cross-process locking. No production process user,
  world ownership, database row, launcher or service configuration was changed.
  The opt-in Teeworlds handoff above advances the launch/stop/recovery gate.
  Remaining broader handoff gates include safe
  per-server save/config ownership and agent access, identity-checked whole-tree
  stop/recovery, backup/file permissions and metrics/query regression checks.
  Do not enable executable plugins or claim completed customer isolation from
  account readiness alone. Network restrictions and other engine profiles remain.
  Two additional unlisted Teeworlds fixtures ran under those distinct UIDs,
  retained the namespace filesystem boundary, and each returned zero players/
  four slots. Every observed descendant used its assigned host UID; both whole
  process trees and temporary homes were removed. These operator-run staging
  launches did not use the production managed-runtime handoff or cgroup gate,
  and do not establish customer start/stop permissions, restart adoption or Join.

- Resource sizing for the five namespace profiles now comes from the dedicated
  tier's existing CPU/RAM-per-slot-block configuration. Initial starts, automatic
  recovery and settings-backed restarts use the same inventory envelope, carried
  separately from customer-editable game settings. The agent and root helper
  independently validate integer millicores/MiB within 0.25–6 cores and
  256–8192 MiB; invalid sizing fails closed. Task limit 128, zero swap and
  whole-scope OOM policy remain fixed. Per-process virtual-address limits scale
  with allocated memory rather than retaining the old fixed ceiling. Saved
  runtime limits survive recovery; a process replacement gets a new scope name.
  Changes apply on next start, without resizing populated servers. Older control
  planes retain the original defaults; other engines do not claim enforcement.
  This wires existing admin tier sizing, not measured community envelopes or
  live resizing, and does not complete customer UID/network/plugin isolation.
  VPS acceptance (2026-10-15 UTC) enforced 0.75 cores/1536 MiB on four fixtures
  and 0.75 cores/3072 MiB on Luanti. All five retained their PIDs, descendant
  scopes, process metrics and prior query/bind results through an agent restart;
  fixtures were then stopped and removed. Nine existing managed runtimes kept
  their identities/PIDs; two others received explicit stop requests after the
  scheduled reconcile tick, rather than recovery-failure records. No customer
  data or database rows were altered. Luanti player query and human Join remain
  unverified. Six helper tests and nine Linux namespace checks passed.

- The same five customer profiles now pass through an unprivileged start gate
  before executing their game. A root-owned, fixed-operation helper validates
  runtime identity, all process UIDs and the sudo caller's process ancestry,
  then creates a new systemd scope. It accepts no shell, executable, arbitrary
  filesystem path or unit property. The helper waits for asynchronous systemd
  placement and confirms the actual kernel controls before returning success;
  denied placement or cancellation launches no unrestricted fallback.
  Rollout limits are one CPU core/1 GiB for Teeworlds, BZFlag, Hedgewars and
  OpenTTD; Luanti gets two cores/2 GiB. Each scope caps tasks at 128, disables
  swap and enables whole-scope OOM killing. These are conservative fixed
  enforcement defaults for older control planes, separate from measured capacity
  baselines; the tier-driven allocation path above supersedes them on new starts.
  Wrapper identity, scope name and process-group metrics survive agent recovery.
  New scoped runtimes inherit limits across their complete process tree; existing
  live runtimes are not moved, restarted or retroactively capped. Distinct host
  UIDs, network policy, remaining engines and executable plugin support are still
  outstanding, so this is not a complete cross-tenant isolation claim.
  VPS acceptance (2026-10-15 UTC) confirmed all five fixtures retained their
  PIDs, working process metrics and kernel limits across an agent restart.
  Every descendant remained in its assigned scope. Teeworlds, BZFlag and
  OpenTTD returned zero players/four slots; Hedgewars returned zero connections;
  Luanti retained its UDP bind without a verified player query. All eleven
  existing managed runtimes retained their identities/PIDs. The five fixture
  groups stopped cleanly and their temporary data was removed. Five runtime-gate
  and five privileged-helper tests passed; the local serial agent suite passed
  198 tests with 15 platform-dependent skips. No database records or customer
  worlds were changed. Human Join and profile-driven sizing remain separate.

- The namespace rollout now covers five reviewed system-native engines:
  Teeworlds, BZFlag, Hedgewars, OpenTTD and Luanti. Each profile validates the
  expected executable and native arguments, mounts only its private writable
  home and fixed system dependencies, clears the environment and keeps host
  processes/agent files/other customer data out of its filesystem view.
  DNS, CA, hosts, protocol and service databases are individual read-only inputs;
  no profile binds the complete host `/etc` or `/var` tree. OpenTTD and Luanti
  keep existing per-server save locations. Game-specific launchers and custom
  binaries fail closed for these profiles rather than bypassing the sandbox.
  Before any recipe preparation, generated configuration and writable-root
  ancestors are checked for links and configuration hardlinks, closing the
  host-side preparation gap outside the namespace. Live acceptance distinguishes
  a real query (BZFlag/OpenTTD report four slots; Hedgewars reports connections
  but not a slot cap) from Luanti's confirmed UDP bind with no local player-count
  verification. At that stage, cgroup quotas were still pending; the resource
  gate above now covers those same five profiles. Network isolation, distinct
  host identities, executable plugins and other engines remain unfinished.
  VPS acceptance (2026-10-15 UTC) confirmed all four added wrappers survived an
  agent restart with working process metrics and the same query/bind results.
  All ten pre-deployment managed runtimes retained their identities/PIDs.
  Each fixture's whole process group stopped and its temporary data was removed.
  Nine Linux boundary tests passed; the local agent suite passed 193 tests with
  15 platform-dependent skips. No customer world or database row was changed,
  and no human Join or Luanti player-count validation is claimed.

- First OS namespace profile: newly started customer-owned Teeworlds servers
  use the reviewed system executable through Bubblewrap, with private process,
  user, IPC, UTS and cgroup namespaces, dropped capabilities, disabled nested
  user namespaces, read-only system/configuration mounts and one writable
  per-server home. Agent files, host `/proc`, other customers and credentials
  are absent from the mount tree; the child receives a cleared environment.
  Unsupported custom binaries or failed sandbox setup block launch rather than
  falling back. Detached wrapper identity persists for agent recovery and normal
  stop/metrics handling. Existing processes, community and party rooms are not
  retrofitted. Teeworlds is the first profile, not universal isolation: the host
  network remains shared, distinct host UIDs, cgroup resource/process limits,
  seccomp and private network policy remain required before executable plugins.
  The initial per-process address-space/descriptor/core limits do not provide
  full tenant resource accounting. Additional engines need reviewed mounts and
  compatibility checks before adopting this path.
  VPS acceptance (2026-10-15 UTC) verified the namespace denials, a real
  Teeworlds query with zero players/four configured slots, metrics, persistence
  of the detached wrapper across agent restart, recovery metadata and whole
  process-group shutdown. Eleven managed runtimes kept their original PIDs;
  the isolated fixture was stopped and removed. This does not establish a
  human Join or complete cross-tenant/network/resource isolation.

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

- Saved-file transfers now use 1 MiB chunks with a 64 MiB per-file ceiling in
  both the website and native launcher. The existing Files endpoint rechecks
  permissions and stopped state for each mutation; upload sessions bind the
  authenticated user, server, recipe and destination, expire after one hour,
  and permit at most two pending sessions per server. Final commit checks
  completeness and the destination SHA-256 before atomic replacement. Large
  delete/restore operations preserve file history without whole-file buffers.
  Downloads reject files changed between chunks; text editing remains 256 KiB.
  VPS acceptance (2026-10-15) uploaded/downloaded a full 64 MiB fixture with
  matching SHA-256 and exercised deletion/history restoration. No database
  writes or existing saves changed. Electron acceptance uploaded more than the
  former 3 MiB limit. The agent is deployed; native UI delivery still requires
  a launcher release. This improves the 13 existing saved-data recipes; it does
  not declare file access for the rest of the inventory or implement SFTP.

- The existing Logs tab now offers opt-in live output on web and native launcher,
  using bounded 200-line snapshots every five seconds while visible. Requests
  do not overlap; navigation, pause, hidden windows and errors suspend or stop
  following. Every request uses the existing authorization and credential
  redaction. No new agent endpoint, persistent stream or transcript storage is
  introduced. This delivers live following; true cursor-based streaming remains
  a separate optimization if snapshot traffic warrants it.

- Scheduled maintenance now has two typed actions: configuration backup only,
  or configuration backup followed by an empty-server restart. Backup-only
  tasks include stopped customer servers with active subscriptions and never
  change runtime state or rely on player queries. Both reuse the existing UTC
  weekday/hour window, atomic daily claim, retention and Activity surface.
  Configuration and action-specific permissions are checked when saving;
  execution uses the existing authorized backup operation. Restart claims and
  the final recheck reject an action changed during preparation. Web/native
  launcher use the same action contract; no shell/console scheduling is exposed.
  World-save backups, scheduled updates and multiple independent schedules
  remain separate coverage gaps. No production customer records were changed.

- Factorio adds an official stable-headless archive handler with published SHA-256
  verification, fixed publisher/CDN redirects, bounded unprivileged extraction,
  whole-package integrity baseline and offline headless/data-version validation.
  Existing custom files, downgrades and major-version upgrades block updates.
  The existing queue, root scanner, start gate, staged activation and rollback
  are reused; private saves/configuration stay outside the installation swap.
  Binary rollback does not reverse save-format migrations. VPS acceptance
  (2026-10-15) downloaded the actual 2.0.77 package, completed queued same-version
  activation/rollback, created and started an isolated world over loopback UDP,
  stopped it cleanly, and confirmed unchanged fixture progress. The production
  2.0.77 installation matched the official package and received an integrity
  marker only; no live binary, saved world or database row was replaced.
  Human Join/occupied queries remain separate. Coverage is now 15 handled
  installation families and 36 remaining game/edition entries.

- Terraria adds a reviewed 1.4.5.8 Linux-package handler. Its official HTTPS ZIP
  is pinned by size/SHA-256, with per-file hashes for all 31 Linux files. The
  installed VPS tree matched those bytes. Missing libraries, custom files,
  modified assemblies and unsafe ZIP entries fail closed. Version-folder
  component swaps retain other platform files; root-level configuration and
  customer worlds stay outside the swap. New versions require reviewed pins,
  matching recipe paths and client/world compatibility checks. VPS acceptance
  (2026-10-15) completed actual download, queued update, world creation/TCP
  startup, graceful console shutdown and rollback with world bytes and newer
  configuration preserved. Production binaries/worlds and DB rows were not
  changed by acceptance. Human Join remains separate. Implemented coverage is
  now 16 installation families with 35 remaining game/edition entries.

- BZFlag and Hedgewars add reviewed Ubuntu 24.04 x86_64 native-package updates
  (2.4.26-1build3 and 1.0.2-9build5). Fixed HTTPS packages and native files are
  pinned by size/SHA-256. Only the dedicated executable is extracted; no apt
  installation, maintainer script or OS package replacement runs. Offline library
  checks fail closed. A narrow root-owned helper promotes only the exact reviewed
  bytes from a UUID-named worker directory; the agent receives no general root
  command. Customer sandboxes mount that executable read-only over its system
  path, without exposing the agent or host credentials. The root scanner detects
  these mounts by inode while leaving untouched OS-binary processes independent.
  VPS acceptance (2026-10-15) passed real downloads, queued update/rollback,
  sandbox TCP startup, zero-player queries, full process-group stop, read-only
  executable/secret boundaries and saved-file preservation for both games.
  Existing OS binaries, running production games and DB rows were unchanged.
  Human Join remains separate; new distro versions need pin/library/protocol
  review rather than automatic OS upgrades. Coverage is now 18 installation
  families with 33 remaining game/edition entries.

- OpenTTD and Luanti use the same reviewed native-package mechanism, pinned to
  Ubuntu's 13.4-1build3 and Minetest 5.6.1 package revision respectively. Luanti
  extracts the underlying ELF server, not the OS shell wrapper; its customer
  sandbox mounts it over the native path with explicit per-server config/logs.
  Existing OS game data/libraries remain required and are not replaced by these
  handlers. VPS acceptance passed download, root ownership, dependency checks,
  queued update/rollback, sandbox/secret boundaries and engine startup for both.
  OpenTTD answered the real zero-player query. Luanti initialized a world and
  retained its world metadata through rollback; master-list/player-query and
  human Join verification remain separate. No production saves or database rows
  changed. Coverage is now 20 installation families and 31 remaining entries.

- Battle for Wesnoth adds a reviewed Debian 1.18.5 dedicated binary handler,
  matching the already-installed 1.18 server/client series. Its package checksum
  comes from Debian's published download metadata; the native file also matches
  both installed copies. Only `wesnothd` is staged and swapped; parent directory,
  `wesnothd.cfg`, accepted-version policy and other data remain in place.
  VPS acceptance passed actual package download, offline dependencies, queued
  update/rollback, unchanged configuration/root inode, TCP startup, real zero-player
  query, process detection and full stop. No production config/save or DB changed.
  Human Join and customer sandbox expansion remain separate. Coverage is now
  21 installation families and 30 remaining game/edition entries.
  The remaining inventory also distinguishes the real custom Freeciv 3.2.5
  package from Ubuntu's incompatible 3.1, and fgms from the FlightGear client;
  Teeworlds still requires integration with its fixed root-owned UID supervisor.

- RimWorld Together adds a pinned source-build handler preserving PlayBound's
  browser query, player snapshots and console bridge. Source commit/archive,
  bridge, NuGet lock, SDK 8.0.131, runtime 8.0.30 and all 12 NuGet package blobs
  are reviewed; serial unprivileged builds use a clean environment and isolated
  home/cache/temp. Source links/traversal, changed hooks/dependencies and an
  unexpected output hash fail closed. Two distinct build directories produced
  the same reviewed binary. Compiler/worker reuse is disabled and command time
  and disk checks remain bounded. A new offline runtime-info flag validates the
  binary without creating server data or opening sockets. The original patched
  binary is a pinned rollback baseline; the upstream license is preserved.
  VPS acceptance (2026-10-15) passed a real queued source update/rollback in an
  isolated installation, startup, console response, snapshots 0 -> 1 -> 0 for a
  connecting TCP probe, rollback held while running, full stop and preservation
  of fixture colony/settings files. No licensed human Join or actual colony
  migration was certified. Production binaries/saves and DB rows were unchanged;
  the agent deployment preserved all 12 managed process identities. Test/build
  directories and compiler processes were removed, with evidence retained.
  Coverage is now 22 installation families and 29 remaining game/edition entries.

- FlightGear adds a reviewed fgms 0.13.10 source-build handler. Its fixed source
  commit/archive, GCC/CMake versions, source-date epoch and compiled output are
  pinned. Builds use one compiler job, an isolated home and a clean environment;
  no package installation or FlightGear GUI client is launched. The same bounded
  regular-file source extractor is shared with RimWorld. Only `fgms` is swapped,
  retaining the parent, logs and configuration through rollback. The recipe now
  stays in the foreground, reserves UDP gameplay/TCP status as a two-port bundle,
  and disables the unused native admin listener. Both the existing VPS binary
  and the rebuilt relay passed foreground startup, real zero-player status and
  full port release on stop. Queued source update/rollback also passed, retaining
  config/log bytes and root identity and holding rollback while running.
  Human aircraft Join/occupied queries remain separate. Production relay bytes,
  saves and DB rows were unchanged; deployment preserved all 11 then-running
  managed identities. Coverage is 23 installation families and 28 remaining
  game/edition entries.

- Teeworlds now uses the reviewed native-package handler in community servers,
  regular customer sandboxes and the opt-in Unix-UID supervisor. The supervisor
  independently checks root-owned package pins and copies the verified engine
  into a sealed descriptor before dropping privileges. Bubblewrap mounts those
  bytes read-only with executable permissions; changing an agent-owned pathname
  after verification cannot switch the executable. Missing managed installations
  retain the system-package fallback; partial, linked or modified copies fail
  closed. The scanner conservatively holds updates for every Teeworlds engine at
  its fixed namespace path, including an untouched system-package runtime.
  VPS acceptance (2026-10-15) passed the pinned package download, queued update
  and rollback, zero-player query, sandbox boundaries, saved fixture preservation,
  UID 40000 launch, update held while running, agent restart with the same gate
  and game identities, and whole-scope shutdown. Fixture directories/processes
  were removed. No human Join was certified, no customer identity was enrolled
  in production and no DB rows changed. Deployment preserved all 11 managed
  identities. Coverage is now 24 installation families and 27 remaining entries.

- SuperTuxKart and OpenArena now have reviewed native-package handlers. Both
  update only the executable, retaining the installation parent and any settings
  files. SuperTuxKart uses the existing 1.4 distro assets. OpenArena pins the
  installed ioquake3 dedicated engine and explicitly preserves its original
  wrapper's baseoa path, home directory, protocol 71 and MOTD settings when
  launching the managed native copy. It does not substitute vanilla Quake data.
  VPS acceptance (2026-10-15) passed fixed package downloads, real queued update/
  rollback, process detection, running rollback held, clean shutdown and parent/
  settings preservation. OpenArena answered a real 0/4-player query. A current
  SuperTuxKart instance already owns the host's shared UDP 2757 discovery socket;
  the fixture therefore returned unknown on that host and was separately queried
  in a private network namespace, where it correctly answered 0/4. Multiple STK
  instances sharing one discovery port remain a tracking limitation; this test
  does not certify that setup or human Join. Fixture processes/directories were
  removed. No OS binaries, customer worlds, eligibility or DB rows changed.
  Deployment preserved all 12 then-running managed identities. Coverage is now
  26 installation families and 25 remaining game/edition entries.

- 0 A.D. adds a reviewed Alpha 26 native-package handler, retaining its current
  matching distro data/libraries. Only `pyrogenesis` is swapped. The `0ad` and
  `0-ad` recipe aliases share one update dependency and canonical managed engine;
  an alternate legacy executable blocks validation instead of updating an unused
  binary. VPS acceptance (2026-10-15) passed package download, queued update and
  rollback, headless UDP startup, both alias queue holds, process detection,
  settings/root preservation and complete port release. No player-query adapter
  or human Join was certified; eligibility was not changed by this handler.

- Xonotic adds a publisher-pinned 0.8.6 dedicated-engine ZIP handler. The primary
  download host failed TLS certificate validation; use only the fixed mirror
  listed by the publisher and keep certificate checks enabled. Its full archive
  matches the publisher SHA-512 and the installed native ELF matches the exact
  reviewed SHA-256. Only that executable is extracted/swapped; current game data,
  maps, keys and server configuration remain separate. Downloads use the existing
  Node HTTPS stream with no redirects, bounded bytes/time/disk headroom. Bounded
  ZIP reading rejects changed native bytes, links, traversal and duplicate native
  entries. The first real network fixture stopped before activation because its
  626 MB maps bundle exceeded the non-extracted inventory bound; that bound was
  corrected while retaining the exact 13 MB extracted-engine cap. The successful
  retry reused the publisher-verified archive through the same bounded stream
  path rather than redownloading it. A private-installation fixture then passed
  queued update/rollback, real 0/4-player query with zero bots, running queue hold,
  clean stop and settings/saved-file/root preservation. Its process scan was
  explicitly scoped to the fixture outside production roots. Production engine
  bytes were unchanged; no human Join was certified. Fresh-install URLs now use
  the same official mirror and SHA-512 check. Fixture code/processes and the
  1.24 GB review archive were removed; acceptance records retained. No database
  rows or automation eligibility changed. Coverage is now 28 installation
  families with 23 game/edition entries remaining.
# Daily upstream release scheduling (2026-10-15)

The agent now schedules a persistent daily release check and queues newer builds
through the existing staged-update coordinator. Fourteen installation families
have automatic metadata sources (eight Steam depots plus Mindustry, official
OpenRA, OpenHV, OpenE2140, Hypersomnia and Factorio). Pinned/custom handlers and
the remaining coverage gaps still need compatibility work; this scheduling step
does not certify or enable them. The existing admin Updates section exposes the
last per-installation check, available build and reason. No-op checks create no
update jobs, samples or database writes. Cancelled/failed/applied builds and
rollbacks are not retried silently. Running servers are preserved; updates wait
for their installation to become unused.

Live deployment preserved all twelve managed PID/boot identities. The first
check completed with six newer builds queued, eight up to date and fourteen
review-required profiles. Mindustry's automatic staged update completed on the
VPS; the remaining builds use the same serial maintenance queue. Agent and
targeted platform checks passed, with zero catalog/database writes.

## Durable update failures and ANEURISM IV (2026-10-15)

Persisted failed/interrupted installation jobs now form an acknowledgement-based
outbox. The agent delivers up to ten failures every fifteen minutes through an
authenticated short control-plane endpoint. Telemetry and Bugs use the same
deterministic per-job receipt in their respective collections, so retries after
network/database loss create no duplicate reports and do not reopen dismissed
bugs. Acknowledgement requires both writes. Credential-bearing messages and
URLs are redacted; no raw command output, tokens or account details are sent.
Steam failures now retain safe authorization/network/disk categories.

ANEURISM IV adds Steam depot 2832030 to installation updates, rollback, process
scanning and daily public-branch discovery. The existing namespace supervisor
continues to launch the shared engine; private credentials and per-server world
data stay outside its installation swap. Beta updates preserve their installed
channel and refuse activation if Steam silently switches it. This extends
coverage to 29 installation families (15 automatic release sources), with 22
game/edition entries remaining. Existing running processes survived deployment.

## ET: Legacy coordinated package updates (2026-10-15)

ET: Legacy adds publisher-reviewed 2.85.0 and 2.86.2 package manifests covering
the dedicated engine, matching Legacy server mod, Omni-bot files and licenses.
The bounded extractor verifies the complete managed tree and exact archive
SHA-256; paths, links, duplicate files and altered bytes fail closed. Only the
publisher-owned file manifest is replaced. Generated Omni-bot user settings,
original etmain assets, custom maps and per-server homes are retained. Unknown
server-mod versions and modified managed files require review. Daily discovery
reads the publisher's stable release page, automatically queues only the reviewed
version, and shows future unreviewed versions as review-required.

A VPS private-installation fixture passed the real 2.85.0 to 2.86.2 staged update,
0/4-player game query with zero bots, running-process rollback hold, clean stop,
rollback to 2.85.0 and byte-identical generated bot configuration preservation.
Production game files and catalog data were not changed by this fixture. All
twelve managed runtime identities survived the agent deployment. ANEURISM's
separate fixture also passed staged update/rollback on its current Steam build;
no human Join or save-format upgrade was certified by either check. Coverage is
now 30 installation families, 16 release-discovery sources and 21 remaining
game/edition entries.

## OpenMoHAA publisher package updates (2026-10-15)

OpenMoHAA adds the official 0.82.1 Linux x86-64 ZIP handler for the shared
`openmohaa` installation used by Medal of Honor: Allied Assault. The publisher's
GitHub SHA-256 matches the archive and all ten installed native files. Engine,
server module and matching libraries are verified/swapped together; retail
main/mainta/maintt assets, maps and per-server homes remain separate. Bounded ZIP
extraction rejects links, traversal, duplicates and changed native bytes. Native
dependency checks use the installation's reviewed libraries. Only the dedicated
engine requires executable permission; shipped libraries/unused launch helpers
need not already have that permission. Both canonical game and recipe aliases
hold the same installation queue; failure telemetry uses the canonical game.

Daily discovery reads the stable official GitHub release. The reviewed package
can queue automatically, while a future version requires updated compatibility
review and checksums. An isolated real-VPS fixture passed staged download/update,
a real 0/4-player query, a running-process rollback hold, clean stop, rollback,
and private-configuration preservation. This exercised reinstallation/rollback
of the current version, not a cross-version save migration or human Join. No
production game files or catalog records were changed by the fixture. All twelve
managed identities survived deployment. Coverage is 31 installation families,
17 release-discovery sources and 20 remaining game/edition entries.

## Unvanquished engine and game-data updates (2026-10-15)

Unvanquished adds reviewed 0.55.3 and 0.56.2 universal-package profiles. The old
archive matched its publisher SHA-512; the new archive matched the official
GitHub SHA-256. The installed 0.55.3 baseline matches all 41 native/helper/DPK
files. The bounded ZIP reader verifies the nested Linux-amd64 archive and game
packages as a unit. All selected files have reviewed byte counts and SHA-256s;
links, traversal, duplicates, extra managed files and mixed versions fail closed.
Updates replace only package-owned files and remove obsolete package-owned
versions, retaining custom maps, settings and per-runtime homes. Global home
package overrides require review because the recipe searches them before the
installation's packages. Daily discovery queues only the reviewed current
release, showing future versions as review-required. File-update failures use
the existing durable telemetry/Bugs outbox.

A real VPS isolated installation passed update from 0.55.3 to 0.56.2, native
sandbox game loading, a 0/4-player game query whose unique server identity and
version were checked, running-process rollback hold, console quit without
forced termination or remaining processes, rollback to 0.55.3, and byte-identical
private configuration preservation. Production game files and catalog records
were unchanged by the fixture. Human Join and cross-version client compatibility
were not certified. All twelve managed runtime identities survived agent
deployment. Download regression coverage includes manually validated official
GitHub redirects; existing download callers retain their prior redirect behavior.
Coverage is now 32 installation families, 18 release-discovery sources and 19
remaining game/edition entries.

## Five-game update batch: TES3MP, Battlefield 1942, RVGL, BombSquad, Veloren (2026-10-15)

Three installation families now have checksum-pinned, engine-only update and
rollback handlers: TES3MP 0.8.1, Battlefield 1942 1.61 static Linux server and
RVGL 23.1030a1 amd64. The publisher/mirror archive engines exactly match the VPS
baseline. The Battlefield archive also matches the existing installer checksum.
The bounded archive reader selects only the reviewed engine, never extracts
archive paths, rejects missing/duplicate/special selected members, and verifies
both archive and engine checksums. The existing worker swaps only that engine;
Lua, account data, worlds, profiles, libraries and game assets stay in place.
Battlefield's launch alias must resolve to the reviewed static engine.

Daily official release discovery was added for TES3MP and RVGL. These are
single-version profiles: new engine/data/script combinations require review,
and RVGL's lettered versions are compared for equality rather than misparsed as
numeric versions. Battlefield's fixed community-mirror archive has no declared
stable release feed and stays review-required. These handlers support verified
reinstallation/rollback, not unrestricted future-version upgrades.
TES3MP discovery filters the release list for standard-server tags: GitHub's
`latest` points to the VR variant, which must never replace a normal server.

One real isolated VPS acceptance cycle per game passed download, component
update, startup on an unused port, holding rollback while its process ran,
SIGTERM stop without forced termination, rollback and preservation of a save
written after the update. TES3MP's actual PlayBound Lua tracking reported zero
players and four slots. Battlefield and RVGL checks verified UDP listeners,
not a player query or human Join. Production installations were unchanged.

The other two games remain explicit blockers, not certified handlers:

- **BombSquad:** the live official download page now publishes 1.8.2; the stale
  1.8.0a116 URL returns 404. The downloaded 1.8.2 archive is 6,961,641 bytes with
  SHA-256 `86a51408d50dd92c37318c9f933325d16d3240f7f38e310ba6c59c17e9b846fd`.
  Both the Python controller and game distribution differ from the installation.
  Next work must stage the matching controller/distribution together, retain
  PlayBound's typing patch and private Python 3.14, and put mutable `state`,
  wrapper and configuration outside the rollback unit. Do not overwrite the
  live tree or certify an engine-only update.
- **Veloren:** the installed ZIP is dated August 24, 2026 and its server hash
  differs from official stable 0.18.0. The official stable artifact was retrieved
  successfully, but that does not establish the installed channel or authorize
  a downgrade. Identify and pin that build/channel and its matching assets,
  then stage engine/assets together with `userdata` outside the rollback unit.

Automated regression checks: 305 agent tests (267 passed, 38 platform skips),
19 targeted tests passed on Linux (including two archive boundary cases), nine
platform integration/coverage tests, TypeScript and affected-file lint passed.
Coverage is 35 installation families, 20 release-discovery sources and 16
remaining game/edition entries, including the two blockers above.

Follow-up investigation identified both installed builds. BombSquad is
1.8.0a101 build 22998. Its archived upstream controller matches exactly and all
529 distribution files match after the existing PlayBound typing fix. An
isolated reinstallation succeeded, but real startup failed: the upstream asset
service rejects this old build, and the game query returns no healthy result.
The experimental same-version handler was therefore excluded from deployment.
Next work must upgrade controller and distribution together to 1.8.2, preserving
the separate private Python runtime and mutable state. Do not count a process
or bound socket as a successful BombSquad server.

Veloren's version-only `--version` probe identifies master commit
`f0c97a4372b949239db5f45b3f5a60a882864533`, dated 2026-08-24. Official GitLab
pipelines 2787088120 and 2786866078 identify that commit. The amd64 job
16079391571 has no downloadable artifact remaining. The installed ZIP is retained
unchanged; use a reviewed available matching build/source build and matching
assets rather than silently replacing it with stable 0.18.0. These findings do
not change the coverage counts or enable either blocked handler.

## BombSquad and Veloren paired-runtime fixes (2026-10-15)

Both previous blockers are resolved with reviewed packages in a `runtime`
component. BombSquad 1.8.2 replaces its Python controller and entire distribution
together, retaining the private Python 3.14 runtime, launcher, settings and
`state` outside the swap. Its publisher SHA-256 was verified. The launcher is
checksum-checked too, so a custom launcher cannot silently keep using the old
distribution. The existing typing fix remains part of the reviewed package.

Veloren uses the official October 14 weekly package (commit `f97be347`), newer
than the installed August master build. The engine and 10,654 asset files move
together; the complete reviewed tree and official GitHub archive checksum are
verified. `VELOREN_USERDATA` explicitly retains the original userdata location:
upstream otherwise saves beside its executable, which would put worlds inside
the runtime/rollback unit. A missing managed engine fails closed rather than
selecting a legacy engine with new assets. Console shutdown is declared and new
CLI settings support bounded SIGTERM shutdown after process adoption; existing
custom CLI settings are preserved.

One-time enrollment copies only immutable legacy package files, normalizes
permissions on the copies and verifies them before atomic directory promotion.
Legacy files and saved data remain intact. Current and previous package trees
have separate version pins. The existing installation worker, scanner, lease,
maintenance queue, rollback and telemetry outbox remain the only update path.
Daily checks discover BombSquad's official server build and Veloren's declared
weekly channel. Reviewed upgrades can queue automatically; unreviewed future
packages require compatibility/checksum review, and an attempted or rolled-back
release is not silently reapplied.

Real isolated VPS acceptance passed both cross-version updates, responding
0/4-player game queries, verification of the new executable's process identity,
running-process rollback holds, clean shutdown, binary rollback and retention
of saves written after updating. Veloren's world/configuration stayed outside
its runtime. This certifies package, startup and query behavior, not human Join
or backwards-compatible save formats. The unsupported old BombSquad package is
retained for file recovery; its fresh online asset resolution is not healthy.

Production enrollment/deployment preserved all twelve managed process identities.
Both production update jobs then completed. BombSquad was confirmed empty,
stopped through the agent and restarted under its existing persistent server ID;
its live query reports zero of eight players. Saved-data backups were retained
before either upgrade. No catalog, hosting eligibility or unrelated database
records were changed. Coverage is 37 installation families, 22 official daily
release-discovery sources and 14 remaining game/edition entries.

## Reviewed Java updates and failure-report follow-up (2026-10-15)

YSoccer and TripleA now use the existing update queue with separate, reviewed
JAR components. YSoccer tracks the dedicated PlayBound release by SHA-256:
its `ysoccer-online-latest` tag is mutable and cannot identify installed bytes.
TripleA tracks the official headless release and retains its installed Java 25
runtime, downloaded maps and configuration. Both validate the dedicated main
class, class-file Java requirement, installed Java, publisher/archive checksum
and exact server JAR. Unknown releases require compatibility review.

TripleA launches the exact `bin/game-headless.jar` through its recipe rather
than letting a wrapper search for the first JAR (which could select a retained
rollback). YSoccer has an explicit installation working directory. The root
scanner includes both games and conservatively holds unclassified JVMs without
reading arguments or credentials. Daily checks retain the existing once-daily
cadence, retry suppression and single saved report.

Both candidates passed isolated VPS startup and real zero-player queries,
cross-version installation update, rollback, and retention of saves written
after updating. Production jobs completed; agent deployment preserved all 12
managed process identities. No catalog or database records changed. Coverage
is 39 installation families, 24 release-discovery sources and 12 remaining
game/edition entries. Vintage Story is explicitly deferred by the owner and
remains uninstalled. Hurry Curry's patched source, Freedoom's edition-specific
engines and Freeciv's matching custom data/libraries still need handlers.

The manually cancelled CS2 browser smoke job was precisely corrected from
`failed` to `cancelled`; the historical bug report is not evidence of damaged
CS2 files. The failure reporter has a regression test excluding cancelled jobs.
TF2's genuine SteamCMD Access Denied report remains actionable and its installed
files remain unchanged; no authentication or licensing bypass was attempted.

Launcher source now owns automatic-download rejections (including the separate
promise returned after an update check). Temporary download failures retry at
15 and 30 seconds through fresh checks, then stop; signed URLs are omitted from
diagnostics. Remote Play serializes device registration, backs off background
connection failures and reports a sustained outage once until recovery. A 401
revalidates the exact token used by the request: transient validation keeps the
account linked, and an old request cannot clear a newly linked account. These
launcher changes require a new packaged launcher release to reach users.

Validation: 552 launcher tests passed; 305 agent tests (266 passed, 39 platform
skips); five platform coverage tests, TypeScript and affected-file lint passed.
