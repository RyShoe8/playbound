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
Keep update-handler coverage, daily release-discovery coverage and per-game file
support explicit until each additional handler passes its gates. No placeholder
controls. The dated rollout entries below record acceptance and unresolved gaps.

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
   across Steam and non-Steam installations. Add separate verified strategies for official archives,
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

## Paired packages and reproducible source batch (2026-10-15)

Warzone 2100, Trackmania, Freeciv and Hurry Curry now have separate maintenance
handlers. Warzone owns the official Ubuntu package's engine, crash handler and
data together without modifying OS packages. Trackmania owns only its engine
and Packs; private UserData, logs, maps and account configuration stay outside
package replacement. Its private package refresh and rollback preserve maps
written after an update. Fixed sibling bindings support the engine's native
write locations without allowing arbitrary package symlinks.

Freeciv owns matching engine, library and rulesets. The legacy library's
multiarch path remains valid on rollback. Tolua's random type-registration order
and wall-clock comments are canonicalized in both the Lua source and the embedded
C generator actually compiled by Meson. Two separate source trees now produce
identical SHA-256 checksums across all 784 published files. Hurry Curry pins its
declared source commit, Cargo.lock, admission-limit patch, compiler and Rust
toolchain. Two unprivileged native builds produced the same executable hash.
Workers have neither Docker access nor general root execution; the reviewed
toolchain is installed once by an operator and is root-owned.

Isolated VPS acceptance passed each game's update and rollback with saved-data
retention. Freeciv started with its matching library/rulesets and returned zero
players. Hurry Curry retained protocol 13, admitted two synthetic native clients,
rejected a third at the configured cap, and reported the departure of a client.
Trackmania answered its native LAN management handshake. Source swap/rollback
fixtures reused the separately recorded real source builds; production jobs
rebuild through the actual worker. These are not claims of human-client Join
verification or occupied-load calibration.

The next batch has also started: Combined Arms 1.09 passed an independently
matched official AppImage checksum, embedded engine/mod checks, native dedicated
TCP startup, queued update and rollback. It uses its own installation key, daily
release discovery and conservative OpenRA start/update lock. Cold map indexing
needs a longer startup deadline. OpenRA no longer falls back to a different
edition's engine when the selected distribution is missing.

Production agent deployment preserved all twelve managed PID/boot identities.
Warzone's production job completed. Trackmania and legacy Freeciv were enrolled
without moving saved data; Combined Arms' reviewed package was installed without
changing catalog content or hosting eligibility. Freeciv and Hurry Curry
production rebuilds completed and matched their reviewed hashes. Hurry Curry
was confirmed empty through its native protocol, stopped for maintenance, and
restarted under the same CommunityServer identity; its live native query reports
zero players. The final query/edition update preserved the other eleven managed
process identities. Coverage
is 44 installation families and 29 daily discovery sources; seven game/edition
entries remain, including the explicitly deferred Vintage Story.

Remaining update work is concrete, not covered by another game's handler:

- Freedoom: its official Zandronum download currently returns an HTML challenge,
  not a server archive. Odamex is absent; its misleading Chocolate Doom alias
  is now rejected. Separate Chocolate Doom/Zandronum/Odamex handlers are needed.
  Chocolate Doom now has its own bounded native UDP occupancy query instead of
  using Zandronum's incompatible protocol. A real isolated VPS relay returned
  zero players/eight native slots and stopped cleanly; malformed replies and
  unknown Odamex occupancy remain unknown. This does not certify human Join or
  all Freedoom engine update handlers.
- OpenRA RA2: the compatible mod/engine and original assets are absent on the
  VPS. The ordinary OpenRA distribution must not impersonate it.
- Open Fortress: its mod distribution is absent; the installed TF2 base remains
  preserved while Valve's SteamCMD depot download returns Access Denied.
- Deus Ex HX: the installed Wine game/HX integration requires a component-level
  distribution review that preserves licensed game assets and private saves.
- Space Station 14: review its official build manifest, paired Robust/content
  runtime, .NET dependencies, private databases and schema compatibility.
  The official Linux x64 package for build
  `94087a918a2fae4571f5a529fe14ef7f5dce29a3` was downloaded and matched to the
  publisher's SHA-256. Its engine 289.0.3 differs from installed engine 283.1.3;
  both require .NET 10, which is installed. Shared data/configuration and
  automatic SQLite migrations must be handled before activating an updater.
  The installed distribution also matched its older official archive across
  all 3,700 owned files. The newer package started with a separate data/config
  directory and returned a real zero-player HTTP status, then stopped cleanly.
  Existing databases were not opened or changed by that fixture. An old/new/old
  database compatibility check and a coordinated handler remain to be done.
- GoldenEye: Source: coordinate the Windows Source 2007 base, GE:S mod and private
  Wine runtime rather than overwriting a running or customized private copy.
- Vintage Story remains excluded at the owner's request.

Full management parity still requires the isolation/plugin and human Join gates
above and a packaged launcher release. The update coverage count does not close
those gates. Validation for this batch: 335 agent tests (292 passed, 43 platform
skips), six platform coverage tests, TypeScript, affected-file lint and Linux
archive/native/source safeguards, including 39 affected Linux tests. Transient
Windows rename failures in parallel runs passed when run sequentially;
production runs on Linux.

## SS14 runtime and HX save follow-up (2026-10-15)

Space Station 14 now has a separate paired-runtime updater for the official
Wizard's Den Linux x64 engine/content package. Publisher archive hashes and all
owned-file checksums are validated; build.json, engine version and the installed
system .NET 10 runtime must agree. The ZIP omits execute permission, so extraction
sets it only on the fixed reviewed Robust.Server binary. Private configuration,
logs and databases are excluded from the package swap. Customer instances have
separate data/config paths, validated against links, and the recipe declares both
UDP gameplay and TCP status listeners. The legacy shared instance keeps its
existing configuration/data paths rather than silently moving its database.

Daily discovery selects the newest timestamped Linux x64 entry from the official
manifest and validates its URL, checksum and size shape. An unknown build stays
review-required; it cannot silently migrate databases. Real isolated old/new/old
startup tests retained a SQLite fixture, passed integrity checks, answered real
zero-player status queries and stopped cleanly. These two builds have the same
58 migrations; that is evidence for this exact pair, not a guarantee for future
database formats. The actual update worker also passed update/query/rollback
with database/config retention. Production enrollment preserved all twelve
managed process identities and the production update completed to content build
94087a918a2fae4571f5a529fe14ef7f5dce29a3 / engine 289.0.3. No production game
database was opened by the isolated fixtures and no catalog/eligibility changed.

The next engine review found that HX rooms symlinked the shared Save directory.
New rooms now create private Save folders; an old shared link fails with an
explicit migration reason. Private System/configuration links are rejected.
The two existing operator test rooms were migrated while the agent was stopped,
copying and verifying the original saved file before replacing their known
links. Original shared saves and the prior links were retained. All twelve
managed processes survived agent restart. Regression tests verify that one
room's saved game cannot appear in another room or change the installed saves.
HX's reviewed Wine/mod update handler remains separate unfinished work.

Coverage is 45 installation families and 30 daily release-discovery sources.
Remaining update entries: Freedoom's hosted Zandronum engine, Deus Ex HX, GoldenEye:
Source, OpenRA RA2 and Open Fortress; Vintage Story remains owner-deferred.
Runtime isolation/plugin support, human Join acceptance and a packaged launcher
release remain full-plan gates. SS14 validation: six platform coverage tests,
TypeScript and affected-file lint, 340 agent tests (295 passed, 45 platform skips),
23 affected Linux JS tests and four archive-boundary cases; HX's three Linux
tests also pass. The final HX validation and safe-error diagnostics are deployed;
all twelve managed process identities were preserved again.

### Freedoom scope correction and latest native checks

Freedoom provides IWAD game content, not a standalone dedicated-server engine.
The offered hosting path is Freedoom + Zandronum. An omitted edition in legacy
parties still means that default engine; it must not be interpreted as a separate
base-game server. The party capability check now rejects explicit GZDoom,
DSDA-Doom, Ashes and other client editions, and the agent refuses to silently
substitute Zandronum for an unknown edition. The host inventory labels the default
path Freedoom + Zandronum. Existing engine-specific low-level compatibility code
does not enable another public hosting edition. Odamex source review was stopped
without installing anything; optional engines are outside this completion gate
unless deliberately offered and verified. No catalog or operational profile was
changed. See https://freedoom.github.io/about.html.

GoldenEye's isolated private Wine runtime did not answer a native A2S query
within the bounded startup check; the fixture was stopped. It remains blocked,
not verified by installation or a port bind. No production GoldenEye files were
replaced. The final SS14 name/status-port and Freedoom compatibility guards passed
35 Linux agent tests plus four archive-boundary cases, and 60 affected platform
tests passed with TypeScript and affected-file lint. The agent deployment retained
all twelve managed process identities and left catalog/database records untouched.

## Zandronum updates, GoldenEye and HX occupancy (2026-10-15)

Freedoom's hosted Zandronum engine now has a reviewed component updater. The main
download site still returns an HTML challenge, but DRD Team's maintained Debian
repository supplies the native amd64 server. Its signed repository metadata was
verified against key `0D8F900AB77BB504F2C69E7A392203ABAF88540B`; the package
SHA-256 matches that signed index. Required Zandronum and Skulltag PK3 hashes
exactly match the installed distribution. Only the native engine is swapped;
IWADs, maps, private settings and saved data stay untouched. The Debian wrapper
and maintainer scripts are never installed or executed. Fixed-member extraction
rejects missing/duplicate/special or changed members.

The actual isolated maintenance worker passed native queries before update,
after update and after rollback; the original binary checksum and newer saved
fixture survived rollback. The installed upstream archive remains a reviewed
baseline. Daily discovery retains Debian revisions, queues the approved 3.2.1-1
package once, waits for affected servers to stop, and requires review for unknown
revisions. Failed/cancelled or rolled-back builds are not silently retried daily.
The process scanner and exact sudo allowlist include Freedoom. This covers the
Zandronum hosting edition, not a standalone Freedoom engine or other source ports.
Coverage is now 46 installation families and 31 daily discovery sources.

GoldenEye's failed loopback check was traced to Source's address behavior. An
isolated server bound to all interfaces and answered its real A2S query through
the VPS address: zero humans, four slots and zero bots. The existing private
Wine runtime was stopped and its large temporary copy removed after checking
that no process referenced it; acceptance evidence was retained. The recipe now
binds explicitly and the agent/platform occupancy mapping uses the existing A2S
public-address fallback. Its coordinated SDK/mod/private-runtime updater and
human Join acceptance remain unfinished; this query does not enable its profile.

HX's published Ports.txt specifies its native query socket at gameplay + 1. A
private Wine fixture returned a complete HXGameInfo reply with its exact gameplay
port, zero humans and four slots. The new bounded parser/query adapter passed a
second real fixture check and rejects incomplete replies, wrong ports/game types,
duplicate keys and impossible counts. It never interprets failure as an empty
server. Private HX rules now survive restarts while managed ports, slots and
download/uplink safety settings are reapplied. Its Wine/mod update handler is
still separate work; no retail game assets were downloaded or redistributed.

Open Fortress review confirmed that its official alpha requires the Source SDK
2013 Multiplayer `previous2021` branch. Steam app 244310 exposes that branch at
build 6982827, and an isolated anonymous install succeeded after an initial
failed attempt. The publisher-linked 2,617,348,367-byte mod archive was downloaded
with SHA-256 `4ac3451e099e8057af5e5ebe765c3b90fb5e6afdaeedaeb9d7a0ea47eb609b1e`.
All 27,193 archive entries were checked for safe relative paths, duplicates,
regular-file/directory attributes and bounded expanded size before extraction.
Its server.so is 32-bit. The production TF2 engine is now 64-bit, and its recipe
always selected the ordinary `tf` game even for the Open Fortress edition.
That invalid fallback now fails closed; an ordinary TF2 server must not be
advertised as Open Fortress. The staging packages do not enable that edition or
replace any existing TF2 files. Coordinated SDK/mod updates, private runtime
refresh, native acceptance and human Join remain its gates.

The subsequent native staging check passed: Open Fortress loaded dm_2fort,
returned zero humans/four slots/zero bots through the existing Source query,
and registered an anonymous Steam game-server ID. Initial failures were traced
with an unprivileged debugger to missing dedicated module aliases, followed by
invalid TF2 resource paths. Fixed local `_srv.so` bindings and explicit Linux
paths to the existing TF2 assets resolved startup. Only the isolated SDK/mod
tree was changed; the production TF2 installation was never modified. The
working staging tree remains at
`/var/lib/playbound-host/state/openfortress-package-review-zx6nOA` for the
coordinated updater/private-runtime implementation. It is not a production
installation or proof of human Join. Original publisher archives/checksums and
native acceptance evidence were retained. No test server remains running.

All twelve production managed identities survived each guarded deployment.
Validation includes the final full agent suite (348 cases: 303 passed, 45 platform
skips), targeted Linux cases and the real HX adapter fixture. The affected platform coverage/query tests,
TypeScript and lint passed. No catalog/profile or production database changes
were made by this batch. Remaining update handlers are HX, GoldenEye, Open
Fortress and RA2; Vintage Story stays owner-deferred. General isolation/plugin,
human Join and packaged-launcher gates still apply.


## Open Fortress production recipe and private runtime (2026-10-15)

The native Open Fortress recipe is now deployed, separate from ordinary TF2.
The canonical catalog identity stays `team-fortress-2:open-fortress`; party
selection and new/saved operational profiles resolve that edition to the
`open-fortress` recipe. No parallel catalog game, catalog sync or production
profile/database write was made. Existing profiles with the old recipe require
a scoped admin save before using the new recipe.

The reviewed ELF32 SDK/content baseline is
`alpha-2024-09-06-sdk-6982827-pb2`: 27,076 files, 8,089,733,594 bytes, tree SHA-256
`0c537ccfe7af1110c83be2e8bbc0fbeedd8c73ab390acd0f10d7cca7f434b33d`.
A staging-generated SDK console log was excluded from the clean package;
publisher assets and native binaries were retained. Its complete fingerprint
is checked in a bounded child process before preparation so large VPK hashing
does not block the control agent. Hashing also streams files rather than
allocating an entire VPK in memory.

Each stable identity owns a private launcher, SDK/mod module bindings,
configuration, logs, downloads and generated map graphs. This resolved legacy
Source's 512-byte command-line limit, module identity failures from independent
alias copies, executable-relative writes, and node graphs being generated in
shared maps. Shared installed assets stay outside the server's mutable paths.
TF2 updates hold while Open Fortress runs because it mounts TF2 resources.
Its own updater is deliberately not aliased to TF2.

The final VPS fixture passed full package verification, real A2S occupancy,
a four-player cap, live time-limit writes/reads, zero-human/two-bot reporting,
stop/restart, and retention of private configuration. A second full verification
between runs passed, including the generated-graph separation. No fixture
process remains. Declared Source controls and actual Open Fortress map options
now feed the existing party, server-manager and overlay surfaces. Native bot
fill is wired to the fleet setting with a 32-slot ceiling and one slot reserved
in its requested target. Human Join, observed human/bot replacement and Windows
self-hosted control acceptance are not implied by this native fixture.

The first narrow SHA-pinned agent deployment preserved all eleven live managed
PID/boot identities, and the authenticated health check reports the recipe
installed/ready. The service and 15-minute timer remain active. UDP gameplay
ports 27150–27169 are allowed; RCON was not publicly opened. Automatic hosting
eligibility was not changed. Validation: 351 agent cases (305 passed, 46
platform skips, no failures), Linux private-runtime cases, 134 affected platform/
control tests (including isolated Mongo permission tests), TypeScript and affected-file lint. No production database writes.

Still required: Open Fortress's coordinated SDK/mod staged update, rollback and
daily discovery handler; HX, GoldenEye and RA2 update handlers; remaining Unix
isolation/plugin gates; real-client and packaged-launcher acceptance. Inventory
coverage remains 46 installation families and 31 daily discovery sources.
Vintage Story remains deferred at the owner's request.


The control adapters now select settings using the game and edition together;
they retain the catalog identity in runtime status. Pre-launch party settings,
party maps, managed settings and customer map/moderation permissions all select
the Open Fortress schema instead of TF2 maps/defaults. Regression cases cover
both party and managed adapters. Generated private management configuration
also carries hostname/RCON credentials, keeping Unicode names within the legacy
command-line limit and credentials out of process arguments.

The final credential/configuration follow-up preserved all twelve then-running
managed identities. Its post-restart authenticated health check passed.

## Open Fortress coordinated updates and rollback (2026-10-15)

Open Fortress now has its own installation target and daily discovery source
(47 installation families, 32 daily discovery sources). Steam SDK app 244310,
`previous2021` build 6982827, and the publisher's alpha mod archive are assembled
and verified together. A separately downloaded SDK/mod tree matched the approved
baseline; the current pb3 package excludes generated `modelsounds.cache` and
keeps that cache private. Its 27,075 files / 8,089,698,900 bytes have tree SHA-256
`cc35f13136555de3b335ea5694792d06c15702b88c5e369a803ddc33b413cc3a`.

The real VPS worker completed pb2 → pb3, rollback to pb2, and reapply to pb3.
Each transition passed a private native server check: real A2S reply, four slots,
zero humans/two bots, live time-limit write/read, clean stop/restart and retained
configuration. Reapply fully verified and reused the retained reviewed package
instead of downloading and duplicating another 8 GB tree. The initial transient
Steam bootstrap failure preserved the installed package; bootstrap retry is
bounded to one transient-network retry, excluding authentication/disk/timeouts.

Daily discovery compares both SDK branch and mod metadata. Unreviewed composite
releases remain review-required. A real-history isolated daily check confirmed
that deliberate manual rollback is not automatically undone. A final live
SDK/publisher metadata probe resolved pb3 successfully. No production
catalog, hosting profile or database records were changed.

Inventory reads now use verification records for Open Fortress and six paired
runtime families; start and update activation still perform full verification
off the agent's event loop. Authenticated health responded in 84 ms during
worker verification. Cold inventory can still take about 15 seconds, chiefly
Unvanquished, Factorio and Enemy Territory verification; this is not claimed
as resolved. All then-running managed process identities survived each narrow
agent deployment, and the agent and 15-minute timer remain active.
The final authenticated health check returned HTTP 200 in 100 ms; the private
acceptance processes were stopped.

Validation: 364 agent cases (318 passed, 46 platform skips, zero failures),
five Python archive/SDK manifest cases, targeted Linux checks, 60 affected
platform cases, TypeScript and affected-file lint. Evidence is retained under
`/var/lib/playbound-host/state/openfortress-package-review-zx6nOA` on the VPS.

Remaining update handlers: Deus Ex HX, GoldenEye: Source and OpenRA RA2.
Vintage Story remains owner-deferred. Remaining acceptance includes per-customer
Unix isolation/plugin boundaries, actual human Join and human/bot replacement,
and packaged-launcher/self-hosted controls. These fixtures do not satisfy those
gates or enable an operational hosting profile.

## HX update delivery and remaining package prerequisites (2026-10-15)

Owner direction: human Join acceptance is no longer a release gate for this
work. No human Join result is claimed; native protocol/control checks continue.

HX now has a separate `deus-ex` installation target, mapped from the canonical
`deus-ex-goty-edition` game. Its staged component is `System`; retail maps,
assets and saved games are outside that swap. Only the pinned public HX 0.9.89.4
archive is downloaded, with exact size/SHA-256 and a bounded, allowlisted ZIP
extractor. The existing unprivileged worker, process scanner, start lock,
atomic activation, retained rollback and update-failure reporting are reused.
The scanner includes private Wine server directories, not just the shared base.

Private server preparation refreshes reviewed HX executable/package files and
preserves `HX.ini`, `HXUser.ini` and saves. All files are preflighted before
replacement; modified private binaries, links and unknown shared releases require
review. Future compatibility profiles must explicitly retain prior reviewed
hashes for upgrades and reverse hashes for rollback; do not overwrite arbitrary
private files. Configuration defaults remain separate from private rules.

Daily discovery reads the publisher's existing testing channel and compares
numeric versions. A newer unreviewed version is reported for review, never
installed as an arbitrary archive. Live discovery resolved 0.9.89.4. The actual
worker reinstalled the reviewed release, retained a rollback, and completed
rollback. Native Wine fixtures before/after update and after rollback answered
the HX player query with zero players/four slots. No human client was needed.
The final state is the reviewed 0.9.89.4 release; no production DB writes.

Narrow deployment preserved all 11 then-live managed identities. Validation:
371 agent cases (324 passed, 47 platform skips, zero failures), all seven HX
Linux cases, six platform installation-coverage cases, TypeScript and affected
platform lint. Evidence is retained in the VPS's
`/var/lib/playbound-host/state/hx-query-review-TVmO31` directory. Inventory now
has 48 installation families and 33 daily discovery sources.

Remaining update work is GoldenEye: Source and OpenRA RA2. GoldenEye's existing
installation occupies 7,854,196,965 bytes. At this check the node had
42,591,703,040 bytes free against its approximately 41.5 GB disk reserve, so
staging a replacement/rollback is not safe yet; the reserve was not lowered or
rollback packages deleted. Its current recipe also copies the private engine
only once and needs a reviewed private-runtime refresh before updates qualify.
RA2's recipe deliberately refuses fallback to an unrelated OpenRA engine; no
reviewed RA2 engine/mod/assets package is installed. Its source/distribution
review remains separate from the official OpenRA updater. Vintage Story remains
owner-deferred. Unix isolation/plugin and packaged-launcher controls remain
independent work; this batch does not claim those are complete.

## GoldenEye and published OpenRA editions (2026-10-16)

Read-only live catalog audit found five OpenRA editions: Official, Combined
Arms, Crystallized Nexus, Tiberian Dawn HD and `ra2` (Romanov's Vengeance).
These are separate engine/mod packages. Exact edition `ra2` uses mod `rv`,
Crystallized Nexus uses `cn`, and Tiberian Dawn HD uses its own `cnc` engine.
Unknown edition installations fail closed. Master-list queries now match the
edition's actual mod. Launcher source includes the `cn` fallback; no launcher
binary was released in this batch.

Four additional update handlers are deployed: GoldenEye: Source, Romanov's
Vengeance, Tiberian Dawn HD and Crystallized Nexus. GoldenEye stages the reviewed
5.0.6 mod with SDK 2007 build 195543, verifies complete tree fingerprints and
PE32 architecture, and preserves private settings, logs and Python state.
Modified private launchers and legacy full-copy layouts require review.
Each OpenRA edition has a separately reviewed AppImage with bounded extraction,
embedded engine/mod verification and explicit client compatibility. Crystallized
Nexus stays on playtest-20260820; launcher-v2.0.0 is not a game-server release.

All four real update jobs and all four rollback jobs completed. These exercised
same-reviewed-version reinstall/rollback, not unknown future compatibility.
All three additional OpenRA packages passed native protocol handshakes. Daily
discovery matched installed versions for all four handlers. Final guarded agent
deployment preserved all 12 then-live managed process identities; service and
15-minute timer stayed active. No Mongo catalog or operational profile writes.

GoldenEye's query and live time-limit control passed, but an empty-server bot
check still returned zero bots for a target of two. Bot-fill additions were
withheld from automatic hosting and the settings schema. No human Join or
human/bot replacement result is claimed; human Join is owner-waived.
ModDB denied the VPS download, so GoldenEye currently requires the exact official
mod archive seeded in its digest-verified cache; its SDK is freshly staged.
Unknown SDK/mod combinations require review before activation.

Coverage is 52 installation families and 37 daily release-discovery sources.
The remaining 15 are not claimed to auto-download upstream releases. Vintage
Story remains deferred. Steps 4/5/7 still include broader customer isolation,
executable plugins and packaged-launcher/self-hosted acceptance; this update
batch does not complete those independent release gates.

Validation: 376 agent cases (327 passed, 49 platform skips, zero failures), all
three GoldenEye Linux runtime/PE32 cases, affected platform/launcher tests,
TypeScript, lint and a production build using an isolated local test database.
VPS evidence lives in `/var/lib/playbound-host/state/hosting-final-acceptance/`
and the corresponding package-review directories. Native fixtures now use
bounded transient systemd services. An old private Combined Arms fixture was
identified by name, staging script and port and stopped without stopping a
production runtime. User saves and shared game installations were retained.

## Explicit manual update policy and HX picker correction (2026-10-16)

All 15 installation families without daily upstream discovery now carry an
individual manual-update limitation in agent inventory and daily reports, with
matching display in the existing admin installation panel. The declarations
are in `platform/game-host/manualInstallationUpdates.json`; a coverage test
requires the list to exactly match families without automatic discovery, so
new handlers cannot silently lose their policy. This completes the owner's
requested automatic-source-or-explicit-manual-limitation coverage: 37 automatic
sources, 15 declared manual policies, 52 total. A manual Queue update reuses the
reviewed package; it does not fetch an arbitrary newer upstream version.

The VPS deployment preserved all 12 managed process identities. A real
authenticated inventory probe confirmed all 52 targets and all 15 explicit
manual limitations. Agent suite: 328 passed, 49 platform skips, no failures;
TypeScript and affected UI lint passed. No production database changes.

Deus Ex's existing `playbound-hx-coop` edition already selects the HX party/VPS
recipe, local HCC dedicated host, agent-local player query and `deus-ex` update
family. The hosting picker now excludes vanilla and single-player GMDX fallback
profiles, and recognizes HX eligibility without requiring a redundant dedicated
feature tag. Public catalog endpoints omit the testing game, so this is not a
claim that its live publication or hosting profile has been enabled. Twenty-one
HX/hosting-picker/query tests passed. No catalog seed was synchronized.

Customer isolation and executable-plugin/Workshop installation remain open.
The deployed filesystem sandbox covers five engines; the separate-UID handoff
and fixed network policy remain Teeworlds-only. Do not expose executable uploads
or claim tenant isolation across the remaining recipes from update coverage.

## Native UID handoff expansion (2026-10-16)

BZFlag and Hedgewars now join Teeworlds as explicitly enrolled Unix-identity
profiles. Migration retains originals and later progress; root-owned game tags
prevent cross-engine reuse. Engines are sealed from a fixed reviewed manifest
before dropping privileges. The sealed-engine helper supports all five native
filesystem profiles, but OpenTTD/Luanti UID runtime handoff remains unfinished.
Hedgewars required fixed read-only protocol/service database mounts; no general
host /etc mount was added. Missing migration proof blocks execution.

Actual VPS fixtures passed game query, idempotency, unchanged game PID across
agent restart, metrics, full scope shutdown and save-preserving rollback for
both games. Fixtures were removed; the narrow live agent deployment preserved
all twelve production managed process identities. No customer was automatically
enrolled, no catalog/profile DB writes, no executable plugins enabled.
Validation: 52 Linux root-helper cases and 329 agent cases passed (49 local
platform skips). Additional games, native network/admission-port protections,
seccomp and executable-plugin/Workshop gates remain open; this is an isolation
expansion, not a claim of universal tenant isolation.

## Combined native isolation and protected data operations (2026-10-16)

OpenTTD and Luanti now have the same explicit UID handoff as Teeworlds, BZFlag
and Hedgewars. All five require sealed engine files, a root-owned migration
journal, reserved UID, restricted filesystem/process namespace, resource limits,
and a fixed seccomp filter. Unix sockets and dangerous kernel interfaces are
denied. A per-UID nftables guard blocks host/private destinations while retaining
public connections and replies. Recovery validates the actual rule structure;
unknown or altered rules are never silently replaced.

The VPS systemd build does not include its socket-bind BPF framework. A fixed
six-instruction kernel program instead restricts explicit IPv4/IPv6 binds to the
allocated port. Launch verifies negative bind probes; recovery compares the
exact attached program IDs. There is no caller-supplied bytecode or port-rule API.

All five isolated VPS fixtures passed start, restart adoption of the same game
PID, metrics, full scope stop, and rollback preserving original and newer data.
Four returned real zero-player/four-slot queries. Luanti returned unknown, not
zero; its current isolated configuration is private/unlisted. Public master-list
announcement and its query transport must be adapted before public enrollment.
The host-network preflight separately confirmed IPv4/IPv6 local-service denial,
public outbound access, public inbound replies, and an unaffected agent UID.
Fixtures were removed after acceptance.

OpenTTD/Luanti stopped-world snapshots and browser file operations now use fixed
root helpers. File operations drop to the reserved UID before executing the
bounded worker. Snapshots retain verified metadata and checksums; atomic restore
retains pre-restore data, updates the migration inode, and supports interrupted
transaction recovery. Running worlds, cross-server metadata, traversal, links,
executable uploads, disk pressure and excessive input fail closed. Luanti live
fixture acceptance covered snapshot/restore/restart, file ownership, and unsafe
path/code rejection. Recovery remains a direct-root operator command.

Validation: 70 Linux helper tests passed, including firewall-tamper and bind-policy
regressions; agent suite passed 331 cases with 49 platform skips. No database
writes or automatic customer enrollment. Other installation families and
executable plugin/Workshop support remain unfinished; these five private opt-in
profiles do not establish universal customer isolation.

Luanti executable content has an additional engine gate: the pinned reviewed
5.6.1 package predates the LuaJIT sandbox fix in 5.15.2. See
[GHSA-g596-mf82-w8c3](https://github.com/luanti-org/luanti/security/advisories/GHSA-g596-mf82-w8c3).
Generated isolated configuration enforces mod security and empty trusted/HTTP
allowlists, but is not represented as fixing that CVE. Upgrade or verify an
upstream-supported patch before enabling executable content; do not use a
ContentDB download or OS sandbox as evidence that the engine gate passed.

## OpenArena identity and live-control acceptance (2026-10-16)

OpenArena adds a sixth explicit UID profile. Ordinary community/party launches
remain unchanged. The handoff accepts only the existing recipe's fixed tokens
and typed name, player/bot limit and generated control password; injected console
programs, undeclared settings and out-of-range ports are rejected. The reviewed
engine is sealed from its root-owned manifest. The root supervisor supplies a
read-only config through Quake's virtual filesystem, with the same mandatory
seccomp, host-egress and allocated-port restrictions as the other UID profiles.

VPS acceptance confirmed four slots, RCON, two bots counted separately from zero
humans, map change, same process through agent restart, scoped stop and rollback
preserving old/new data. The fixture was removed. Live controls uncovered two
engine behaviors now handled explicitly: zero bot fill stops replenishment but
requires `kick allbots` to remove connected bots; a silent bot cvar update needs
an exact readback rather than a replay or success inferred from silence.

Validation: 335 agent tests passed with 49 platform skips, 71 Linux helper tests
passed (including all six seccomp namespace probes), 17 platform RCON tests and
TypeScript passed. Guarded deployment preserved all eleven then-running managed
process identities. No customer enrollment or database changes. Full-catalog
isolation and executable-content installation remain open.

## Wesnoth and SuperTuxKart boundary work (2026-10-16)

Wesnoth's explicit UID profile passed real VPS startup, zero established
connections, same-process adoption across agent restart, scoped stop and
save-preserving rollback. Its read-only generated configuration retains the
1.18-series compatibility rule; callers cannot supply configuration directives.
The lobby's maximum slots remain unknown. No customer was enrolled.

SuperTuxKart has an experimental operator-only handoff with typed declared modes,
difficulty and slot bounds. Its fixed kernel policy permits the allocated game
port plus UDP discovery on 2757; TCP on the discovery port and explicit bind-zero
remain denied. Regression tests interpret every policy branch against allowed
and denied ports/protocols. The kernel rejected an incorrect context offset in
the initial staging program; it was corrected before successful runtime startup.
Do not infer enforcement merely from systemd accepting a setting.

The STK fixture ran under its reserved UID and the combined boundary, stopped
cleanly, and preserved data on rollback. Its discovery query remained unknown,
so readiness acceptance is explicitly false and it must not be customer-enrolled
or offered executable content yet. The shared-port query now ignores responses
for other game ports instead of accepting the first unrelated reply. All fixture
processes/data were cleaned up. This is not STK public hosting acceptance.

Latest validation: 336 agent tests passed, 49 platform skips; 74 Linux helper
tests passed. The guarded live agent deployment retained all eleven managed
process identities. Platform RCON tests and TypeScript passed earlier in this
batch. Remaining games and content support still require engine-specific work.

## Native data-management parity and STK diagnosis (2026-10-16)

The protected snapshot/file helper now covers all seven verified native UID
profiles: Teeworlds, BZFlag, Hedgewars, OpenTTD, Luanti, OpenArena and Wesnoth.
The existing My Servers files/backups surfaces discover these through the shared
capability list; no new page or general root filesystem API was added. Mutations
remain stopped-only and execute under the reserved server UID. Snapshot/restore
remains root-mediated, inode-bound and retains the pre-restore data.

Thirteen Linux snapshot tests passed, including separate restore/UID checks for
the newly covered engines. A real Teeworlds fixture passed busy-world rejection,
atomic restore, reserved-UID file writes, traversal/executable rejection, restart
after restore and save-preserving migration rollback. Fixture data/processes were
removed. The narrow live agent deployment preserved all eleven running managed
processes. Customer enrollment and production database writes remain zero.

The STK discovery blocker is now traced to its upstream `initSystemIP` routine:
it probes IPv4/IPv6 through temporary bind-zero sockets. The strict native bind
policy rejects these, and the engine consequently misdetects protocol support.
See [upstream NetworkConfig](https://github.com/supertuxkart/stk-code/blob/1.4/src/network/network_config.cpp).
Do not loosen the whole fleet's bind policy or call the isolated profile ready.
It needs a reviewed engine adaptation or isolated network allocation. Its
discovery parser additionally requires the complete packet, matching game port,
valid flags and plausible counts; truncated packets never certify emptiness.

## Additional native and first Java identity profile (2026-10-16)

0 A.D. has an explicit `0-ad-unix-v1` boundary using the reviewed `0ad` package.
Typed maps/slot counts, its one fixed port and the existing nonvisual dedicated
startup contract are enforced independently in the agent and root helper.
Actual VPS acceptance passed bound-port startup, same process after agent
restart, metrics, scoped stop and save-preserving rollback. Occupancy remains
unknown: this is process-isolation acceptance, not a query/Join/rotation gate.

YSoccer adds `ysoccer-unix-v1`, the first Java handoff. Its root-owned reviewed
release manifest must match the installed JAR bytes; the helper copies those
bytes into a sealed descriptor before dropping privileges. JVM path, heap,
metadata/code-cache limits, processor count and game ports are fixed. The normal
shared-service Java symlink resolves outside the sandbox through alternatives,
so this profile uses the reviewed installed OpenJDK 21 path directly.
Changed manifests, linked/changed JARs or undeclared runtime options fail closed.
New upstream JARs also need the root manifest updated before isolated starts;
the ordinary updater cannot silently bless an arbitrary executable digest.

Java NIO requires connected Unix stream socket pairs. Those are permitted;
ordinary AF_UNIX socket creation and datagram/seqpacket pairs remain denied.
Every engine's namespace probe verifies private stream IPC, rejection of
reconnectable pairs, and failure to connect an existing pair to a real host
abstract listener. See [socketpair semantics](https://man7.org/linux/man-pages/man2/socketpair.2.html).
This updates the earlier shorthand “Unix sockets denied”: private connected
stream pairs are deliberately supported, host Unix service connections are not.

YSoccer's VPS fixture passed zero established connections, same-process restart
adoption, metrics, scoped stop and rollback preserving newer data. Maximum slots
remain unknown because its occupancy adapter does not expose them. Both fixtures
were removed. These remain operator-enrolled profiles; no customer/database
records were changed. Broader isolation and executable-content support are open.


## FlightGear and isolated STK acceptance (2026-10-16)

FlightGear now has an explicit `flightgear-unix-v1` identity handoff. Its reviewed
fgms binary is copied into a root-owned installation and executed from a sealed
descriptor. Only the allocated even gameplay port and its TCP status port are
allowed; the unused native admin listener is disabled. The actual VPS fixture
passed zero-player query, unchanged gate/game PID after agent restart, process
metrics, full scope stop and rollback preserving old and newer data.

SuperTuxKart requires the dedicated adapted 1.4 engine, not the stock binary.
The reviewed patch detects address families without bind-zero probes and accepts
a supervisor-selected discovery port. Each new STK allocation reserves two ports;
isolated gameplay uses an odd port 2759–2777 and discovery uses only UDP port+1.
Stock launches retain upstream discovery behavior. Kernel policy rejects port0,
shared discovery2757, TCP discovery and unallocated ports for the isolated profile.
The sealed build is pinned in `stkIsolatedBuild.json`; `tools/build-stk-isolated.sh`
builds it as an unprivileged operator. The direct-root-only promotion helper verifies
commit, source diff and resulting binary bytes. Neither helper enrolls customers.

The second VPS STK fixture returned zero players/four slots, retained the exact
gate and game process through agent restart, reported metrics, stopped its full
scope and preserved newer data on migration rollback. It coexisted with the stock
server without taking its discovery socket. Both fixtures were removed. The first
adapted build fixed address-family detection but still conflicted on discovery;
its evidence explicitly remains unaccepted and is superseded by the port-pair run.

Installation inventory now reports isolation/content readiness separately from
update support. Eleven families have explicit operator-only identity profiles;
other families remain pending. Executable content remains disabled across all
families pending each engine's boundary, compatibility and recovery acceptance.
Luanti additionally exposes its pinned LuaJIT vulnerability blocker. This is not
completion of universal isolation or Plugin/Workshop support. Production database,
catalog and customer enrollment changes remain zero.


### Mindustry isolated Java acceptance (2026-10-16)

`mindustry-unix-v1` uses the installed official 160.7 server JAR whose bytes match
GitHub's published release digest. The root-owned `customerJavaProfiles.json`
authority is separate from normal release discovery; new isolated Java builds
require a reviewed root pin rather than accepting an agent-supplied checksum.
The root supervisor seals the JAR before dropping privileges and generates only
bounded name, port, player-limit and host commands. Commas, newlines, control
characters and undeclared commands are rejected independently at both boundaries.
The fixed OpenJDK21 security configuration is mounted read-only without exposing
all of `/etc`. Ordinary wrapper launches retain their existing behavior.

The VPS fixture passed native query (zero players/four slots), the exact game
and gate PID after agent restart, process metrics, full scoped stop and migration
rollback retaining older and newer data. Fixture processes/data were removed.
Mindustry joins the twelve explicit operator-enrolled identity profiles. This is
not live-console or executable-mod acceptance: those operations still need a
UID-aware transport, quotas, compatibility and rollback before enabling content.
Source: https://github.com/Anuken/Mindustry/blob/master/server/src/mindustry/server/ServerControl.java

Latest batch validation: 341 agent tests passed with 49 platform skips; 95 Linux helper tests passed. TypeScript and targeted admin lint passed. Both guarded agent deployments retained all eleven running process identities; service and 15-minute timer are active. No customer enrollment or database/catalog changes were made.


### Hurry Curry asset-boundary acceptance (2026-10-16)

`hurry-curry-unix-v1` adds the thirteenth explicit offline identity profile.
Its reviewed 3.1.2 executable is root-promoted and sealed. Thirty-four existing
YAML assets have a separate root-owned pin inventory; each is copied into a
sealed read-only descriptor before entering the namespace. Shared directories,
unlisted files, links, executable paths, remote URLs and caller checksums are
not mounted or accepted. Per-file/count/aggregate size bounds apply. Changed
assets fail closed and updates require explicit review of the isolated pin set.
This preserves the existing data set; it is not an upstream asset auto-updater.

The VPS fixture passed port-ready startup, unchanged gate/game PID through agent
restart, metrics, full scoped stop and rollback preserving older and newer data.
It deliberately remains unregistered, with unknown occupancy rather than a false
zero. Public master discovery/query, live UID-aware controls and executable
content are not accepted. No normal/community launch behavior is changed.
Fixture data and processes were removed. Production customer enrollment stays zero.

Hurry Curry batch validation: 341 agent tests passed with 49 platform skips; 99 Linux helper tests passed. Guarded live deployment preserved all eleven managed process identities and the service/timer remain active.


### AssaultCube isolated native acceptance (2026-10-16)

`assaultcube-unix-v1` adds the fourteenth explicit offline identity profile.
The reviewed 1.3.0.2 Linux server is root-promoted and sealed. Forty-four existing
compressed map files are independently pinned and sealed; shared installation
logs, private keys, password files and unrelated configuration are not mounted.
The supervisor generates bounded name/slot arguments and uses empty read-only
configuration plus private writable logs/demos/vita paths. Gameplay uses an odd
port28763–28781; only UDP port+1 is allowed for queries. The optional shared LAN
listener remains denied without weakening the allocation fence. Ordinary launches
retain the existing binary selection and server configuration.

The live fixture returned zero players/four slots, retained the exact gate/game
PID through agent restart, reported metrics, stopped the full scope and preserved
old/new data through rollback. Fixture processes/data were removed. The staging
run caught a second recipe-resolution step dropping the identity profile; both
resolution contexts now preserve it, avoiding fallback to the legacy symlink.

Validation: 341 agent tests passed with 49 platform skips; 101 Linux helper tests
passed. The namespace/syscall test now supplies a private asset mount for the new
engine before checking dangerous calls, host secret visibility and Unix sockets.
Executable content and UID-aware live administration are still separate gates.
Source: https://github.com/assaultcube/AC/blob/v1.3.0.2/source/src/protos.h
Query transport: https://github.com/assaultcube/AC/blob/v1.3.0.2/source/src/serverms.cpp


### Protected data management across all accepted identities (2026-10-16)

Protected files and stopped-only world snapshots now cover all fourteen accepted
operator identity profiles, including STK, 0 A.D., YSoccer, FlightGear, Mindustry,
Hurry Curry and AssaultCube. The root helper derives the actual game and data
location from its activation journal; the caller cannot select another directory.
Per-game Linux restore fixtures verify UID preservation and activation-inode
updates. The existing browser file policy continues to reject executable content,
secrets and traversal. This does not enable plugin uploads through the file API.

Twenty-one Linux snapshot tests passed. The live AssaultCube fixture additionally
passed reserved-UID file listing/read/write, traversal/executable rejection, API
snapshot creation and atomic restore retaining the prior data. Same-process
restart acceptance was repeated before stop, and migration rollback preserved
old and newer data. All fixture processes and directories were removed.


### Xonotic immutable asset and identity acceptance (2026-10-16)

`xonotic-unix-v1` adds the fifteenth explicit offline identity profile. The pinned
0.8.6 dedicated executable is root-promoted and sealed. Seven existing asset
archives (1,185,158,790 bytes) are independently hashed and atomically published
into a versioned root-owned read-only directory. The operator-only publisher
requires disk headroom, refuses an existing destination, bounds counts/sizes,
rejects changed or linked sources and leaves the shared installation untouched.
This is an existing-data baseline, not a new upstream provenance claim.

Startup validates root ownership, immutable permissions, exact file inventory
and hashes, then retains a no-follow directory descriptor for the read-only
namespace bind. Data stays on disk rather than being copied into RAM per server.
Private writes and generated configuration remain under the reserved server UID.
Root and agent independently validate name/map/mode/slots/bots/limits/RCON fields;
arbitrary console input, paths and commands are rejected. DarkPlaces requires
explicit `-xonotic` selection when the sealed executable has a neutral name:
https://github.com/DarkPlacesEngine/darkplaces/blob/master/com_game.c
The isolated profile stays unlisted (`sv_public 0`); normal launches are unchanged.

The VPS fixture passed native query (zero humans/four slots/zero bots), unchanged
gate and game PID through agent restart, metrics, scoped stop and migration
rollback preserving older/newer data. All fixture processes/data were removed.
Protected file and snapshot routing includes this identity; Linux restore tests
verify UID and activation inode preservation. Executable content and UID-aware
live control acceptance remain separate. Isolated updates require operator
review/promotion of the root executable and asset pins, never a silent auto-bless.

Validation: 116 Linux helper tests passed, including immutable directory access,
changed/link/writable/unlisted rejection and atomic publication bounds.

The agent suite passed 341 tests with 49 platform skips. One initial parallel Windows run hit a transient Barotrauma fixture rename EPERM; its focused rerun and the complete sequential suite passed.


### ET Legacy and OpenMoHAA isolated acceptance (2026-10-16)

Two additional explicit offline identity profiles are implemented: canonical
`wolfenstein-enemy-territory-unix-v1` and
`medal-of-honor-allied-assault-unix-v1` (installation family `openmohaa`).
Both use a root-promoted sealed executable and a separately pinned, immutable
root asset directory. ET's five files include the 2.85.0 Legacy game module and
base packs; OpenMoHAA's eight files include its matching game.so and base packs.
These are hashes of the existing installation baseline, not a fresh publisher
provenance claim. Shared logs, account files and unrelated installation files
are not exposed. Nested asset reads retain no-follow directory descriptors and
reject linked, writable, changed or unlisted entries. The publication helper
copies bounded files atomically with disk headroom and refuses overwriting an
existing version. No new generic privileged filesystem endpoint was added.

ET independently validates native name/slots/RCON and runs the stock oasis map.
Its isolated profile disables Omni-bot and public registration until separate
library/script/listing acceptance. OpenMoHAA independently validates stock deathmatch
maps, slots and native bot-fill numbers. The latter's fixture used zero bots;
occupied/bot behavior is not newly claimed from an idle query.
Both retain their real legacy saved-data namespaces: ET uses the final sixteen
ID characters; OpenMoHAA uses pb- plus the final eight. Migration, runtime
verification, rollback and backup tests now use those exact contracts.

Both VPS fixtures passed native query (zero humans/four slots/zero bots), same
gate/game PID after agent restart, metrics, scoped stop and rollback preserving
old and newer data. All fixture processes/data were removed. Protected files and
snapshots cover both profiles; separate Linux restore tests verify the suffix
contracts and UID/inode preservation. Neither was automatically customer-enrolled.
Executable plugin/Workshop installation and broader isolation remain unfinished.

Validation: 121 Linux helper tests passed, including nested asset link denial.

The complete agent suite passed 341 tests with 49 platform skips. Guarded deployment preserved all eleven live managed process identities; service and 15-minute scheduler stayed active. Production customer enrollment and catalog/database writes remain zero.


### Explicit Zandronum identity and Linux release checks (2026-10-16)

`freedoom-unix-v1` is accepted only with the explicit `zandronum` edition.
It uses the reviewed existing dedicated engine, matching zandronum.pk3 and
Freedoom2 IWAD, copied into sealed descriptors. Base Freedoom and other Doom
ports are rejected rather than silently changed to Zandronum. Root and agent
independently validate stock MAP01–MAP32, mode, skill, slots and match limits.
Registration/broadcast stay disabled for the isolated profile. Private config
and save directories are reserved-UID owned. There is no automatic import from
a formerly shared game-install directory; enrollment remains explicit/offline.

Zandronum resolves its home using getpwuid, so HOME alone was insufficient.
The supervisor supplies a sealed read-only passwd record containing exactly its
reserved UID/GID and /server home; no host account database is mounted. IDs
outside the reserved range, mismatched groups and noninteger inputs fail closed.
The actual fixture passed native query (zero players/four slots; bots unknown),
unchanged gate/game PID after agent restart, metrics, scoped stop and rollback
preserving old/new data. All fixture processes and data were removed. Protected
file/snapshot routing includes the eighteenth accepted identity profile.

The Linux full-agent run exposed a real AssaultCube verifier cache race: a
same-size rewrite can share metadata timestamps. Its small native binaries are
now rehashed on every verification, with a regression that freezes metadata
while changing bytes. The Freeciv isolation test now points game discovery at
its own scratch installation rather than depending on whether this VPS has
Freeciv installed. The Linux acceptance copy includes the scheduler source
needed by its cap/bot contract tests; it runs without production credentials.

Final validation: 390 agent tests passed on the VPS, one platform-specific skip;
124 Linux helper tests passed. The earlier Windows suite had an unrelated
transient Factorio rename EPERM; that focused suite passed on rerun. No production
catalog/database writes or automatic customer enrollment were performed.


Freeciv preparation (not accepted/enrolled): published a fixed root-owned library
and ruleset tree with 709 pinned files (7,685,002 bytes). The nested verifier
rejects unlisted descendants at every depth, traversal, links and writable data.
The publisher admits only lib/ and share/freeciv/ paths, at most 1,024 files;
existing three asset families retain their sixteen-file limit. No shared saves,
manual customer data, or installation executables enter that data tree.
Runtime identity integration and staging lifecycle acceptance are still pending;
this publication alone does not enable isolation or executable content.
All 126 Linux helper tests passed after the nested-tree checks were added.

Latest guarded agent deployment preserved all ten processes present in its
pre-deployment snapshot. Service and 15-minute scheduler remained active.


### Freeciv reserved-UID runtime acceptance (2026-10-16)

`freeciv-unix-v1` uses a root-promoted copy of the existing paired dedicated
engine and a fixed immutable tree of 709 reviewed libraries/ruleset files.
The startup contract independently validates the gameplay port and integer
player limit; no caller-supplied script or arbitrary command is accepted.
Root generates the maxplayers script, fixes the library/data paths inside the
namespace, and keeps saves in reserved-UID-owned private data. The agent recipe
skips writes to the sealed legacy directory after explicit offline enrollment.

The isolated VPS fixture passed concurrent/idempotent create, native query
(zero players/four slots; bots unknown), same gate/game PID after staging-agent
restart, per-process metrics, scoped stop, and data rollback preserving both
old and newer files. All fixture processes and data were removed. Protected
file and snapshot routing includes Freeciv; a separate Linux restore regression
checks ownership/data preservation. All 128 Linux helper tests passed.
This is the nineteenth accepted opt-in identity; no automatic customer enrollment,
catalog writes or executable ruleset/plugin installation was enabled.

Freeciv release validation: complete VPS agent suite passed 390 tests with one
platform skip. Guarded deployment preserved all eleven managed processes in its
snapshot; production agent and 15-minute scheduler remained active. No customer
identity was automatically enrolled and no catalog/database data was changed.


### Warzone 2100 reserved-UID runtime acceptance (2026-10-16)

`warzone-2100-unix-v1` uses the existing paired headless engine and 64 pinned
asset files (402,841,998 bytes), published root-owned/read-only. Autohost inputs
are independently validated in agent and root supervisor: stock-map identifiers,
name, two-to-eight player ceiling, tech, bases, power, alliances, scavengers and
spectator slots. Root generates the fixed autohost JSON and controls data/config
paths; callers cannot supply scripts, binaries or alternate startup paths.

The staging fixture passed concurrent/idempotent create, the existing local
connection-based occupancy adapter (zero/four slots; bots unknown), unchanged
gate/game PID after agent restart, process metrics, scoped stop, and rollback
preserving old/new data. Connection counts are not claimed as a native game-level
human/bot protocol. All fixture processes and data were removed. Protected files
and reserved-UID snapshots include this twentieth accepted opt-in identity.
Executable mod installation and automatic customer enrollment remain disabled.

Warzone release validation: 390 complete agent tests passed on the VPS (one
platform skip), plus 131 Linux helper tests. Guarded deployment preserved all
ten live managed processes in its snapshot. Service and 15-minute timer stayed
active; catalog/database writes and automatic customer enrollment remain zero.
Whole-data snapshots cover saved games; the browser file manager retains its
existing extension filter, so not every engine-native save extension is exposed
for individual upload/edit. This is not a claim of full content-management parity.


### Hypersomnia reserved-UID runtime acceptance (2026-10-16)

`hypersomnia-unix-v1` uses the pinned existing headless AppImage promoted to a
fixed root-owned path and copied into a sealed executable descriptor. Extraction
runs only inside the fenced namespace, with a 256 MiB tmpfs ceiling (other
profiles retain 64 MiB) and the existing cgroup memory/CPU/task limits. Typed
name/slot settings generate a fixed read-only conf.d document. Self-update on
launch, daily self-update and bulk external-map synchronization remain disabled;
installation updates keep their existing agent-owned lifecycle.

The fixture passed concurrent/idempotent create, reserved UID, gameplay-port
readiness, unchanged gate/game PID after agent restart, process metrics, scoped
stop and data rollback preserving old/new data. All fixture data/processes were
removed. Local occupancy is unknown (null), not zero; native player-query,
public listing and client Join are not newly claimed. This is the twenty-first
opt-in isolation identity, not automatic rotation/profile or customer enrollment.
Protected files and UID-aware snapshots include its private app-data directory.
Executable content installation remains disabled.


Hypersomnia release checks: the first full agent suite found its staging copy of
the backup allowlist regression was stale and omitted the supported private app
data. Refreshing that test from the repository retained the route/module parity
check without changing its assertions. The earlier
133 Linux root-helper tests passed, including Hypersomnia configuration validation
and reserved-UID snapshot restore.

Next isolation candidate audit: BombSquad's existing run-server wrapper executes
its reviewed paired controller with the custom /opt/playbound-host/python314
runtime and writes state under the shared game installation. Acceptance requires
root-reviewed copies of both runtime dependencies and game assets plus private
per-server state. Merely changing the controller UID is insufficient. No BombSquad
identity or executable content support is enabled by this audit.

Final Hypersomnia release: 390 VPS agent tests passed with one platform skip.
Guarded deployment preserved all eleven live managed process identities; agent
and 15-minute scheduler are active. No catalog/database writes or automatic
customer enrollment occurred. Local occupancy remains unknown. BombSquad's
runtime audit counted 605 paired game files and 3,521 Python runtime files; its
boundary remains pending, rather than expanding immutable-tree limits blindly.


### BombSquad dependency preparation and blocked runtime gate (2026-10-16)

Prepared two fixed root-owned immutable trees: 605 paired game files
(22,068,381 bytes) and 1,195 Python dependency files (159,776,994 bytes).
The game binary actually links libpython3.14.so.1.0, so that reviewed library
is included; unrelated Python documentation/terminfo aliases are excluded.
A separate sealed-interpreter candidate is pinned to 78,233,712 bytes.
Group-writable installed inputs are copied into private root staging and
hash-verified before read-only publication; source permissions/data are unchanged.
Only the reviewed game binary receives executable mode in the game asset tree.
Normalization rejects traversal, links, oversized inputs and changed bytes.
Existing families retain their original file-count and empty-file restrictions.

The reserved-UID candidate bound the gameplay port but never passed the native
player query. Its fresh runtime failed required construct-mode asset bring-up
with "No transport session within 5s" and later exited with code 10. An explicit
system CA-bundle path did not fix it. This is observed inside the fenced runtime;
it does not establish whether the cause is upstream or a missing runtime
requirement. No firewall, syscall or TLS verification protection was weakened.

The failed test was stopped, scoped processes removed, and rollback preserved
old/new fixture data before cleanup. The deployed twenty-one-profile helper
contracts were restored; no BombSquad identity is enabled or accepted. Production
agent/scheduler remain active, without a production-agent restart or database
writes for this attempt. Immutable dependency preparation is retained for the
next fix. Baseline plus publication/normalization Linux tests: 136 passed.
BombSquad remains one of the 31 pending installation families; executable
Plugin/Workshop support remains unfinished.


### Terraria reserved-UID world lifecycle acceptance (2026-10-16)

`terraria-unix-v1` uses the reviewed 1.4.5.8 native loader, matching assembly and
libraries in a fixed root-owned immutable directory (31 files, 58,528,521 bytes).
The directory descriptor is retained and every file hash/owner/mode is verified
before namespace binding. This profile has no fallback to the shared install;
the native loader runs from the mandatory immutable mount. Only the loader is
executable. Agent/root independently validate fixed world path, name, slots,
medium-world creation and gameplay port. Legacy data remains in the existing
terraria-servers/pb-fullID namespace; private preparation skips sealed old paths.

First-world generation exceeded the old three-minute readiness allowance under
a 0.75-core fence. Isolated Terraria now has a bounded ten-minute VPS startup deadline;
ordinary party rooms retain their three-minute deadline. This changes no
serverless download/provision path. The staging fixture's declared
allocation was increased to two cores for the retry (no manual cgroup mutation).
Existing-world reload completed normally without regenerating the world.

The fixture passed idempotent create, private world generation, connection-based
occupancy (zero/four slots; bots unknown), same gate/game PID after staging-agent
restart, process metrics, and scoped stop. Terraria's stop first sends SIGINT
through a pidfd after validating the bound process identity, UID and cgroup; it
waits at most eight seconds before the existing scoped-kill fallback. The world
file was rewritten during stop and successfully loaded by a fresh isolated runtime.
The stop helper has a twelve-second client deadline; other operations retain four.
PID-reuse/foreign-UID safeguards have a regression test. This is not a general
signal or console endpoint.

Running snapshots were refused. Stopped snapshot creation/atomic restore passed,
kept the pre-restore copy and retained the world UID. Final data rollback preserved
old/new markers; all fixture processes/data were removed. The twenty-second
isolation identity remains opt-in/offline; no customer was automatically enrolled,
and no catalog/database writes or executable mod support were enabled. Connection
counts are not claimed as native game-level human/bot protocol verification.


Terraria release validation before the deployment pause: 391 agent tests passed
with one platform skip, 140 Linux helper tests passed, and seven platform query
tests passed. The completed deployment preserved all eleven live managed process
identities. Subsequent work remains local; no further deployments or per-game
commits are authorized for the remaining combined batch.

### Combined-batch identity contract guard (2026-10-16)

The agent's resource admission, migration response validation, runtime handoff,
recovery/stop and admin readiness now share one explicit accepted-profile registry.
Installation aliases resolve through installationKey, including 0ad/openmohaa.
Privileged Python helpers retain independent fixed allowlists; the agent registry
cannot grant root support. A cross-boundary regression checks every accepted
profile's port range and private migration namespace against the root runtime,
plus root allocation support and installer inclusion. Unknown or merely installed
games remain rejected. This prevents partial per-game registrations from silently
diverging; it does not mark the thirty pending families accepted.


### Factorio immutable bundle preparation (local batch, 2026-10-16)

Read-only inspection pinned the installed 244,051,696-byte native server and
3,579 data files (47,093,503 bytes). No saves, customer mods, credentials or
private server configuration were inspected or copied. The operator-only
publisher now supports a fixed Factorio bundle with a 4,096-file/1-MiB inventory
limit; other families retain their earlier limits. Only bin/x64/factorio is
executable. Manifest metadata is always read-only, fixing its previous dependence
on the final asset's executable mode. Source/hash/link/ownership checks and
atomic publication remain in force. The local Linux fixture covers publication,
reader validation, changed engine bytes and excluded saves/mods paths.

This prepares dependencies only: Factorio is NOT enrolled or accepted. Its
remaining runtime work must create the first world inside the same UID/cgroup/
network fence, then load it with private settings, support bounded cancellation,
and verify recovery/stop/backup. No bundle was published on the VPS and no
service, database, scheduler or running process was changed by this batch.


Factorio lifecycle preparation now includes a deliberately disconnected
in-namespace candidate. It validates name/slots/allocated port, uses fixed
immutable engine/private save paths, skips creation for an existing valid world,
and refuses unidentified partial output. Creation has a ten-minute bound and
owner-liveness checks before spawn, during creation and before publication.
Failure/cancellation kills and reaps the creation process. Exclusive publication
cannot replace a concurrently created save. Six lifecycle regressions plus the
twelve asset regressions pass locally under Linux. Root namespace integration,
actual game acceptance and runtime registration are still outstanding; this
candidate cannot be invoked as a host provisioning command or enable hosting.


### Factorio root integration candidate (local batch)

The candidate now connects to the fixed root launch contract, offline migration,
resource placement, protected file/snapshot routing and immutable engine mount.
World generation runs as the reserved UID inside the same namespace/cgroup and
network fence as the eventual server, followed by exec of the paired immutable
engine. Legacy preparation is skipped only for this explicit identity; ordinary
Factorio rooms retain their original behavior. Startup has a scoped eleven-minute
bound, and graceful stop retains the existing PID/UID/cgroup checks. Typed settings
reject paths/commands and mismatched allocated ports. The helper is installed by
the existing root tooling installer; no new sudo primitive was added.

Admin readiness explicitly reports this candidate blocked, not accepted. No
customer enrollment or production deployment occurred. Actual engine startup,
recovery, player query and stopped restore acceptance remain outstanding.
The installer also fixes an existing malformed quoted asset list that combined
multiple filenames into a single nonexistent path. Local full agent suite:
345 passed / 49 platform skips before the final registry routing cleanup.
Local Linux customer helper suite: 170 passed / two skips (172 total).


### OpenRA-family shared-state and controls audit (local batch)

Direct OpenHV and OpenE2140 customer recipes now set per-server HOME and all
XDG cache/config/data/state roots, matching the existing OpenRA recipe that
handles official, Combined Arms, Romanov's Vengeance, Tiberian Dawn HD and
Crystallized Nexus editions. Different server IDs cannot share these writable
homes; non-customer behavior is unchanged. OpenHV now applies its already-declared
EnableSingleplayer and LockBots settings rather than silently ignoring them.
These changes do not constitute root UID/network isolation acceptance. The seven
OpenRA-family installation boundaries remain pending; no customer profiles or
executable content were enabled and no deployment occurred.


### Continuing shared-state audit and Unvanquished dependencies (local batch)

TripleA customer maps and Java user.home now use each server's private home,
while non-customer paths retain their prior locations. Veloren customer userdata
and its CLI/server configuration paths now use the same per-server root; shared
community world paths stay unchanged. Tests cover two distinct IDs and actual
configuration writes. These are data-separation fixes, not UID isolation claims.
Veloren retains its existing single-port limitation.

Unvanquished dependency preparation pins 37 files / 531,428,926 bytes, including
daemonded, nacl_loader, nacl_helper_bootstrap, the matching IRT and DPK packages.
The fixed operator-only publication path admits only these engine/helper names
and package extensions; only the three native helpers receive executable mode.
Configuration, plugin binaries, traversal and unrelated directories are rejected.
The family has its own 128-file bound; earlier family limits remain unchanged.
Thirteen asset regressions pass locally on Linux. No live publication or profile
enrollment occurred. NaCl behavior inside the UID/network/syscall fence must
still be implemented and checked before declaring Unvanquished accepted.


Unvanquished now also has a local blocked root identity candidate. Both agent and
root validate the exact engine, private home, port, name, slots, bot fill and map;
root launch ignores shared writable package locations and binds only the pinned
immutable package/helper tree. Offline migration and protected snapshot/file
routing use its existing full-ID namespace. Legacy preparation is skipped only
for the explicit identity. Native NaCl startup/query/recovery acceptance remains
outstanding, and readiness is blocked accordingly. No seccomp/network changes,
production installs, service restarts or customer enrollment were performed.
The focused Linux runtime/asset/backup checks passed: 79 passes and one skip.


### Seven OpenRA-family immutable dependency candidates (local batch)

Read-only VPS inventory pinned official OpenRA's 2,591 files (141,286,620 bytes)
and the separate single-image installations for OpenHV, Combined Arms,
OpenE2140, Romanov's Vengeance, Tiberian Dawn HD and Crystallized Nexus.
The fixed operator-only publisher has a distinct immutable destination and
engine name for each family; standalone families admit exactly one pinned image.
Official OpenRA has a bounded 4,096-file / 1-MiB inventory policy. Only the named
server engine is executable. Operator publication refuses existing destinations,
changed pins, unsafe links/paths, low disk space and mismatched family identities.
No caller can select an arbitrary source, destination or download URL.

These are dependency candidates only. The official self-contained .NET engine
and the six AppImage extraction paths still need root launch integration and
actual runtime acceptance. No publication, deployment, migration or enrollment
has taken place. Existing isolation readiness remains pending for these families.


### Seven OpenRA-family root launch candidates (local batch)

The three canonical recipe identities now have typed root launch contracts for
all seven installation families. Official OpenRA permits only ra/cnc/d2k;
standalone images require their own fixed binary and mod pairing. Root selects
the matching pinned immutable directory rather than using a shared or caller-
selected installation. Native .NET diagnostics are disabled; AppImage extraction
has a bounded 1-GiB private tmpfs, still subject to the declared memory cgroup.
Private support files use Engine.SupportDir=/server (the upstream dedicated
launcher flag: https://github.com/OpenRA/OpenRA/blob/bleed/launch-dedicated.sh).
Actual extraction/startup, process recovery, query and protected restore are not
yet accepted. All seven readiness rows explicitly remain blocked. No network,
syscall or customer isolation protection was relaxed to make a game start.

Offline migration, resource admission and protected file/snapshot routing share
the canonical per-server data namespaces. The existing root installer carries
the fixed contract helper, without any new sudo primitive. No live publication,
deployment, database write or enrollment occurred. Remaining unimplemented
families: 21; accepted families remain 22, with nine local runtime candidates
(Factorio, Unvanquished and these seven) awaiting acceptance.


### RimWorld Together and SS14 root candidates (local batch)

RimWorld's installed single-file engine matches a reviewed build. Its candidate
now retains the declared server, backup, chat, mod-matching, storyteller and full
difficulty settings through a typed root contract. Difficulty schema equality is
regression-tested. The namespace bootstrap merges private configuration without
overwriting unrelated difficulty values, rejects symlinks/hardlinks and keeps a
private console FIFO. .NET extraction is bounded within private tmpfs. Player
telemetry and console operations under the reserved UID still need acceptance;
the profile remains blocked.

Engine-specific launch selection now prioritizes isolation over special console
or network launchers for every engine. Tests exercise the actual launch-policy
function, including missing identity rejection and ordinary party transports.
No new sudo command or generic privileged file/console API was introduced.

SS14's public runtime inventory pins 3,786 files / 148,553,176 bytes, excluding
private data and server_config.toml. Only three known upstream empty placeholder
files are admitted as zero-length assets; only Robust.Server is executable.
The root candidate uses private data/config/log paths, allocated TCP status and
UDP game ports, fixed .NET runtime settings and disabled hub advertisement.
Its native soft-player-limit setting is not claimed as a hard admission ceiling.
Status/query, restart and restore acceptance remain required; readiness is blocked.

Immutable directory verification now indexes child names once, retaining exact
unlisted-descendant rejection while avoiding repeated inventory scans for larger
bundles. Local Linux customer-helper tests: 187 passed, two skips (189 total).
TripleA/Veloren customer working directories are also private; Veloren's existing
query now resolves the same per-server settings path instead of the shared one.
No deployment, database write, publication or customer enrollment occurred.
Remaining unimplemented families: 19; accepted families remain 22, with eleven
local installation-family candidates awaiting acceptance.


### TripleA and Necesse paired-Java candidates (local batch)

TripleA pins its reviewed server JAR together with 57 files from the required
Java 25 runtime (58 files / 235,057,181 bytes total). The immutable publisher's
fixed paths exclude downloaded maps, saves and other Java versions. Runtime
launch uses only that paired Java/JAR, with private Java home and downloadedMaps,
allocated BOT_PORT, bounded heap/metaspace/code/class space, disabled attach and
shared performance memory, and the existing public lobby endpoint. Offline
migration, resource scope and protected snapshot/file routing are wired. Actual
maps/startup/query, adoption and restore acceptance remain pending; readiness is
blocked, rather than treating the runtime pin as acceptance.

Necesse separately pins 119 files / 244,839,284 bytes from its installed server,
bundled Java, libraries, locale and Steam native dependencies. The root candidate
accepts only a bounded slot count and allocated game port, runs the paired JAR
with a private world/data directory and bounded JVM configuration, and retains
its existing stopped-world backup namespace. Shared preparation is skipped only
for the explicit identity. No arbitrary JVM flag, binary, mod path or customer
save enters the immutable bundle. Native startup/Steam query, shutdown, recovery
and restore acceptance remain pending, and readiness is blocked accordingly.

No production publication, service deployment, database writes or customer
enrollment occurred. The root bind/syscall/network policies were not relaxed.
Remaining unimplemented installation families: 17; accepted families remain 22,
with thirteen local candidates awaiting acceptance.


### Fixed auxiliary-port prerequisites for nine remaining families (local batch)

The root BPF bind builder now has named, fixed future layouts for Veloren,
Barotrauma, Core Keeper, Unturned, Don't Starve Together, Counter-Strike Source,
Team Fortress 2, Open Fortress and GoldenEye Source. Each layout validates its
own allocation range/stride and permits only the declared offset/protocol pairs;
no HTTP request can provide a port list or BPF program. Existing STK, FlightGear,
AssaultCube and single-port policies retain their current behavior. Neither the
new layouts nor new runtime families have been activated on the VPS.

Regression coverage interprets every generated branch for both protocols at
first/last allocations, including port zero, neighbors, wrong protocols, invalid
strides, mixed legacy flags and unknown profile types. Seven bind-policy tests
pass locally. These are networking prerequisites, not game startup acceptance;
all seventeen remaining unimplemented families retain their pending status.


### Veloren native world candidate (local batch)

Read-only inventory pins the complete paired native/assets runtime: 10,655 files,
519,129,508 bytes. The installed runtime also passed the existing paired-package
verifier for weekly-linux-x86_64-2026-10-14T20_51.zip. Its family-specific immutable
inventory limit is 16,384 files / 4-MiB metadata; earlier limits remain unchanged.
Only veloren-server-cli is executable. Empty upstream translation placeholders
are admitted only below assets/voxygen/i18n and only with .ftl extension. Private
userdata, saves and configuration cannot enter the public engine bundle.

The root candidate uses private userdata, pinned assets, fixed gameplay TCP 14004
and localhost metrics TCP 14005. It disables the native extra query listener and
web chat secrets. Upstream current Settings use gameserver_protocols/query_address;
CLI settings use web_address, rather than the older documentation's metrics field:
https://raw.githubusercontent.com/veloren/veloren/master/server/src/settings/mod.rs
https://raw.githubusercontent.com/veloren/veloren/master/server-cli/src/settings.rs
Native settings have serde defaults; startup acceptance against the pinned build
is still required before enrolling a customer.

The bounded RON patcher modifies only declared top-level fields, retaining existing
seed, world, nested gameplay fields and comments. It rejects duplicate/malformed
fields and unreviewed raw strings without overwriting the original. Tests cover
nested values, escaped delimiters, comments, repeated updates and linked configs.
SIGTERM follows pidfd/UID/cgroup identity checks and the bounded scoped-kill fallback;
Terraria/Factorio retain their existing SIGINT behavior. Migration, resource limits
and protected snapshot/file paths are wired; no new sudo primitive was added.

The candidate remains explicitly blocked pending actual cold-world creation,
metrics/player checks, saved-world reload, agent adoption, graceful save and restore.
No service deployment, live publication, database writes or customer enrollment
occurred. Latest local suites: 359 agent tests passed / 49 platform skips;
201 Linux helper tests passed / two skips. Remaining unimplemented families: 16;
accepted families remain 22, with fourteen local candidates awaiting acceptance.


### Barotrauma preparation — not runtime acceptance

Prepared a fixed private XML configuration contract and a read-only public package
inventory: 1,049 files / 267,411,090 bytes. Inventory was collected read-only from
/opt/playbound-host/games/barotrauma, with per-file hashes and change detection.
The publisher excludes private configuration, permissions, worlds, LocalMods and
the unused createdump executable. Only DedicatedServer receives executable mode.
The existing 2-GiB publication ceiling remains unchanged.

The settings helper preserves campaign attributes and child elements, validates
the even gameplay port and adjacent query port, caps players at 16, disables UPnP
and public advertising, and atomically writes private owner-only XML. Linked,
malformed, entity-bearing, oversized and publicly readable configurations fail
without overwriting the original. Local helper suite: 206 passed / two skipped.

This preparation does not enable isolation. Namespace Content/native Steam
mounts, private Data overlays, root dispatch, migration/backup/control wiring and
runtime acceptance remain unfinished. Counts remain 16 unimplemented families,
14 local candidates and 22 accepted families. No deployment, enrollment, service
restart, DB write or commit occurred.


### Combined remaining-family implementation batch (deployments paused)

Seven more families now have local UID/namespace candidates: Barotrauma, Don't
Starve Together, Morrowind/TES3MP, native 64-bit TF2, CS2, Trackmania and Unturned.
This supersedes the preceding Barotrauma-preparation-only status. Accepted
families remain 22; local candidates awaiting runtime acceptance are now 21;
nine families still lack an implemented customer identity boundary.

Each candidate has an explicit agent identity contract, independently fixed root
allowlists, resource/migration policy, retained immutable package pins and scoped
snapshot/file support. Ordinary party paths remain separate. No automatic
customer enrollment or executable plugin/Workshop capability is enabled.

Barotrauma uses private XML/Data and retained Content/Steam bindings. DST uses a
private cluster/token and allocated three-port fence; existing gameplay options
survive settings changes. Morrowind copies only reviewed scripts/default content,
never shared character/world saves, and installs the reviewed admin hook. Its
private player/world/admin files survive repeated preparation. UID-aware live
admin/player transport still needs runtime acceptance.

TF2 selects srcds_linux64 explicitly; CS2 selects the native linuxsteamrt64 binary.
Both use private configuration/log overlays, fixed typed map/player/bot settings,
and keep RCON credentials out of engine argv. Public package inventories exclude
cfg/logs/addons/custom/downloads/workshop; customer config is never pinned as
public content. Full shipped default-config requirements and engine path behavior
must be validated before enrollment. Cold launch verifies every retained hash;
scoped 15-minute readiness budgets account for these large depots.

Public Source inventories: TF2 approximately 14.96 GB; CS2 approximately 73.39 GB.
Publication has per-family 20/80-GiB ceilings and keeps the greater of 8 GiB or
25% of package size free after a copy. Other games retain their existing ceilings.
These copies were NOT made. Joint Source publication requires more storage than
should be consumed blindly on the current VPS; staging/storage strategy remains
an operational prerequisite. No integrity bypass or writable shared mount exists.

Trackmania pins the matching native executable and Packs (five files,
369,363,688 bytes). Its account and generated RPC credentials remain private;
existing playlists/maps are retained, UPnP/P2P and remote XMLRPC are disabled.
Existing server-specific match settings are required rather than downloading
maps implicitly. XMLRPC/native query/recovery and engine data paths remain gates.

Unturned pins 10,328 public package files, 1,896,662,197 bytes. Its private server
data is bound only inside the namespace at both possible engine/cwd Servers
locations; no symlink is written to the shared installation. GSLT is read only
from owner-only private data and never passed in argv or returned in output.
Native Unity data-path, player query, shutdown/save and restore checks remain gates.

The remaining nine are GoldenEye: Source, Deus Ex, Open Fortress, Counter-Strike:
Source, Core Keeper, ANEURISM IV, Battlefield 1942, RVGL and BombSquad. Installed
Open Fortress/CSS/BF1942 are 32-bit; GoldenEye/Deus Ex use Wine, Core Keeper/RVGL
use Xvfb, ANEURISM has a separate network supervisor, and BombSquad's previous
isolated startup failed transport initialization. These need dedicated boundaries;
the x86_64/AF_UNIX syscall restrictions have not been relaxed to hide failures.

No deployments, live file publication, service restarts, database writes,
customer enrollment or commits were performed in this batch.


### BombSquad candidate and batch boundary checks

BombSquad now also has a local fixed identity candidate, bringing the batch to
eight of the original sixteen implemented locally: 22 accepted families,
22 local candidates awaiting runtime acceptance and eight still unimplemented.
Its root handoff retains separate reviewed game and Python-library descriptors,
seals the matching Python 3.14 executable, disables bytecode/public listing and
uses a fixed controller invocation with no caller exec/Python options. The prior
transport initialization failure remains an explicit blocker; this implementation
is not evidence that it has been fixed or that a runtime is healthy.

The eight unimplemented boundary reasons are now explicit in hosting readiness:
GoldenEye, Deus Ex, Open Fortress, Counter-Strike: Source, Core Keeper, ANEURISM,
Battlefield 1942 and RVGL. None is accidentally granted an identity profile or
executable content capability. The prepared TF2 bind policy was corrected from
27030..27049 to the actual recipe's 27015..27025 allocation.

World file management now refuses generated engine credential files whose names
do not contain token/password: Commands.dat, dedicated-account.json,
dedicated_cfg.txt, cluster.ini, serversettings.xml, server.cfg, playbound.cfg,
managed Source configs and ServerConfig.json. These are neither listed nor
read/download/write targets. Typed server controls remain the settings path.
Trackmania UserData and Unturned private save roots are now covered by the normal
world-backup capability declarations; isolated snapshots continue through the
stopped, UID-scoped helper and never return raw snapshot contents.

The snapshot-runner test previously swallowed its own mock assertion for a newly
implemented profile and could pass without proving rejection. It now exercises
every implemented identity with a successful typed mock and uses a truly unknown
profile for rejection. A new test installs the real seccomp BPF in a child process
and verifies kernel enforcement without requiring bubblewrap: privileged calls,
host Unix sockets and reconnectable datagram/seqpacket pairs are denied while
connected stream IPC remains usable. No syscall restriction was loosened.


### Counter-Strike: Source local i386 candidate

The compatibility boundary now has an explicit internal i386 mode. Existing
native profiles keep their original x86_64-only filter. The i386 mode denies
socketcall and ipc multiplexers outright, retains direct-socket AF_UNIX checks,
and denies privileged syscalls under both ABIs. A hand-built static i386 ELF was
executed under the real kernel filter: direct AF_INET UDP works; AF_UNIX,
socketcall, ipc, mount, ptrace and unshare are denied. No compiler, external
binary or compatibility-library download was needed for that fixture.

CSS alone selects this mode from the fixed root game profile; no HTTP request or
settings field controls it. Its native srcds_linux, public depots and Steam files
are pinned (1,108 files / 2,395,259,947 bytes), with private cfg/log overlays and a
4-GiB family publication ceiling. Script wrappers are excluded from isolated
binary selection. Typed settings retain map, slots, time limit, name and RCON;
clientport must equal the allocated gameplay port plus 1000. Root argv derives
that port again rather than accepting a caller-selected auxiliary listener.

This is still blocked pending real engine/libc networking, shipped configuration,
query/RCON, recovery and restore acceptance. An engine that needs the denied
socketcall ABI must fail rather than fall back or relax the policy. No runtime
was deployed or enrolled. Current counts: 22 accepted families, 23 local
candidates awaiting runtime acceptance, seven unimplemented boundaries.


### Open Fortress and Battlefield 1942 local candidates

Open Fortress has a fixed i386 SDK/mod candidate with a separate retained TF2
asset descriptor. The modern TF2 engine is never used to launch this mod. Its
27,062 pinned files total 8,089,280,428 bytes; only srcds_linux is executable.
The unused empty test.txt is excluded. The single empty map translation file is
allowed by exact path; legacy texture '~'/'{' names are allowed only under the
materials subtree. The family retains an 8-GiB publication bound and a separate
32,768-file / 8-MiB metadata bound. TF2 assets remain in the existing root-pinned
TF2 bundle; no second TF2 copy is introduced.

The namespace builds a private runtime tree with read-only SDK/content bindings,
reviewed _srv library aliases and the server_srv.so-to-server.so mapping. CFG,
map graphs, download/cache/log directories and gameinfo remain private. Shipped
reviewed defaults are copied once; repeated preparation preserves customer
changes. Generated map/player/time/bot/name/RCON settings are typed. RCON stays
out of argv. Gameinfo uses /tf2 rather than host installation paths; alternate
host references fail closed. UID-scoped operation and separate retained package
FDs are mandatory; there is no shared writable directory or symlink fallback.

Battlefield 1942 uses only the reviewed static i386 binary and pinned public game
content: 52 files / 95,148,143 bytes. Shared settings/admin files are excluded from
the bundle. It generates a private overlay for server/map configuration, preserves
other existing rules, fences the gameplay port, disables GameSpy/ASE/PunkBuster,
and validates cooperative mode and bot skill. Only the allocated port is allowed;
no extra legacy discovery/admin listener was added. Its legacy multiplexer policy
matches CSS/Open Fortress and still requires actual engine networking acceptance.

Both remain blocked until real startup, query/control, recovery and snapshot
acceptance. No service deployment, live publication, enrollment, DB write or
commit occurred. Local checks: 368 agent tests passed / 49 skips; 241 Linux helper
tests passed / two skips. Counts: 22 accepted, 25 local candidates awaiting runtime
acceptance, five unimplemented: GoldenEye, Deus Ex, Core Keeper, ANEURISM and RVGL.


### Private display/Unix IPC boundary preparation — not activated

Read-only VPS checks confirmed AppArmor enabled, parser/aa-exec installed and
kernel af_unix/change_profile/v8 feature support. No policy was loaded. The
render-only customer-display-policy.py produces a unique profile/display for each
reserved UID (40000..40255). Its candidate peer rule permits stream communication
only with the same runtime label; abstract display binding is restricted to the
allocated X1000..X1255 address. It grants no profile transition or broad Unix
network rule. Existing filesystem namespaces, resource limits, bind/egress rules
and seccomp restrictions remain mandatory, independent boundaries.

The design follows upstream AppArmor Unix-peer semantics:
https://apparmor.dev/man/apparmor.d/
Both endpoint UID policies compiled against the VPS parser with --skip-kernel-load,
--skip-cache and --Werror. This was stdin-only validation: no policy/cache file,
service or kernel configuration was changed. Compilation proves syntax only,
not cross-customer IPC isolation. Actual same-label/cross-label/host-peer socket
acceptance and a reviewed installation/handoff are still required.

customer-display.py is an unused candidate display helper. It refuses startup
unless current UID/label matches an enforced private IPC identity. It has a fixed
Xvfb executable/geometry, no TCP listener or -ac, a private 0600 Xauthority cookie,
authenticated X11 readiness with a bounded fragmented-header read, a ten-second
startup limit and bounded terminate/kill/reap cleanup. A held private session lock
prevents overlapping displays; a crashed session's regular private authority can
be replaced without following symlinks. Cleanup is idempotent and releases the
lock. Cookie contents are never passed in argv or returned in diagnostics.

Eight local contract/lifecycle tests cover UID/label guards, per-UID uniqueness,
wrong/complain/missing kernel policy, authority format/permissions/link rejection,
overlap/stale authority recovery, fixed subprocess options, authenticated readiness
and cleanup. Display process/socket lifecycle tests use mocks; no real confined
Xvfb acceptance is claimed. Neither helper is installed or called by game runtime
code, and no syscall filter was relaxed. The five unimplemented family count is
unchanged pending this additional boundary's actual acceptance and game wiring.


### Core Keeper and RVGL filesystem/display candidates — not activated

Core Keeper now has a pinned public inventory (1,140 files, 591,875,009 bytes),
a fixed operator-only publisher and retained-directory verification policy.
The candidate bootstrap preserves existing world ID, seed, world name and custom
rules, updating only the requested player cap. Configuration reads are bounded,
owner-only, regular, single-link and no-follow; invalid saved JSON is not replaced.
It requires the enforced private-display label before preparing files or spawning
an engine. Display failure/cancellation stops and reaps the game with bounded
cleanup. No display syscall policy has been relaxed or connected to a runtime.

RVGL has a separately pinned public inventory and operator-only publisher.
Private profiles, cache, replays, times and editor state are excluded. Its candidate
layout preserves the existing private profile, rejects linked/group-readable
private directories, binds reviewed public content read-only and permits only the
fixed lobby command with allocated UDP port 2310..2330. The upstream absolute
libunistring symlink is not followed: publication copies only the fixed pinned
lib/lib64/libunistring.so.2 target into a regular pinned lib/libunistring.so.2
alias. The entire library directory can therefore remain read-only. There is no
customer-controlled alias or source-path mapping. No player-cap, private-display
supervision or lobby-control parity is claimed for this RVGL layout preparation.

Tests cover Core Keeper world preservation and display lifecycle; RVGL private
state, port validation and public bindings; and publisher/verifier round trips,
private-file rejection and exact alias flattening. Both full public inventories
pass pre-publication validation without copying to the VPS. Linux helpers:
261 passed, two skipped (263 total). The agent suite initially hit a Windows
EPERM on an existing managed-jobs atomic rename; the affected six-test registry
suite passed immediately on focused rerun. No code was changed to conceal that
filesystem failure.

These helpers/publishers are not installed, registered or enrolled. There were
no deployments, service restarts, policy loads, database writes or commits.
Counts remain 22 accepted, 25 local candidates awaiting runtime acceptance and
five unimplemented runtime boundaries. Core Keeper/RVGL still need the actual
confined display/Unix-peer acceptance and root launch integration; GoldenEye,
Deus Ex and ANEURISM also retain their documented pending boundaries.


### Shared display lifetime and HX private configuration candidates

Core Keeper and RVGL now share the internal display/game lifetime state machine.
Cancellation during display startup cannot spawn an engine. During execution,
cancellation or display exit terminates/reaps the engine before releasing the
private display. Failed spawn/wait paths still clean the display and restore
original signal handlers. Trusted fixed bootstrap callbacks construct commands;
no command, environment, display number or executable is accepted from an API.
RVGL's candidate bootstrap now constructs the fixed private lobby environment,
refuses unsupported configuration fields and checks the enforced display label
before preparing private files. Its layout/launch is not registered or installed;
player caps and UID-aware lobby capture/input still need implementation/acceptance.

A separate unused customer-hx.py prepares Deus Ex HX private System, Save,
Wine-prefix, runtime and cache directories. It retains existing saves and custom
INI rules, enforces 2..8 slots and the existing three-port allocation, and disables
package downloads/uplink. Managed duplicate keys are removed across repeated
case-insensitive sections; authoritative values are inserted in the first matching
section. Private configuration reads reject links/hardlinks/exposed permissions,
are bounded, and replacement is atomic/fsynced. No caller INI path or executable
endpoint is exposed. This is configuration preparation, not a Wine runtime boundary;
public asset pinning, Wine/IPC launch supervision and scoped control remain pending.

Local Linux helper suite: 273 passed, two skipped (275 total). New checks cover
RVGL's fixed command/environment, cancellation before/during launch, failed spawn,
failed wait, handler restoration, HX save/custom-rule retention, repeat-safe INI
updates, typed slots/ports and unsafe-file rejection. No deployments, service
restarts, kernel policy changes, customer enrollments, database writes or commits
were performed for this batch. Accepted/candidate/pending runtime counts are
unchanged: 22 / 25 / 5. Actual confined display-peer and per-engine acceptance is
still required before enabling these candidates.


### GoldenEye/HX Wine contracts — candidate preparation only

customer-goldeneye.py now validates only declared name, slots, map, time limit
and private RCON settings, matching the current recipe's request range. It creates
private configuration, Python runtime/cache, map graphs, logs/downloads and Wine
prefix directories using the immutable Source filesystem contract. Generated
RCON configuration stays 0600 and its password never enters argv. Existing custom
rules and Python state survive preparation. Bots, arbitrary launch options,
control characters and unsafe private files are rejected. Its fixed Wine command
uses the private srcds.exe and existing strict port/no-restart flags. Actual
engine admission limits remain an acceptance gate; the typed range alone is not
proof that the game enforces every requested slot count.

HX now also exposes a fixed candidate HCC command and private Wine/XDG paths.
Neither Wine candidate selects its own display or accepts inherited host
configuration. These functions do not start Wine, initialize prefixes, register
an identity, install public assets or enable executable customer content. Full
public inventory/layout, private IPC/legacy ABI compatibility and scoped wineserver
lifecycle remain necessary before root launch integration.

Read-only code review of ANEURISM confirms its current network helper launches
under the service account with supplementary groups. That is not the required
per-customer UID/filesystem boundary and has not been reclassified or enabled.
Its root-owned namespace/token ownership logic must be preserved while adding
the migration-authorized account and filesystem/cgroup handoff. No credentials
were retrieved and no live helper was changed.

Linux helper suite after this batch: 278 passed, two skipped (280 total).
New checks cover GoldenEye argument/config injection, private credentials, fixed
Wine/XDG paths, retained customer rules/state, linked configuration/shared-prefix
rejection, and HX fixed argv. No deployment, restart, policy load, enrollment,
DB write or commit occurred. Runtime counts remain 22 accepted, 25 candidates,
five pending boundaries; these additional contracts do not establish live parity.


### ANEURISM public asset boundary — not activated

Read-only VPS inventory pinned 44 public engine files (880,816,429 bytes): the
native server, Unity/GameAssembly/Steam libraries, aniv_server_Data and linux64.
No credential, instance data, Steam download state, build metadata or Unity lock
file was read. customerAnivAssets.json records sizes/hashes. The fixed operator-only
publisher and retained-directory verifier now support this family without
accepting caller paths, symlinks or download URLs. Only aniv_server.x86_64 receives
execute permission; package data/libraries are read-only. Existing bounds suffice:
128 files, 768 MiB per file and 2 GiB aggregate. The actual full inventory passes
validation before publication; no duplicate VPS copy was made.

Tests cover publisher/verifier roundtrip, tamper/unlisted-entry checks, executable
permissions and rejection of gslt/owner files, instance saves/home, steamapps,
metadata, lock files and traversal paths. Linux suite: 279 passed, two skipped
(281 total). The publisher is not installed and the live ANEURISM helper remains
unchanged. Root migration-authorized UID/filesystem/cgroup launch integration,
namespace/token lock preservation, scoped cleanup, recovery and player-query
acceptance still remain; this public bundle is not evidence of tenant isolation.
Runtime counts remain 22 accepted, 25 candidates and five pending boundaries.
No deployment, restart, policy change, DB write, credential retrieval or commit.


### Resumed isolated VPS staging: private display/IPC acceptance

The user explicitly authorized resuming isolated staging deployments. Live agent
restart, customer enrollment and production rollout were not performed. A new
operator-only customer-display-acceptance.py uses fixed test UIDs 40254/40255 and
refuses assigned accounts, existing labels or processes under either UID. It
loads only those two policies, runs bounded fixture processes, and removes them
in finally. The root staging scripts remain in
/root/playbound-isolation-staging-20261016; they are not installed service helpers.

Actual VPS kernel checks passed: same-label abstract stream connection succeeds;
cross-label, unconfined-host-to-private and private-to-unconfined-host connections
are denied. Authenticated Xvfb startup inside bubblewrap under the reserved UID
and enforced label passed; an invalid cookie is rejected and close reaps the
display/removes authority. The fixture also confirms host private directories are
absent and /usr is read-only. Numeric IDs are unused staging UIDs, not accounts
or customer enrollments. No real game/Steam credentials were read or passed.

The real fixture exposed missing bubblewrap construction permissions, corrected
narrowly for root directory read, /newroot scratch construction, six-character
/bindfile temporary names, same-label proc-fd read/readby mediation and disabling
nested user namespaces. No general filesystem write or Unix peer rule was added;
ptrace trace/attach is not granted. All four peer-denial/positive checks were
rerun after policy adjustments and still passed. The staging filesystem fixture
uses directory mounts for /bin,/lib,/lib64; the production command's symlink
construction path is not yet accepted under this label.

Cleanup verification found zero remaining test profiles, zero test-UID processes
and zero staging-display workspaces. Local focused checks: 23 passed. ANEURISM's
credential reader also now rejects hardlinks/FIFOs/changing/non-ASCII files with
bounded nonblocking reads and content-free errors; ten tests passed. That code
has not been deployed to the live helper.

This accepts the display/IPC component only. It deliberately did not relax or
install the game seccomp filter, launch a customer game, or prove resource/query/
recovery behavior. Next integration must combine the accepted label with the
reviewed syscall boundary and root launch/cgroup path before engine acceptance.
Runtime family counts remain 22 accepted / 25 candidates / five pending.


### Combined private-display/syscall staging acceptance

customer-seccomp.py now has an opt-in private_display mode. It fails unless the
current process has a reserved customer UID and exactly its matching enforced
IPC label. It rejects combination with the unaccepted legacy i386 display ABI.
Only AF_UNIX stream creation is added; datagram/seqpacket socket creation/pairs,
privileged syscalls and nested namespace creation remain restricted. Existing
callers use the unchanged default and no production runtime selects this mode.
The exported BPF is sealed; no supplied filter bytes/rules/paths are accepted.

The VPS staging harness now constructs that filter after entering the private
label/UID, passes it to bubblewrap, and starts authenticated Xvfb with it applied.
Actual combined checks passed: Xvfb startup/invalid-cookie rejection/cleanup,
AF_UNIX datagram denial, unshare EPERM, host-private path absence and readonly
/usr. Same-label positive, cross-label negative and host/private negative tests
also pass. This does not claim peer denial was separately retested inside every
game; it combines the tested label with the stricter syscall boundary in the
fixture. Kernel checks and fixtures remain separate from family acceptance.

Local helpers: 281 passed, two skips (283 total), plus ten ANEURISM helper tests.
Additional cases reject nonboolean flags, nonreserved UIDs, unconfined/mismatched/
complain labels and legacy-display combinations; guarded BPF sealing is checked.
Cleanup verified zero test labels, test-UID processes or staging workspaces.
No live service restart, customer enrollment, game launch, DB write or commit.
Next: root launch/cgroup handoff and actual engine/query/recovery acceptance;
family counts remain 22 accepted, 25 candidates, five pending boundaries.


### Core Keeper and RVGL actual-engine staging acceptance

Actual Core Keeper staging now combines the reserved UID/enforced label,
private filesystem/display, guarded syscall filter, readonly pinned public bundle,
private world/identity storage and resource scope (CPUQuota=100%, MemoryMax=2G,
MemorySwapMax=0, TasksMax=128). The display fixture's 1 GiB virtual-address limit
was unsuitable for Unity: the engine fixture uses 16 GiB virtual address space
while retaining the 2 GiB cgroup memory ceiling. Observed startup memory reached
about 1.35 GB; this is a startup observation, not an occupied-load baseline or an
approved fleet envelope. No resource samples or hosting records were written to DB.

The real engine exposed two additional requirements. Private /dev/shm objects
need file-lock permission, and Steam needs AF_UNIX datagram socket pairs. A
staging-only distinct denial errno confirmed the blocked pair type without
permitting it. Actual same-label/cross-label/host-peer reconnection tests then
passed for datagram pairs. Only guarded private-display mode admits pairs after
UID/enforced-label validation; ordinary Unix datagram socket creation, seqpacket
pairs and privileged syscalls remain denied. Default game filters are unchanged.
The temporary diagnostic filter was replaced with the reviewed source.

Core Keeper now prepares its fixed private .steam/sdk64 binding, uses umask 077
and retains an open stdin pipe, matching the existing engine requirements. It
also needs GameInfo.txt and GameID.txt beside the engine. Public bundles contain
only fixed zero-byte readonly mountpoints; root staging binds private 0600 backing
files there. Publication never imports a shared installation's identity files,
and verification rejects a nonempty public mountpoint. Saved private identities
are retained; linked/exposed/oversized files are rejected. Public mountpoints
were verified still empty after actual execution.

The offline namespace proved port bind and clean stop, but Steam/DNS failed as
expected without a route. The fixed import-only staging egress helper then added
outbound-only IPv4 access: private/host destinations blocked, established replies
permitted, unsolicited inbound dropped, no DNAT/public game port. Rules are
interface/source/comment scoped and removed exactly; failed removal remains
tracked for retry. IPv6 is disabled only in the temporary namespace; global
forwarding is required already enabled and is never changed. Public DNS and CA
certificates are readonly namespace inputs; no Steam login token/customer secret
was accessed. The final bounded online run returned native A2S query results:
zero players, four maximum players, zero bots. It generated both identity files
privately and exited cleanly with code zero after the longer startup period.
An earlier immediate stop needed kill fallback, so the final result supersedes
that early-startup shutdown observation without concealing it. Some nonfatal
Steam/client-interface/Unity diagnostics remain; no human Join is claimed.

The normal player-count adapter now queries Core Keeper's allocated game port+1
with the existing A2S implementation and platform agent-local mapping. UDP fixture
checks verify the auxiliary port, human/bot distinction and invalid-port failure.
This source change is not deployed to the live agent/site.

RVGL's installed public assets had group-writable archive permissions, so the
publisher correctly refused them. Live files/permissions were not changed and
the publisher was not weakened. A root-private staging mirror copied only exact
manifest-pinned bytes with no-follow single-link regular-file checks, pre/post
metadata and SHA256 verification, normalizing permissions in the mirror only.
The strict publisher/verifier then accepted 2,549 files / 272,275,563 bytes,
including the flattened reviewed library alias; the mirror was removed.
Actual RVGL in its readonly asset/private profile layout, reserved UID, enforced
label, guarded filter, private display/network namespace and limited resource
scope started, bound UDP 2310, and stopped with engine exit zero and no captured
errors. This is engine lifecycle acceptance, not player-query/control/recovery
or persistent root identity API acceptance.

Fixed three operator publisher manifest-name errors (Core Keeper, RVGL, ANEURISM).
A catalog-wide entry-point test now checks exact-case manifest literals exist.
Additional tests cover identity-file retention, immutable empty mountpoints,
privileged/default syscall denials, guarded datagram pairs and scoped firewall
cleanup/retry. Local Python suite before the final cleanup-retry case: 289 passed,
two skipped (291 total), plus ten ANEURISM tests. The added cleanup-retry test
also passed (four staging-network cases). Platform player-query tests: seven
passed; agent query tests: 21 passed; readiness tests: 13 passed.

Windows full agent tests encountered transient EPERM atomic-renames in existing
update-job tests; those tests passed on focused rerun. The current agent source
was then tested on VPS Node 20 as an unprivileged staging UID with cleared env,
isolated network/filesystem and resource limits. After correcting fixture mounts,
407 tests passed and five nested-namespace tests failed due to the outer test
container. The full affected namespace test file was rerun under the unprivileged
UID with isolated network/resource scope but without the extra outer filesystem
container: all 13 runnable tests passed, five skipped. Thus all 412 distinct
runnable Linux agent tests passed across these runs, with six total skips; no test
was changed/skipped merely to conceal a failing application assertion.

Cleanup found zero staging-UID processes, temporary profiles, network namespaces,
firewall rules, workspaces or active test scopes. The obsolete first Core Keeper
staging bundle was removed after ownership/path checks. Reviewed v2 Core Keeper
and RVGL bundles and staging source/test logs remain for subsequent integration;
these are public engine/code copies, not customer saves. The live agent/service,
actual customer identities, database and hosting eligibility were unchanged.
No commit/push was performed. Readiness messages now report the actual staging
progress while retaining blocked enrollment. Runtime family counts remain
22 accepted / 25 candidates / five pending root integration boundaries; full
identity launch, restart/save recovery and UID-aware control still remain for
these two games. GoldenEye/Deus Ex Wine and ANEURISM UID handoff remain pending.

### Private-display identity transition and fail-closed staging acceptance

The staging launch now drops to the reserved customer UID/GID and clears groups
**before** entering its enforced AppArmor label. This matches the ordering needed
by the root runtime's unprivileged child rather than relying on root to perform
the label transition. Actual VPS probes passed stream and datagram-pair same-label
communication and cross-label/host-peer denials, plus authenticated Xvfb startup
and cleanup under this ordering.

Core Keeper's actual outbound-only staging run again answered A2S with 0/4 humans
and zero bots, wrote both private identity files, and exited with engine status 0
after the supervised stop. Its existing Steam/Unity diagnostic warnings remain;
this is not a human Join or persistent root recovery acceptance. RVGL passed the
same unprivileged-before-label launch, bound its gameplay port, and exited 0.

The acceptance harness now rejects spawn-only success: a premature supervisor
exit, missing listener, forced engine termination, or (for online Core Keeper)
missing query, incorrect slots/occupancy, or absent private identity output fails
the probe. Both in-namespace assertions and host-side result validation enforce
this. Teardown attempts all independent descriptors, network rules, namespaces,
workspaces and IPC labels even after an earlier cleanup failure, and reports
resource names without exposing subprocess/game output.

Local Python verification: 298 customer tests ran, 296 passed and two skipped;
all ten ANEURISM tests passed. Final VPS inspection found no reserved-UID
processes, temporary IPC profiles, staging namespaces/firewall rules, private
workspaces or active Core Keeper/RVGL scopes. No production service, catalog,
database, eligibility or customer enrollment changed. No commit/push performed.
Counts remain 22 accepted / 25 candidates / five pending root integration;
the next implementation remains persistent root identity launch, adoption and
control integration for Core Keeper/RVGL.

### Reusable private-display handoff and pinned Core Keeper identity files

Replaced the staging-only inline syscall bootstrap with the internal
`customer-display-entry.py` helper. It is not a sudo endpoint and is not enrolled
as a privileged operation. It refuses root/saved-root identities, mismatched or
saved groups, supplementary groups, and an absent/wrong/complain-mode IPC label
before loading a syscall helper. The inherited source descriptor must identify
a bounded, root-owned, single-link, non-writable-to-others regular file opened
read-only. The code executes only a stable bounded byte snapshot after metadata
verification; it does not reopen a path or use bytecode caches. The constructed
filter must be fully sealed, and the source descriptor is close-on-exec before
the fixed bubblewrap executable starts. Caller-supplied filter arguments fail.

Core Keeper's root-side `identity_mounts` now creates or verifies its two fixed
private identity outputs and returns pinned descriptors. Staging mounts those
descriptors rather than reopening customer-writable names. Existing saved
contents are retained; symlinks, hard links, wrong ownership/group, non-private
modes and oversized files fail closed. Partial failures close all prior handles.
Tests exercise path replacement, preserved contents and failure cleanup.

The root stop controller now has explicit future Core Keeper/RVGL supervisor
contracts: identity-checked pidfd SIGTERM with a 20-second window, allowing the
10-second engine shutdown and engine/display reaping to finish. Existing games'
stop signals/deadlines are unchanged. This does not add either game to the
independent root/agent enrollment allowlists, and is not evidence of actual root
adoption/recovery or external controller shutdown acceptance.

Actual outbound-only Core Keeper staging passed with the shared handoff, dropped
UID/GID, enforced policy, sealed filter and pinned identity mounts: A2S 0/4,
zero bots, both private outputs written, clean engine exit 0. Existing Steam/Unity
diagnostic warnings remain. Local verification: 313 customer tests ran, 311 passed
and two skipped; ten ANEURISM tests passed. Production, database, catalog and
eligibility remain unchanged; no commit/push performed.

RVGL also passed the shared handoff on the VPS, bound its gameplay port and
exited 0 with no recorded engine errors. Final inspection again found no staging
UID processes, temporary profiles, namespaces, firewall rules, private workspaces
or active game scopes. Persistent root enrollment/recovery and UID-aware control
integration remain pending; the 22/25/5 family acceptance counts are unchanged.

### Core Keeper persistent root-runtime wiring — local candidate

Core Keeper now has independent root runtime, resource placement, immutable
engine-bundle, migration-root and world-snapshot recognition. Its fixed legacy
root is `core-keeper-servers`; allocations use even gameplay ports 1300–1320
with the existing auxiliary UDP query-port bind policy. Typed configuration is
validated by the shared Core Keeper contract. The runtime builds the existing
root-owned configuration descriptor, uses pinned private identity outputs, and
enters its enforced per-UID IPC policy only after Popen drops UID/GID/groups.
The syscall filter is constructed by the shared unprivileged handoff instead
of the root supervisor. Missing enforced policy or untrusted helper descriptors
refuse launch. Physical memory remains cgroup-limited; the engine receives the
16 GB virtual-address allowance required by the earlier Unity staging results.

The opt-in runtime installer now carries the four display/Core Keeper helpers;
it does not load policy, migrate a server, restart a service, or enable an agent
profile. No installer or new root runtime was deployed to the VPS in this step.
The agent identity allowlist and accepted-isolation flags are unchanged.

Snapshot/migration copying now handles one derived alias for this game only:
`.steam/sdk64/steamclient.so` targeting `/game-data/linux64/steamclient.so`.
It validates ownership, single-link metadata and the exact target, records the
alias without following it, recreates it in root-private copies, and changes
ownership without dereferencing it. Other games, other paths, and different
targets retain the existing rejection. A legacy alias pointing at a host path
is deliberately not silently rewritten or followed; legacy enrollment still
requires explicit handling of such an installation before acceptance.

Verification: 317 customer Python tests ran, 315 passed and two skipped; ten
ANEURISM tests passed. Focused agent identity/readiness tests passed 19 runnable
tests with 12 platform-dependent skips on Windows. Installer shell syntax and
diff checks passed. New tests cover configuration/port constraints, pinned
mounts, guarded handoff, canonical alias copy/ownership round-trip, and refusal
of other symlinks. Actual root-managed launch, agent-restart adoption, saved-world
recovery and external management-stop acceptance remain pending, as does agent
identity translation. RVGL's persistent root integration remains pending. No
production/database/catalog changes or commit/push were performed.

### Core Keeper agent handoff wired — acceptance remains blocked

The shared agent identity registry now recognizes `core-keeper-unix-v1`, its
1300–1320 port range, and a 1-core/2-GB default allocation matching the root
resource contract. A strict translator accepts only the reviewed xvfb-run
recipe: exact engine, gameplay port, slot count, data and log paths, and bounded
name. It emits typed name/slots JSON for the root supervisor, not caller-provided
arguments. Root-owned activated migration metadata remains mandatory before a
handoff can launch; there is no fallback to a legacy/unrestricted process.

For enrolled Core Keeper, the agent skips legacy recipe preparation and uses
the gate's neutral working directory. Argument construction no longer creates
or reopens the sealed legacy home. Non-enrolled party/community behavior stays
on its existing path. Core Keeper stop calls now allow 30 seconds for the root
controller's 20-second graceful-stop window plus completion overhead; other
games retain their existing deadlines. The existing identity health/stop and
managed registry adoption paths recognize the new profile, but actual recovery
acceptance has not yet been run.

Readiness reports a **blocked candidate**, with its implemented profile shown;
it does not report accepted isolation, permit customer enrollment, or enable
executable content. Current family status: 22 accepted, 26 implemented candidates
awaiting acceptance, four pending full root/agent implementation (GoldenEye,
Deus Ex HX, ANEURISM IV and RVGL). This classification is implementation progress,
not a new engine/customer-isolation acceptance.

Verification: the complete local Windows agent suite ran 422 tests: 373 passed,
49 platform-dependent skips, no failures. Added cases cover fixed recipe
translation and injection/path/port rejection, resource defaults, stop deadlines,
absence of legacy-directory writes, and blocked readiness. Root/agent profile
contract consistency and diff checks passed. No VPS files, production services,
database/catalog rows, hosting eligibility or customers were changed in this
step; nothing committed or pushed. Next acceptance work is the isolated actual
root-managed launch, external stop, agent restart/adoption and saved-world restore.

### Core Keeper root-generated namespace and filesystem restore checks

Added `--corekeeper-root-command` to the direct-root staging harness. It imports
the reviewed root runtime source and calls its actual `command()` builder with
the verified immutable assets, sealed typed configuration and pinned private
identity outputs. The staging-only substitutions copy verified helper bytes into
read-only mounts, rather than installing anything under `/usr/local/libexec`.
The initial attempt exposed an inaccessible `/root` source path in the fixture;
that fixture substitution was corrected without changing the AppArmor policy.

The VPS run passed using the root-generated namespace: typed configuration was
read successfully, the actual engine started, its gameplay port bound, A2S
reported 0/4 humans and zero bots, both private identity outputs were written,
and the engine exited 0 after the timed supervised stop. The root's virtual
address limit, private filesystem layout and bounded temporary filesystem were
used. Existing nonfatal Steam/Unity diagnostics remain. The harness now requires
an explicit root-command result marker so a simpler fixture cannot be mistaken
for this check.

This is deliberately **namespace-builder acceptance**, not full root controller
or agent-restart acceptance: the fixture invokes the actual game helper with
its timed query/stop monitor. It does not exercise `run_runtime` provisioning,
the root binding journal, external pidfd stop, host/cgroup network-policy setup
or persistent agent adoption. Those gates are still required before promotion.

The actual filesystem snapshot/restore transaction also passed a new Core Keeper
fixture locally: saved world selection/seed/name, identity outputs and the fixed
Steam alias survive restore and ownership reassignment; the later world remains
retained for rollback, and the runtime activation inode is updated correctly.
This is not an actual-engine world-reload result.

Python verification: 319 customer tests ran, 317 passed and two skipped; ten
ANEURISM tests passed. Diff checks passed. Final VPS inspection found no staging
UID processes, profiles, namespaces, firewall rules, private workspaces or active
game scope. Only private staging source was updated; no installed production
helper/service, database, catalog, eligibility or customer account changed.
No commit/push. Family status remains 22 accepted / 26 candidates / four pending
implementations. Core Keeper remains blocked pending its full controller and
restart/restore acceptance.

### Core Keeper external stop — wrapper lifecycle bug fixed in staging

The new external-stop fixture uses the root runtime's actual persistent binding
writer/reader, scope derivation, PID/start-identity checks, UID/cgroup verification
and pidfd signalling. Only its ROOT directory is redirected to a private fixture
tree; no production binding, customer account or installed helper is changed.
A fixture scope-name mismatch was caught and corrected before controller
acceptance; a pre-spawn guard now requires launch/controller scopes to match.

The next run exposed a genuine bug: signalling the outer bubblewrap PID can
trigger `--die-with-parent` and kill its sandboxed command. Cgroup emptiness was
therefore insufficient evidence of graceful shutdown. The runtime now records a
separate `controlPid`/`controlIdentity` for the actual root-built sandbox command,
while retaining the wrapper PID for liveness. Discovery is bounded to 128 tasks,
checks the exact UID/cgroup and process identities, and matches only internal
root-built argv. Graceful signals target that command and keep the wrapper alive.
Core Keeper, Terraria, Factorio and Veloren populate this identity on new starts;
the two exec-style bootstraps also recognize their exact post-exec engine argv.
No caller-supplied executable/selector is added to the privileged request format.

**Rollout requirement:** older active graceful-profile bindings without these
fields now refuse a wrapper signal. They must receive explicit, verified adoption
or re-enrollment before deploying this change; do not use an unsafe wrapper
fallback. Native external-stop acceptance must also be repeated for the other
three affected games before promoting their revised path. Existing installed
production helpers have not been updated.

Core Keeper's actual VPS external-stop run passed: root-generated namespace,
successful A2S 0/4 humans and zero bots, private identity outputs, root controller
graceful stop, engine exit 0, and no forced cgroup kill. This differs from the
earlier fixture self-stop test. Local tests additionally verify that a reloaded
controller reads a real root-owned persisted binding, safely retries an already
stopped scope and rejects a mismatched identity. This is not agent restart/adoption
or the full `run_runtime` provisioning/network-policy acceptance.

Verification: 323 customer Python tests ran, 321 passed and two skipped; ten
ANEURISM tests passed. Diff checks passed. Final VPS inspection found no staging
UID processes, temporary profiles, namespaces, firewall rules, private workspaces
or active fixture scopes. Root start/adoption and actual-engine saved-world
reload remain pending; customer enrollment stays blocked. No production service,
installed helper, database, catalog or eligibility changed. No commit/push.

### Recovery controller health follow-up

Recovery status now verifies the persisted control PID/start identity and tenant
UID as well as its exact runtime cgroup. A surviving sandbox wrapper cannot mark
a dead or moved controller healthy. Partial or malformed control identities fail
closed. Legacy bindings with neither control field remain readable; status does
not silently adopt processes or rewrite a binding. Their explicit adoption or
re-enrollment requirement above remains unresolved.

Regression coverage checks healthy recovery, controller disappearance, scope
changes, incomplete identities, invalid PID values and legacy compatibility.
All 324 customer Python tests ran: 322 passed and two skipped. All ten ANEURISM
tests passed. These are local checks, not new VPS acceptance. No deployment,
production restart, database change, commit or push was performed.

### Legacy graceful-control recovery

The missing-control-field rollout blocker now has a read-only recovery path for
Core Keeper, Veloren, Factorio and Terraria. Stop discovers only a reviewed
command beneath the exact persisted wrapper, verifies tenant UID/cgroup and
PID/start identity, then signals the discovered command through a pidfd. The
wrapper itself is explicitly excluded as a signal candidate. No existing binding
is rewritten, no new privileged endpoint is added, and status remains read-only.
This supersedes the earlier requirement to rewrite or re-enroll every otherwise
valid legacy binding before stopping it. Unrecognized commands, incomplete control
fields and invalid/missing port metadata still require operator recovery.

Core Keeper and Veloren use fixed bootstrap commands; Veloren and Factorio also
recognize their reviewed post-exec engine argv. Factorio's port comes only from
the protected binding. Terraria accepts only the fixed original bubblewrap
command shape, private world path, bounded name/player settings and matching
protected port; arbitrary executable or world paths are rejected.

Local verification: 327 customer tests ran, 325 passed and two skipped; ten
ANEURISM tests passed. Recovery tests verify the inner PID is signalled without
binding writes, malformed identities fail closed, and altered Terraria commands
are rejected. Native external-stop acceptance for the other three games and full
Core Keeper start/adoption/world-reload acceptance remain pending.

The isolated VPS external-stop fixture was repeated with this controller source:
Core Keeper answered A2S with 0/4 humans and zero bots, wrote its private identity
outputs, and exited the actual engine with code 0 after a graceful root-controller
stop. Existing Steam/Unity diagnostic messages remain visible; this is not a
human Join or legacy-binding acceptance claim. Cleanup inspection found zero
staging-UID processes, namespaces, temporary profiles or private workspaces.
Only the private staging source was copied; installed production helpers and
services, databases and catalog records were untouched. No commit/push.

### RVGL persistent supervisor candidate

The root supervisor now recognizes RVGL's fixed 2310–2330 allocation and private
`rvgl-servers` migration namespace. It builds the reviewed Python lobby bootstrap
inside the existing per-UID authenticated display handoff, retains immutable
asset descriptors, mounts public game content read-only and keeps profiles,
cache, replays, times and edits in private customer data. New bindings record
the inner control PID/start identity for the existing 20-second graceful stop.
The candidate resource default is one CPU core and 1 GB RAM; this is a limit,
not a newly measured workload baseline. Installer source includes the reviewed
RVGL helper; no installer was run.

RVGL accepts only an empty game-settings object plus the root-provided port.
Arbitrary commands, extra configuration and unverified player-limit settings are
rejected. No party/agent identity enrollment or public readiness promotion was
added: those remain pending along with actual root-generated RVGL namespace,
persistent restart/adoption and controller-stop acceptance. The earlier isolated
engine fixture is not evidence for these new paths. Family acceptance counts
therefore remain unchanged.

Local verification: 329 customer Python tests ran, 327 passed and two skipped;
ten ANEURISM tests passed. New coverage checks configuration rejection, fixed
bootstrap command, retained assets and required private-display handoff. No VPS
deployment, production restart, database change, catalog change or commit/push.

### RVGL root namespace and agent handoff follow-up

The isolated VPS RVGL root-command/external-stop fixture passed: gameplay UDP
bound, the real engine ran inside the root-generated namespace, controller stop
was graceful, engine exit code was 0 and the engine reported no errors. The
fixture substitutes its timed supervisor for the bootstrap entry point while
calling the real RVGL/display helpers. It does not exercise full `run_runtime`,
host/BPF policy setup, persistent agent adoption, occupancy query or restore.
Cleanup found zero staging UID processes, namespaces, temporary profiles or
private workspaces. Installed production helpers/services were not changed.

Agent source now recognizes RVGL's fixed identity/port contract and translates
only the exact reviewed 64-bit xvfb lobby recipe into empty typed settings. It
requires matching migration metadata, skips shared-display preparation for the
identity path and uses neutral working-directory handling. Additional settings
and altered launch arguments fail closed. Display-runtime stop calls allow 30
seconds so the root's 20-second cleanup is not prematurely cancelled. Public
readiness stays blocked and executable content stays disabled.

Verification: 424 Windows game-host tests ran, 375 passed and 49 platform skips;
the subsequent stop-timeout change passed all ten focused runtime tests. Python:
329 customer tests ran, 327 passed and two skipped; ten ANEURISM tests passed.
Diff checks passed. No customer migration/enrollment, production deployment,
database/catalog changes, commit or push. RVGL is now an implemented candidate,
not accepted isolation: 22 accepted families, 27 implemented candidates and three
remaining full integration families (GoldenEye, Deus Ex HX, ANEURISM).

### Production deploy of the committed agent and Core Keeper bundle publication (2026-10-17)

The VPS agent and root helpers were brought to commit fe08d2b8 with a pinned,
backed-up deploy (rollback copy in `/opt/playbound-host/rollback/deploy-head-20261017`).
72 agent files changed (32 replaced, 40 added); `install-customer-runtime.sh` refreshed
the runtime/seccomp/display/world-backup helpers and sudoers; ten managed processes kept
their PIDs through the agent restart. Customer enrollment remains zero. Before the deploy,
423 agent tests passed on Linux as the service account (`umask 022`) and 337 of 339 root
helper tests passed as root; the two others are account-specific and pass or skip in the
right context.

The Core Keeper public bundle was published to
`/usr/local/libexec/playbound-isolated-corekeeper-data-v1` with the strict root publisher
(1,140 files, 591,875,009 bytes, no changed processes).

**Deployment gap found:** `install-customer-runtime.sh` does **not** refresh
`playbound-customer-resources`, `playbound-customer-identities` or the ANEURISM helper;
each has its own narrow installer (`install-customer-resources.sh`,
`install-customer-identities.sh`, `install-aniv-helper.sh`). The installed resources helper
predates the Core Keeper/RVGL profiles, so a staging-agent Core Keeper start failed at
resource placement ("Customer resource placement was not confirmed") while Teeworlds
placed correctly from the same fixture. The fix is to run the resources installer (and
review the other two) before repeating acceptance; this step was not completed in this
session. Fixture state was left in place for the repeat: fixture server
`ffffffffffffffffffffffff1`... (migrated, enrolled), the loaded
`playbound-customer-ipc-40000` label and a staging agent on 127.0.0.1:8753
(unit `playbound-corekeeper-identity-staging`); scripts are in
`/opt/playbound-host/staging/corekeeper-acceptance-20261017`. Run `ck-finish.py` there to
remove everything. Core Keeper acceptance, RVGL acceptance and the three remaining root
families are still pending.

### Core Keeper isolated handoff acceptance (2026-10-19)

The separate resource-placement installer refreshed only
`playbound-customer-resources` and its fixed sudo rule from the reviewed source;
the previous helper and rule were saved under
`/opt/playbound-host/rollback/resources-20261019`. The production agent was not
restarted and remained active. With the existing staging identity, Core Keeper
started in its root-managed scope as UID 40000, bound the fixture port and answered
the native query with zero humans, four slots and zero bots. Repeated start was
idempotent. A staging-agent restart retained both the same supervisor and game
PIDs, player query and process metrics. External stop acknowledged a fully stopped
runtime. A live world snapshot was correctly rejected; after stop, a snapshot
succeeded. Restoring it removed a later fixture marker, and the actual engine
started again from restored data and answered the same query. Another staging-agent
restart preserved the restarted engine PID. `ck-finish.py` rolled the fixture data
back and removed the staging agent, private runtime, fixture data and AppArmor
label. The production agent stayed active throughout; no customer server, catalog
or database record was changed. Evidence is saved at
`/var/lib/playbound-host/state/native-identity-acceptance/core-keeper.json`.
This accepts the isolated Core Keeper start/recovery/stop/snapshot path, not a
human client Join, occupied-load behavior or general customer enrollment.

The simultaneous `Managed runtime was no longer running when the game-host agent
restarted` reports on October 18 were caused by a full VPS reboot. The previous
boot ended at 00:03:40 CEST on October 19 and the new boot began at 00:26:33;
all ten reported processes belonged to the prior boot. They are not evidence that
an ordinary agent restart killed those games. The separate Open Fortress failure
was a stale community profile selecting the TF2 recipe for the Open Fortress
edition even though both installations were ready. Recipe resolution now derives
the edition-specific runtime before starting, and readiness requires the edition's
own server files. The profile row itself is not bulk-rewritten.

The repository check for commit `77c22018` passed. The installed ANEURISM
namespace helper was one revision behind the reviewed source: its credential
reader lacked the newer nonblocking, single-link and changed-file checks. Its
previous binary and sudo rule were backed up under
`/opt/playbound-host/rollback/aniv-20261019`; all ten Linux helper tests passed
against the staged source before the scoped installer replaced the helper and
validated its sudo rule. The game-host service stayed active without a restart.
No customer room, catalog or database record was changed. Core Keeper admin
readiness now records the accepted isolated lifecycle while remaining blocked
pending human Join, occupied-load behavior and UID-aware controls.

