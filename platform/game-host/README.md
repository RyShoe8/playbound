# PlayBound game-host

Long-lived agent on the public VPS. When someone creates a party for a
listen-server game (OpenRA, OpenTTD, …), the site asks this agent to start a
dedicated process. Everyone connects **outbound** to `IP:port`.

## One-time setup (Ubuntu 24.04)

SSH in as root, clone the repo (or copy this folder), then:

```bash
cd /path/to/Site/platform/game-host
sudo bash install.sh
# optional heavier titles:
# sudo bash install.sh --with-heavy
```

The script installs apt dedicated servers, OpenRA + Mindustry binaries,
opens `ufw` ports, and starts `playbound-game-host`.

You can set the secret yourself (same string as Vercel) so you never have to
read it back off the box:

```bash
sudo GAME_HOST_SECRET='your-long-random-string' bash install.sh
```

Contabo’s customer panel has a **browser console / VNC** if you cannot SSH
from your PC. Paste the install there once.

Git push to Vercel cannot SSH into the VPS or replace apt/systemd. After the
agent on the box includes `ensureGame.js` (one `install.sh` + restart), each
**production build** runs `npm run sync:game-host`, which calls
`POST /ensure-missing` so downloadable dedicated binaries (ET: Legacy
`etlded`, …) install without another SSH. A daily cron
(`/api/cron/game-host-ensure`) is the backup. Apt packages and firewall rules
still need `install.sh`.

## Vercel env (Production)

Copy from `/etc/playbound-game-host.env` on the box:

| Key | Value |
|-----|--------|
| `GAME_HOST_URL` | `http://YOUR_VPS_IP:8741` |
| `GAME_HOST_SECRET` | same as `GAME_HOST_SECRET` on the VPS |
| `GAME_HOST_PUBLIC_IP` | the VPS public IPv4 |

No trailing slash on the URL. HTTP is fine; the shared secret is the gate.

## Contabo panel

If Contabo shows a network firewall, allow:

- `22/tcp` SSH
- `8741/tcp` agent
- `3478/udp` and `3478/tcp` coturn STUN/TURN
- `49152:50152/udp` coturn TURN relay fallback range
- UDP/TCP ranges printed at the end of `install.sh` (OpenRA 1234–1250/tcp, OpenArena 27960–27980/udp, ET 27950–27959/udp, …)

## Wolfenstein: Enemy Territory

Preferred path once the agent supports ensure:

1. Deploy site code that includes `ensureGame.js` + `/ensure-missing`.
2. On the VPS **once**: copy the updated agent (`install.sh` or manual `cp` of
   `index.js` / `recipes.js` / `ensureGame.js`) and
   `sudo systemctl restart playbound-game-host`.
3. Next production Vercel build (or `POST /api/cron/game-host-ensure`) downloads
   `etlded` + `etmain` if missing. Confirm
   `curl …/health` shows `wolfenstein-enemy-territory: true`.

First party Join Game can also trigger ensure if the binary is still missing
(room create waits up to ~5 minutes).

`install.sh` still installs ET the same way for a full bootstrap. Override URLs
if a new release bumps the download file ids:

```bash
sudo ET_LEGACY_LINUX_URL='https://www.etlegacy.com/download/file/728' \
     bash install.sh
```

## Check

```bash
curl http://YOUR_VPS_IP:8741/health
sudo systemctl status playbound-game-host
sudo journalctl -u playbound-game-host -f
```

`health.games` lists which dedicated binaries the agent found. A `false` game
will fail party provision until you install it. Freedoom uses `zandronum-server`
or `chocolate-server` — `install.sh` and `ensureGame.js` install Zandronum 3.2
dedicated server and Freedoom Phase 1+2 IWADs.

## Games this host covers

Installed by default (must show `true` in `/health` after `install.sh`):
OpenRA, OpenTTD, Luanti/Minetest, Mindustry, YSoccer (built from source if the
GitHub release asset is missing), Hedgewars (`hedgewars-server`), Warzone 2100,
Freeciv, BZFlag, SuperTuxKart, OpenArena, TripleA, 0 A.D., Mr. Boom, Xonotic,
Wolfenstein: Enemy Territory (`etlded`), Freedoom (`zandronum-server`), and OpenMOHAA (`omohaaded`). OpenMOHAA's
licensed `main/Pak*.pk3` data must be copied from an owned MOHAA installation;
`install.sh` installs only the open-source dedicated binary.

Skip Xonotic with `SKIP_XONOTIC=1`. Unvanquished stays manual (updater tree).

**Not VPS-hosted** (adapters are `direct-ip` / lobby — party Join Game will not
spawn a dedicated process): KeeperFX, Marathon / Aleph One, TES3MP, Wesnoth,
FlightGear, Unvanquished, Beyond All Reason, Zero-K, and closed
platforms.
