# Paid Dedicated game servers

These recipes live in `platform/game-host/dedicatedRecipes.js`. Installed recipes in `PARTY_DEDICATED_GAMES` are available as PlayBound-hosted party modes. Published games whose files the VPS reports ready can also be selected for Community Hosting, but they are not enrolled in rotation automatically. Unturned, Don't Starve Together, and Trackmania still require a private per-room credential before their party server can start. Catalog publication is separate and has not been changed. Witchbrook is omitted until release.

`DEDICATED_ONLY_GAMES` in `platform/src/lib/gameHost/catalog.ts` supplies draft profile stubs in `/admin/hosting`. An installed binary does **not** mean the game is verified or available for sale. Promote a profile after native startup and query/control checks, supported slot-cap enforcement, clean stop, and applicable data backup/restore checks. Real-player Join is observed during normal use, not required for promotion. Unknown client protocol or a known version mismatch still blocks an incompatible server.

## VPS files installed

The public server packages are under `/opt/playbound-host/games/<slug>` and owned by `playbound`. Re-runnable installation scripts are in `platform/game-host/tools/`:

- `install-dedicated-steam.sh` uses the distro `/usr/games/steamcmd`, not the broken `/usr/local/bin/steamcmd` wrapper. It installed Counter-Strike: Source, Unturned, Core Keeper, Barotrauma, Don't Starve Together, Necesse, and ANEURISM IV from anonymous Steam apps.
- `install-dedicated-direct.sh` staged and validated the official Factorio, Terraria, and Trackmania downloads and the RimWorld Together release. Terraria 1.4.5.8 is nested at `1458/Linux/TerrariaServer.bin.x86_64` and needs its executable bit set.
- Vintage Story has a recipe but no file on the VPS: its official current server archive is behind a Vintage Story game-account login. Do not guess a versioned CDN URL.
- SteamCMD reported success for anonymous Starbound app 211820 and Risk of Rain 2 tool 1180760 but delivered **no server executable** (only manifests and `EmptySteamDepot` for Risk of Rain 2). Neither is provisioned.

The VPS UFW rules for the draft recipe port ranges are installed. Contabo's separate firewall, if enabled, must also admit the same ranges before client testing. Future full `install.sh` runs derive UFW ranges from the recipes. The changed agent modules were copied to `/opt/playbound-host/agent` and the agent was restarted on September 30; the prior agent is backed up at `/opt/playbound-host/agent-pre-paid-20260930`. Health reported 14 recovered rooms and all ten installed paid packages. Do not run the full installer solely to refresh these drafts: it also restarts other services.

## Recipe state

- **Soldier of Fortune: openMERC** — the edition uses the upstream openMERC 0.2.2 Linux dedicated binary with the operator's private, licensed GOG PAK data. Original Platinum 1.07f clients cannot join; parties and hosting expose this recipe only for the `openmerc` edition. On 2026-10-28 the VPS passed an unprivileged Linux spawn, UDP gameplay/query binding, a 0/8 native occupancy reply, external query through UFW, and a recipe-driven start/stop. The PAK archive is not public. `game-host/tools/provision-openmerc.sh` pins the engine archive and the verified GOG PAK hashes for a fresh operator provision. The managed room stores openMERC's writable `user` directory under its own server identity. Paid hosting is public-only for now: private/unlisted selection is rejected until PlayBound can provision the engine's native password and deliver it safely to authorized players. Map changes use a restart; live console moderation and backup/restore are not yet advertised. Real-client joining will be observed during normal use.

- **Counter-Strike: Source** — installed; smoke start bound UDP 27060 with four slots. Confirm a real client joins and RCON works.
- **Terraria** — installed; binary path corrected. New-world generation takes longer than 30 seconds, so readiness waits up to three minutes. Confirm the completed world, stop, and reload.
- **Unturned** — installed. Use the official `ServerHelper.sh` for the required Steam libraries. A private `gslt.txt` is required per customer server before Internet startup; the recipe writes `Commands.dat` with the purchased cap and assigned port and stores saves in that customer's folder. Test joining after token provisioning.
- **RimWorld Together** — installed; smoke start listened on TCP 25590 and wrote configuration and assets to a private customer directory. Test an actual RimWorld client and backup restore.
- **Core Keeper** — installed; smoke testing found that world generation needs Xvfb and a private `steamclient.so` link. The revised recipe uses both, reserves the query port, and passes the slot cap on the command line. Test a real client and capture the generated game ID.
- **Vintage Story** — recipe written; official archive and startup test pending account access.
- **Factorio** — installed; smoke start hosted on UDP 34197, created a save in the private customer directory, and saved on SIGINT. Test a real client and backup restore.
- **Necesse** — installed; smoke start hosted with six slots in an isolated data directory. The agent sends `stop` and allows time to save before forcing termination. Test restart and backup restore.
- **Don't Starve Together** — installed; single-shard Master recipe written with separate game and Steam ports, a private cluster, and a purchased slot cap. A private Klei `cluster_token.txt` must be provisioned at `<server-home>/PlayBound/Cluster_1/cluster_token.txt`; no token is put in process arguments. Caves need a second shard process and are not part of this draft.
- **Barotrauma** — installed; the actual recipe's isolated runtime reached `Server started` on non-default ports. The recipe links the Steam library into the private home, copies the package per customer because the game reads `serversettings.xml` beside its executable, then forces port, query port, privacy, and a cap of at most 16. SteamAPI initialization still reported a warning, though the direct Lidgren server started; test a real client, campaign save, and backup restore.
- **Trackmania** — installed; recipe creates a separate runtime copy and private config. Each server requires its own dedicated-server account in `<server-home>/dedicated-account.json` with `login` and `password`; a real account and PC client are needed for validation. The archive includes training maps. Dedicated rooms are PC-only per Nadeo.
- **GoldenEye: Source** — draft recipe on ports 27120–27139/udp. The official 5.0.6 server archive contains Windows files; the official Linux guide uses the Windows Source 2007 Dedicated Server (Steam app 310), Wine, and Xvfb. `tools/install-goldeneye-source.sh <official-server-archive.7z>` checks the published SHA256 and stages both distributions. Install `wine32:i386`, `xvfb`, `xauth`, `p7zip-full`, and SteamCMD first. Each hosted room copies the runtime and gets a private Wine prefix. The files were installed on the VPS on October 2. The original loopback smoke query failed. A later isolated check on October 15 bound all interfaces and answered a real A2S_INFO query through the VPS address with zero humans and four slots; the agent now uses that public-address fallback. The runtime is not yet verified; keep its hosting profile in draft until private Wine/display isolation, recovery, controls and data safety pass. A human Join test is not a gate. Sources: [official server download](https://www.geshl2.com/server-downloads/), [official Linux guide](https://docs.geshl2.com/server/getting-started/install/linux/).
- **Quake II** — Enhanced keeps Nightdive's in-game crossplay lobbies. The 1997 Original build uses a different network protocol and cannot join Enhanced lobbies. The former Original-only Yamagi VPS recipe was removed because the catalog entry represents Enhanced; neither build has a PlayBound dedicated recipe. Sources: [Bethesda's two-build explanation](https://bethesda.net/en-US/news/quake-ii-enhanced-release), [id's 2023 protocol notes](https://github.com/id-Software/quake2-rerelease-dll), [Yamagi server documentation](https://github.com/yquake2/yquake2/blob/master/doc/060_multiplayer.md).

## Not yet safe to offer

- **ANEURISM IV** — the official Linux dedicated binary is installed and uses fixed local UDP 27015/27016 for Steam. An isolated staging test on October 13 authenticated with the operator's private GSLT, connected to Steam, and loaded `aneurismiv` successfully. Its four-slot configuration and owner SteamID64 were supplied to a fresh private data directory. The token stays in `/var/lib/playbound-host/credentials/aneurism-iv/gslt.txt` with mode `0600`; never copy it into catalog records, telemetry, or shared logs. The test used a temporary network namespace with narrowly scoped outbound NAT, then stopped the process and removed its namespace and firewall rules. The live agent and existing fleet were not restarted. This proves authenticated startup, not a client Join or slot-cap/load/save verification. The agent now has a managed-only namespace lifecycle with an exclusive token lease. Staging tests also passed authenticated/map-ready startup, restart while loading, same supervisor and native PID after restart, native process metrics, duplicate-token rejection, clean stop, and cancellation during startup. Its public runtime metadata carries a Steam server identity and deliberately returns no direct-connect host or port. A live Steam A2S_INFO query on namespace-local UDP 27016 reports players, configured capacity, and bots. Client Join, slot-cap enforcement, occupied load, and save/restore remain unverified; the operator has selected it for automatic community startup as a live test, with a conservative 3-core / 2-GB reservation. It remains excluded from customer hosting and joinable public listings until the real client/query path is verified. Failed or stale occupancy queries prevent empty-server retirement.
- **Starbound** — the server runs from paid game files; anonymous SteamCMD returned only an app manifest. Provision a licensed Steam installation before implementing and testing a per-customer `storage` directory.
- **Stardew Valley** — no standalone official headless binary. JunimoServer is a community host built around a licensed Stardew game installation, SMAPI, and Docker; it requires a Steam account that owns the game and a separate container lifecycle rather than this agent's one-process recipe interface.
- **Risk of Rain 2** — anonymous SteamCMD app 1180760, including an explicit Windows-platform retry, reported success but delivered no server executable on this VPS. Steam lists a Windows content depot, so the empty Linux install does not prove the tool is unavailable. Obtain the actual Windows server files, run them under a supported host or Wine, and verify native startup, current protocol compatibility and query/control before offering it. A staged human Join test is not required.

## Customer data and secrets

### ANEURISM version compatibility

The October 13 capacity investigation also reproduced a process-metrics bug: rapid reads reset CPU baselines over millisecond intervals, reporting up to 16 cores on a 6-core node. The agent now shares a minimum one-second measurement window across callers and invalidates cached measurements on PID reuse or exit. Regression tests cover both cases. The deployment preserved all three managed runtime PIDs; the following reconcile kept ANEURISM online with real positive occupancy. Existing historical profile envelopes have not been lowered automatically.

The first player-leave test then exposed a separate retirement bug: ordinary budget downsizing used a fresh empty query but bypassed minimum-online and idle timers. Budget downsizing and rotation now share the same retirement guard, including recent activity, query freshness, and Event protection. Existing commercial-capacity preemption remains a separate policy. The duplicate Vercel hosting cron was removed; the authenticated VPS timer remains the sole regular 15-minute hosting scheduler.

On October 13, the installed Linux server was `20a`, while the operator's Steam client was `20d`; client Join failed with a version mismatch. The public SteamCMD server app `2832030` now supplies `20d` (`aiv-20d-linuxdedicatedserver-tc12527-gddfb112a`, Steam build `25818134`). It was downloaded to a separate staging directory, inspected through `build-metadata.json`, and swapped in only after a successful zero-player query and complete shutdown. The world directory was preserved and backed up separately; the old binaries remain in `/opt/playbound-host/rollback/aniv-20a-20261013-204106`.

The updated live instance authenticated, loaded the map, retained Steam server identity `85568392936848198`, and answered the namespace-local query with `0 / 16` humans and zero bots. Website reconciliation records that real result as `RUNNING`. A subsequent live query reported 1 / 16 humans, confirming positive occupancy on the updated server; the complete client Join and leave cycle, slot enforcement, and save/restore gates remain to be documented. For future updates, compare the client's version with the staged server's `productVersion`; do not assume an old preview-branch example matches the current public client, update running binaries in place, or infer client compatibility from successful startup.

Every paid recipe uses a server ID scoped folder beneath `/var/lib/playbound-host/<game>-servers/pb-<server-id>`. Unturned's `Servers/<id>` path is a symlink to that private folder. Barotrauma and Trackmania use a private runtime copy because their settings sit beside the executable. The world-backup allowlist includes the newly isolated world directories; verify each save format and restore with a real client before promotion. Unturned is excluded from automated backups until its save-only path is confirmed; backing up its entire directory would include the private login token. Customer tokens and account passwords belong in `0600` files under their own server folder, never in a catalog row or command line.

The new recipes are present in the live agent health response. This confirms binary detection, not client compatibility or readiness for sale. Keep hosting profiles in draft until native startup/query/control, stop/restart, supported slot-cap, and applicable backup checks pass. Real-player Join is not required for promotion. Catalog publication is an independent editorial decision.

The five blocked games are shown as non-interactive planned entries in the public Dedicated lineup and the admin Basic game catalog. They are excluded from customer server creation and starts until their blockers are resolved. Witchbrook is omitted entirely.

### ANEURISM isolation helper

Install `platform/game-host/tools/install-aniv-helper.sh` as root before deploying `anivControl.js` and the agent recipe. The root-owned helper accepts only `run|stop|query`, a bounded isolation slot, and a validated server identity. It runs the game as `playbound`, requires IPv4 forwarding to already be enabled, and removes its own namespace, virtual interface, and narrow outbound firewall rules on stop. It does not edit environment files or restart services. Each simultaneously running server requires a separate private GSLT. A crashed or occupied token lease fails closed.

Linux boundary tests: `python3 platform/game-host/tools/aniv_host_test.py`. The root-only `tools/smoke-aniv-agent.mjs` harness requires an isolated agent tree at `/var/lib/playbound-host/aniv-agent-staging`, an installed helper and game, and privately provisioned credentials. It uses localhost port 8743 and private test data, not the production agent or database. Do not run it concurrently with another ANEURISM test using the same token. Native startup logs stay root-only under `/var/lib/playbound-aniv-control`; the agent receives only bounded readiness metadata. Never print native process arguments, which contain the Steam credential required by the upstream executable.
The October 13 agent deployment passed live health checks and reattached both pre-existing managed runtimes with their original PIDs. No party rooms were present during the restart. Prior agent modules are in /opt/playbound-host/rollback/aniv-20261013-200124. No catalog or database records were changed.

### Database availability during reconciliation

The hosting cron checks Mongo with a read-only, two-second ping before any
server operations. It retries the readiness check once after a one-second
backoff. Paid recovery then runs before the community pass, sequentially, so
the two passes do not compete for the same connection pool. A database
availability failure returns HTTP 503 with `DATABASE_UNAVAILABLE`; it does
not replay a partially completed pass or try to write telemetry to the
same unavailable database. Vercel and VPS service logs retain the failure,
and the next 15-minute tick reconciles again. Unexpected application errors
continue to use the existing telemetry path. TLS alerts alone do not identify
the root cause; correlate recurring failures with Atlas connection and
cluster-health measurements.

### Resource recalibration and retention

The admin Game Servers panel can recalibrate operational resource estimates.
The reset transaction archives profile measurement summaries in
`ServerResourceCalibration`, clears only profile measurement fields, increments
their baseline versions, and deletes obsolete `ServerResourceSample` rows for
those profile keys. Catalog content, servers, reservations, eligibility, query
verification, tier allowances and customer settings are untouched. Request IDs
make a repeated reset harmless. Old raw readings are deleted; archived summaries
retain the previous envelope and counters for recovery.

Spawn tests are startup audit observations, not idle baselines. Managed process
monitoring uses short CPU windows, rejects CPU readings above the node's physical
core count, and stores settled measurements only after five minutes of runtime,
a successful player query and a 1–60-second sampling window. Three initial
readings are required before publishing a padded envelope. Thereafter database
sampling is limited to one reading per profile per UTC day; repeated spawn tests
also produce at most one startup audit row per profile per day. A 30-day TTL
limits raw history. CPU/RAM headroom remains conservative, and future automatic
updates only increase an envelope; lowering requires an explicit admin reset.
Idle calibration does not establish resource use at unobserved player counts.

The hosting tier's resource-fit display shows the number of tier units required
by a measured server. A 256 MB displayed estimate is a floor, not an enforced
256 MB memory limit; a tier unit is likewise not the full server allocation.


## Open Fortress native hosting (2026-10-15)

Open Fortress remains the `team-fortress-2:open-fortress` catalog edition but
uses the separate `open-fortress` recipe, Source SDK 2013 Multiplayer
`previous2021` build 6982827, and reviewed alpha mod distribution. It must
never fall back to the current 64-bit TF2 engine. Gameplay UDP ports are
27150–27169; the native client listener uses gameplay + 1000. The recipe
binds to all interfaces and uses authenticated Source RCON locally.

The reviewed shared package is `games/open-fortress/runtime`. Each stable
server identity gets `HOME/open-fortress-servers/pb-<id>/runtime`, a private
launcher, module bindings, configuration, logs and generated map graphs.
SDK aliases must resolve to the same native files; copying both aliases as
independent modules breaks the legacy loader. The native mod expects
`server_srv.so` to resolve to `server.so`. Explicit Linux resource paths mount
the existing TF2 assets. TF2 installation updates wait for Open Fortress too.

Package verification supports its reviewed ELF32 architecture and streams
large-file hashes in a bounded child process rather than blocking the agent.
Only a complete reviewed engine/content tree can start. Configuration survives
preparation; linked configuration, linked directory ancestors and changed
private launcher files require review. This is private data separation, not
completed per-customer Unix isolation or permission to install executable mods.

Declared controls cover native maps, a 32-slot ceiling, live time limit,
bot fill and the existing Source console/player moderation primitives. The
native fixture reported zero humans/four slots, then two bots after fill was
requested; restart retained private configuration. Human Join and human/bot
replacement acceptance remain separate. Windows self-hosted delivery also
needs its own acceptance before parity is claimed.

Coordinated SDK/mod download, staged update, rollback and daily discovery now
use the separate `open-fortress` installation target. The reviewed current
package is `alpha-2024-09-06-sdk-6982827-pb3`; unknown SDK/mod combinations
require compatibility review rather than automatic activation. Actual VPS
update, rollback and retained-package reapply passed, with native query,
bot counts, live time-limit controls and private configuration retention
checked after each transition. Daily discovery checks both the pinned SDK
branch and publisher mod metadata; deliberate rollback is not undone daily.
Do not point this edition at TF2's updater. Existing
operational profiles need their edition recipe corrected through the admin
profile save; no catalog or profile records are rewritten by deployment.

## Deus Ex HX update boundary (2026-10-15)

The `deus-ex-goty-edition` recipe maps to the `deus-ex` installation updater.
It stages the shared `System` directory and downloads only the reviewed public
HX 0.9.89.4 mod archive. Retail game assets are supplied separately and are not
redistributed by the updater. Private INI files and saves remain outside the
activation/rollback boundary. Private HX runtime files are checked against the
reviewed hashes during stopped-server preparation; unknown custom binaries
require review. Future releases must carry explicit prior/reverse compatibility
hashes so both private-runtime upgrade and rollback remain safe.

Daily publisher discovery, staged reinstallation and rollback passed on the VPS,
with actual native HX player queries before/after both transitions. New upstream
versions require a reviewed compatibility/checksum profile. Human Join testing
was removed from this work's release gates at the owner's request.

## GoldenEye and OpenRA update boundaries (2026-10-16)

GoldenEye uses reviewed package `5.0.6-sdk-195543-pb1` with coordinated SDK/mod
staging, rollback and private runtime refresh. Settings and generated Python
state remain private. The exact official mod archive must currently be seeded
in the verified cache because ModDB denied the VPS download; future SDK/mod
combinations need review. Native query and live time-limit controls passed.
Empty-server bot fill did not pass, so no new bot-fill control is exposed.

OpenRA public editions have separate targets: Official (`openra`), Combined
Arms (`combined-arms`), Romanov's Vengeance (`romanovs-vengeance`, catalog `ra2`,
mod `rv`), Tiberian Dawn HD (`tiberian-dawn-hd`, mod `cnc`) and Crystallized Nexus
(`crystallized-nexus`, mod `cn`). Nexus is pinned to the client's playtest-20260820;
its launcher-only releases are excluded. Missing editions never fall back to
stock OpenRA. All four new handlers passed actual update, rollback and daily
discovery; each additional OpenRA package passed its native handshake.
See the parity plan for evidence and remaining isolation/plugin/launcher gates.
