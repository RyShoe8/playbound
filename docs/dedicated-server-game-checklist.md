# Adding a dedicated-server game or edition

This checklist is mandatory whenever adding, enabling, or materially changing
dedicated hosting. Apply it to **every offered game and relevant edition**,
including community, customer-owned, party-hosted, and launcher self-hosted
servers. A successful spawn is not proof that a game is ready.

Read `platform/docs/new-game-checklist.md`, `docs/server-management.md`,
`docs/server-control.md`, and `docs/server-hosting-parity-plan.md` first.
Create/edit catalog games through the admin UI. Never bulk-sync seed content,
pull credentials, edit environment files, or alter unrelated database records.

## 1. Identify the actual server and compatibility contract

- Record canonical game slug, edition slug, recipe slug, and any aliases.
  A multiplayer edition must not enable hosting for its single-player parent.
- Verify redistribution/hosting rights using official upstream documentation.
  Record the dedicated package/app ID, supported OS/architecture, required
  runtime, current server/client versions, and compatible client editions/mods.
- Distinguish dedicated processes from a client-hosted listen server and from
  virtual LAN or streaming. Never launch the ordinary client as a dedicated server.
- Record authentication requirements (GSLT, Steam ownership, passwords, etc.).
  Secrets belong in the existing private host configuration; never catalog
  fields, telemetry, process listings, screenshots, or downloadable backups.

## 2. Install and own the process

- Wire `platform/src/lib/gameHost/catalog.ts`, `game-host/recipes.js` or
  `dedicatedRecipes.js`, the supported installer/ensure path, and port allocation.
  Cover paid/dedicated-only recipes as well as community rotation candidates.
- Pin trusted artifacts or use a declared official update channel. Validate
  checksums/manifests, architecture, executable permissions, and dependencies.
  Do not offer arbitrary download URLs, shell fragments, or client-selected paths.
- Declare TCP/UDP and query/status ports, spans, startup deadlines, graceful
  shutdown, child-process supervision, recovery/backoff, and port release.
- Drain stdout/stderr. Bound retained logs and redact known credentials.
  A replaced process exiting must not mark its replacement offline.
- Use stable server identity and isolated per-server data. Managed runtimes
  must persist/adopt after agent restart and bypass the old party idle timeout.
  Never manufacture a Party ID as a community server identity.
- List every imported agent module in `game-host/install.sh`. Deployment must
  carry required assets/helpers and preserve existing running games.

## 3. Query, discovery, and Join

- Implement a real local game query in `game-host/playerQueries.js` and wire
  the platform player-query mapping. Record humans, bots, maximum slots,
  confidence, and failure/timeout behavior. Unknown is never zero players.
- Verify zero → connected human → zero using a real client. Test bots separately;
  bot population must not become human occupancy or block empty-only decisions.
- Wire the shared server registry/read model, edition/mod/version checks, master
  listing dedupe, and stable URL. Unready/query-failed servers are not joinable.
- Verify web, launcher, and Join with Party. Use existing connect/deep-link
  logic rather than inventing another join URL. Include public-address versus
  overlay/LAN-address behavior and any required client-side step.

## 4. Declare and verify every applicable management control

- Use `serverControl/settings.ts` and the existing ServerControlAdapter. Assess
  name/password/slots, rules, map selection/rotation, bots, players, kick/ban,
  console, start/stop/restart, and process diagnostics.
- For each control record its actual engine setting/command, safe validation,
  delivery mechanism, apply cost (live/next round/restart), and tested result.
  Never advertise a limit or setting the server does not enforce.
- A shared fleet player limit is a ceiling; retain any lower engine limit.
  Native bot fill must remove/replenish bots as humans join/leave and leave
  admission room. Games without bots get a clear engine limitation.
- Verify parity in My Servers web, native launcher workspace, party settings,
  and the one Ctrl+P helper. Controls must fit narrow windows and be usable
  by keyboard; warn before player-disconnecting or destructive changes.
- Enforce owner/admin/moderator/party-leader permissions on every operation.
  Ordinary members on public/community servers never receive write access.
  Unsupported features need explicit reasons, not inert buttons.

## 5. Self-hosted party parity

- Declare a separate local binary, host template, config keys, dependencies,
  and platform support in the existing multiplayer/launcher metadata. Verify
  a real Windows install and other OSes actually offered for that recipe.
- Check how **each** declared setting reaches this engine. Quake-style `+set`
  arguments are not a universal configuration protocol. Implement native
  config/arguments when required; do not claim unsupported delivery works.
- Reuse typed validated desired state and applied revisions. Only the leader's
  launcher reconciles it; no cloud shell or unrestricted command relay to a PC.
- Report readiness only after the correct process/port is ready. Cover overlap,
  restart, failed launch, old-child exit, party end, game/edition change, and host
  transfer. A stale acknowledgement must not overwrite a newer desired state.
- Provide as much of the hosted controls as the local engine and transport
  safely support. Add local player queries, maps, bot controls and constrained
  moderation where verified. Preserve honest restart costs where live apply
  is unavailable. Menu-hosted games must explain their reduced controls.
- Diagnostics stay local to the host; do not upload raw game logs or secrets.
  Never touch unrelated user installs or saves, or kill the client process.

## 6. Saves, files, backups, and updates

- Declare a saved-data root and secret/executable exclusions before enabling
  world backups or file management. Verify restore into the same stable identity.
  Config restore points, file revisions, and world backups are different things.
- Test path traversal, symlinks/hard links, secret filenames, optimistic version
  conflicts, transfer/retention/disk limits, stopped-only writes, and start races.
- Implement a verified staged update/rollback handler for this installation
  family, including all editions sharing its files and unmanaged dependencies.
  Wire `installationTargets.js`, worker strategy, and the root-owned read-only
  process scanner/sudoers allowlist where applicable. The current Steam-only
  strategy must not be applied to archives, OS packages, Wine, or source builds.
- Wait for affected runtimes and pending starts to finish; block new starts
  while queued/active/interrupted. Preserve live games, saves, and credentials.
  Verify artifacts/executables before activation, retain rollback, and recover
  safely from worker/agent crashes. Never silently update shared files in place.
- Executable plugins/Workshop packages require verified per-customer isolation,
  explicit privileges, trusted sources, compatibility, backup and rollback.
  A save-file upload extension allowlist is not executable-plugin isolation.
- Review a `customerIsolation.js` profile for the engine: trusted executable,
  read-only dependencies/configuration, only its writable data, clean environment,
  process recovery/query/stop/metrics and cross-customer denial. Reviewed profiles
  cover Teeworlds, BZFlag, Hedgewars, OpenTTD and Luanti; do not copy their mounts to other engines
  or mistake namespaces alone for completed UID/network/cgroup isolation.
  Validate links/hardlinks in host-side generated configuration and directory
  ancestors before recipe preparation, not only before spawning the sandbox.
- Customer namespace profiles must launch through `customerRuntime.js`, with
  confirmed CPU/RAM/swap/task limits before executing the game. Declare a
  bounded resource profile in the root-owned placement helper, verify inherited
  limits, fail-closed placement/cancellation, restart recovery, whole-tree stop
  and independent resource metrics. No general systemd/shell sudo is permitted.
  Carry validated tier/slot CPU and RAM allocations outside game settings on
  initial start, recovery and settings-backed restart; enforce the same envelope
  inventory reserves. Confirm non-default limits and increased memory actually
  reach the kernel, persist recovery metadata and reject unsupported allocations.
- Per-server Unix identities use the root-owned identity broker; do not grant
  general `useradd`, `chown`, `kill`, shell or systemd sudo. Account readiness is
  not runtime isolation. Before switching a recipe, verify launch credentials,
  dropped supplementary groups, saved-data/config access, identity-checked
  shutdown after agent restart, backup/restore/file operations, query and metrics.
  Preserve existing worlds and live process users until that handoff passes.
  Never delete/reuse a UID reservation as part of deleting a saved server.
  Teeworlds's staged `teeworlds-unix-v1` path uses a fixed root supervisor, sealed
  configuration FD and root-owned runtime binding. Enrollments must survive stop
  and client requests that omit the profile; do not downgrade into an empty old
  home. Refuse nonempty legacy data until migration is explicit. Verify whole-
  cgroup shutdown before acknowledging stop and cleanup when the gate is killed.

## 7. Capacity and programming

- Measure timestamped settled CPU/RSS after warmup, observed player counts,
  concurrent node load, and confidence. Do not use startup spikes or one idle
  sample as an occupied-load envelope. Apply sensible engine tick/yield limits.
- Keep conservative envelopes for unknown populations and future placements.
  Use bounded low-frequency sampling/retention, not endless test servers/results.
- Verify both VPS safety limits and automatic budget arithmetic, fresh metrics,
  reservations counted once, empty-only retirement, minimum-online/idle/cooldown,
  stale-query preservation, and idempotent concurrent reconciliation.
- Hosting eligibility and Game Night eligibility remain independent. Test hosted
  warmup/readiness/reservations and a non-hosted event without manufacturing a
  server. Event end must never disconnect a populated server.

## 8. Release evidence and regression guards

- Add meaningful recipe/argument/config/query/control tests for this game and
  edition. Extend existing cross-layer catalog/recipe/Join/deployment guards.
  Include restart adoption, occupied/unknown behavior, save restore, and update
  rollback. Exercise the actual Electron UI for changed launcher flows.
- Run the relevant platform, game-host and launcher suites, lint, typecheck and
  production build for touched components. Test one game at a time within VPS
  safety limits; never mass-spawn the catalog as an audit shortcut.
- Save a per-game acceptance record: versions, ports, query/Join results, controls,
  baseline/confidence, update/rollback, self-host parity, and explicit blockers.
  Do not label a title fully supported while its essential path is unverified.
- Deploy agent dependencies safely, check health and existing PIDs, then deploy
  web/launcher changes. Launcher source changes require a new distributed build;
  do not claim an already-installed launcher contains unreleased code.
- Start eligibility disabled, enable only the verified intended profile, and
  provide a rollback path. Record actor/time and leave unrelated catalog, worlds,
  manual events, hosting customers, and party rooms intact.
