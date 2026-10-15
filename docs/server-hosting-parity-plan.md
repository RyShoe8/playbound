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

- Network isolation now has a manual root-only kernel preflight and a verified
  Teeworlds query transport foundation. A unique transient scope actually denied
  IPv4/IPv6 loopback control connections as an unprivileged UID while retaining
  public IPv4 connectivity. Candidate CIDRs are fixed; other private CIDRs and
  public IPv6 were not individually exercised. No production filter is enabled.
  Teeworlds queries can explicitly target a literal IPv4 address, reject invalid
  endpoints as unknown and ignore another peer's replies. An existing server
  returned the same zero-player/eight-slot result locally and via the public IP.
  A separate UID/namespace/resource-limited filtered fixture returned unknown on
  loopback and zero players/four slots over the public interface, then was removed.
  Managed-profile application/recovery, public Join/occupied counts, other engines,
  administration-port/tenant protections and plugin isolation remain gates.
  All four endpoint/peer/handshake checks passed on the VPS. The full local agent
  suite passed 207 tests with 17 platform skips. Query code/operator helper are
  deployed; eleven existing managed process identities were preserved and no
  production network profile or UID enrollment was enabled.
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
