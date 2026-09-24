# Community server VPS audit — 2026-09-24

The [machine-readable results](community-hosting-audit-2026-09-24.json) cover the 32 recipes present on the live VPS plus Hypersomnia, whose recipe exists in the current checkout but had not reached the agent. This report deliberately excludes stale entries in the agent's persistent `spawn-tests.json`.

| Result | Count | Meaning |
| --- | ---: | --- |
| Spawn passed | 22 | Process bound its configured port and survived recipe startup checks. This is **not** a client Join or player-query pass. |
| Spawn failed | 7 | Bombsquad, Mindustry, OpenHV, Team Fortress 2, TripleA, Unvanquished, Warzone 2100; exact errors are in the JSON. |
| Binary not installed | 3 | Counter-Strike 2, Earth 2140 Trilogy, Teeworlds. |
| Recipe not deployed | 1 | Hypersomnia. |

No profile is verified for automatic rotation yet. The audit did not measure a live player-count curve or complete client Join tests. Missing data must remain unknown, never zero.

A second, loopback-only [staging resource run](community-hosting-resource-audit-2026-09-24.json) measured 21 of the spawn-passing recipes serially. Morrowind was excluded while a live room was occupied; RVGL was measured although it is not a catalog-hostable game. Every sample includes the full process group, a 1.5-second CPU delta, and resident memory. The largest observed sample was Veloren at 671 MiB RSS; the largest CPU observation was RVGL at 1.88 cores. These are one short startup/idle observations, not tested peak or per-player capacity envelopes. They must not be used to mark a profile verified or enable rotation. The staging run left zero audit processes.

The legacy spawn test left twelve test-only processes running (one Unvanquished tree and several OpenHV attempts). They were identified by their exact `PlayBound test` command lines, terminated without touching a pop-up Unvanquished room, and the cleanup was verified to report zero remaining test processes. The new agent launches rooms in their own process groups and no longer runs `fuser -k` against an audit port.

A loopback-only staging agent then started an OpenRA managed room, reported a process-group sample of about 1.22 CPU cores and 139 MB RSS during startup, reattached the **same PID** after its own agent restart, and stopped it. The process was confirmed absent afterward; the live agent remained active. This is one startup sample, not an idle/occupied load curve or Join test.
