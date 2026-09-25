# Community server startup fixes — 2026-09-25

Follow-up to the [2026-09-24 audit](community-hosting-audit-2026-09-24.md). Each game below was re-run by hand on the VPS as the `playbound` user on a spare port, and every test process was stopped afterwards. "Starts" means the process bound its port. It does **not** mean a player query or client Join passed. No profile's verification state changed.

| Game | Root cause | Fix | Result |
| --- | --- | --- | --- |
| BombSquad | Ballistica 1.8 links libpython3.14; the VPS has 3.12 (`NameError: Self`) | Private Python 3.14.7 (python-build-standalone) in `/opt/playbound-host/python314`; wrapper and `install.sh` use it | Starts |
| Team Fortress 2 | Game libraries are 64-bit only; 32-bit `srcds_run` fails on `replay_srv.so`. Without a 64-bit `steamclient.so` it runs LAN-only | `srcds_run_64`, `-norestart`, `~/.steam/sdk64` link to a steamclient from a `playbound`-owned SteamCMD | Starts; A2S query on public IP returns map `ctf_2fort` |
| TripleA | `prod2-lobby.triplea-game.org` no longer resolves | Lobby URI `https://prod.triplea-game.org` (recipe, `install.sh`, VPS wrapper) | Starts, "Waiting for users to connect" |
| Warzone 2100 | 4.7 needs `--autohost=<id>.json`; **real player rooms were failing too** | Add `.json` | Starts (live agent updated) |
| OpenHV | `OpenHV.Server` is the client AppImage; without `--server` it hangs at "Loading mod" | AppImage detection adds `--server` | Starts in 5 s |
| Mindustry | Writes `./config` into a non-writable cwd | Per-room cwd under the host home | Starts |
| Unvanquished | 8-char home suffix collided with a leftover test instance ("Forwarding commands to existing instance") | Full sanitized id in homepath | Starts |
| Teeworlds | Installed by apt as `/usr/games/teeworlds-server`; recipe looked only for `teeworlds_srv` | Add binary name | Starts, registers with master |
| Earth 2140 | Not installed | OpenE2140 release-20260920 AppImage from GitHub | Starts in 5 s |
| Counter-Strike 2 | Not installed | SteamCMD app 730 (73 GB) downloading | Pending; needs a Game Server Login Token to be listed publicly |
| Hypersomnia | Not deployed; the old `hypersomnia.xyz` domain now redirects to a spam site | Headless AppImage from the project's current site, `hypersomnia.io` (also in `install.sh`) | Starts; registers with its master server |

Also fixed: version probes (`xonotic +version`, `ioq3ded +version`) started servers that never exit. An agent restart during probing orphaned them, because the unit uses `KillMode=process`. Six such processes, four of them Xonotic probes using CPU, had been running for 1–2 hours. They were killed, and probes now run under `timeout -s KILL`.
