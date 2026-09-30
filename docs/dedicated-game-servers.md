# Dedicated plan game servers

Games on the paid Dedicated plan whose server recipes live in
`platform/game-host/dedicatedRecipes.js`. They are **not** in `HOSTABLE_GAMES`
(`platform/src/lib/gameHost/catalog.ts`), so they do not switch on free party
hosting, community rotation or the Connect page. They appear in the admin's
tier game list at `/admin/hosting` and start only for a customer's own server.
See `DEDICATED_ONLY_GAMES` in that file.

**Status of every game here: recipe written from upstream documentation, not
yet started on the VPS.** Add each to the tier as `draft`, install it, start a
test server, then move it to `testing` and `verified` in `/admin/hosting`.
Sales stay closed until you decide otherwise.

Catalog slugs are assumed to be the ones below. Confirm each in `/admin/games`
before enabling: the recipe key, the profile key (`<slug>:base`) and the
catalog slug must be identical.

## Slot cap

The cap is the customer's purchased slots, sent as `settings.maxPlayers` and
applied through the game's own setting on every start:

| Game | Slug | Cap applied through | Source |
|---|---|---|---|
| Counter-Strike: Source | `counter-strike-source` | `-maxplayers N` | LinuxGSM `cssserver` start parameters |
| Terraria | `terraria` | `-maxplayers N` | Terraria `serverconfig.txt` |
| Unturned | `unturned` | `-maxplayers N` | LinuxGSM `untserver` start parameters |
| RimWorld Together | `rimworld-together` | `Configs/ServerConfig.json` `MaxPlayers` | Server refuses joins when full (`ServerNetwork.cs`) |
| Core Keeper | `core-keeper` | `data/ServerConfig.json` `maxNumberPlayers` | LinuxGSM game config |
| Vintage Story | `vintage-story` | `data/serverconfig.json` `MaxClients` | LinuxGSM game config |
| Factorio | `factorio` | `server-settings.json` `max_players` | LinuxGSM game config |

Each server keeps its files in its own `pb-<server id>` folder under the
agent's home (`<game>-servers/`), so one customer never shares a world.

## Installing on the VPS

Files go under `GAME_HOST_GAMES_DIR` (default `/opt/playbound-host/games`), one
folder per slug, owned by the `playbound` user. The recipe looks for these
binaries:

| Slug | Binary | Where the server comes from |
|---|---|---|
| `counter-strike-source` | `srcds_run` | SteamCMD app `232330` |
| `terraria` | `TerrariaServer` | Terraria dedicated server download (terraria.org) |
| `unturned` | `Unturned_Headless.x86_64` | SteamCMD app `1110390` |
| `rimworld-together` | `RTServer` | GitHub release of Rimworld-Together (self-contained linux-x64) |
| `core-keeper` | `CoreKeeperServer` | SteamCMD app `1963720` |
| `vintage-story` | `VintagestoryServer` | vintagestory.at server tarball |
| `factorio` | `bin/x64/factorio` | factorio.com headless build |

## What to confirm on the first test start

These are the parts written from documentation that this environment could not
run:

- **Counter-Strike: Source:** the `steamclient.so` link (`~/.steam/sdk32`). If the server reports LAN-only, the file is missing or in a different folder.
- **Terraria:** the server must keep running with no console attached (the agent keeps its input pipe open). Worlds are created on first start at `Worlds/world.wld`.
- **Unturned:** the per-server folder `Servers/pb-<id>` is created inside the shared install on first start.
- **Core Keeper:** whether `-datapath` picks up `data/ServerConfig.json`, and how players connect (it uses Steam relay unless a direct address is used).
- **Vintage Story:** the server fills in the rest of `serverconfig.json` on first load; confirm it keeps the port and player cap the agent wrote.
- **Factorio:** the `config.ini` layout (`read-data` / `write-data`) and that `--create` produced `saves/save.zip` before the server started.
- **All:** the slot cap actually refuses player N+1. Only then mark the game `verified`.

## Not yet done

| Game | Why |
|---|---|
| Barotrauma | Cap is `maxplayers` in `serversettings.xml`, but the server reads that file and its saves from its install directory, so per-customer isolation needs a copy or symlink layout first. |
| Don't Starve Together | Cap is `max_players` in `cluster.ini`, but each server needs a Klei cluster token. Decide whose token is used before writing the recipe. |
| Necesse | Cap is `slots` in `server.cfg`; the command-line switches were not verifiable from here. Needs the server's `-help` output. |
| Starbound | Cap is `maxPlayers` in `starbound_server.config`; the SteamCMD download needs an account that owns the game. |
| RimWorld Together backups | World data is the `Assets/` folder in the server's working directory. Not added to world backups yet. |
| Stardew Valley, Risk of Rain 2, Trackmania, ANEURISM IV, Witchbrook | No dedicated server found that could be verified from public documentation. Stardew's multiplayer host is the game itself; Witchbrook is not confirmed released. |

Backups (`platform/game-host/dedicatedDataBackups.js`) currently cover
Mindustry, OpenTTD, Luanti, Freeciv and Morrowind. Games with world data in
this list are Terraria (`Worlds/`), Factorio (`saves/`), Core Keeper
(`data/`), Vintage Story (`data/`) and RimWorld Together (`Assets/`). Add each
only after you have confirmed it.
