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
Keep current seven-game update support (plus blocked Barotrauma) and thirteen-game file support explicit
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
   beyond the seven delivered Steam installations. Add separate verified strategies for official archives,
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

- Existing web/native/overlay management, role checks, map/bot/player controls
  where declared, restore points, supported saved-file roots, daily maintenance.
- Admin-coordinated staged updates for CS2, TF2 and Unturned, with rollback,
  shared-installation start gates, read-only process checks and persisted jobs.
- The same staged Steam update path now covers Counter-Strike: Source, Core Keeper,
  Don't Starve Together and Necesse. Installed manifests/executables
  were inspected on the VPS; isolated per-depot update/rollback fixtures cover
  fixed app IDs and required files. No production binary update is implied by
  that fixture verification, and a real client Join remains a separate check.
- Barotrauma is inventoried but blocked: customer servers use private runtime
  copies, so updating its shared depot would not update running binaries on a
  subsequent start. Its admin card exposes that reason, and the agent refuses
  queueing until a save-preserving private-runtime migration passes verification.
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
  pending. Expand with verified adapters rather than treating the seven supported
  Steam distributions as a universal installer.
