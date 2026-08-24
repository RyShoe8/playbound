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
from your PC. Paste the install there once. Git push to Vercel does not
install anything on the VPS.

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
- UDP/TCP ranges printed at the end of `install.sh` (OpenRA 1234–1250/udp, etc.)

## Check

```bash
curl http://YOUR_VPS_IP:8741/health
sudo systemctl status playbound-game-host
sudo journalctl -u playbound-game-host -f
```

`health.games` lists which dedicated binaries the agent found. A `false` game
will fail party provision until you install it. Freedoom needs `odamex-server`
or `zandronum-server` on this box — `install.sh` does not install those, so
party Join Game will say the PlayBound game server does not have Freedoom yet
until they are apt-installed here. That is not a Vercel change.

GoldenEye: Source runs a real Windows `srcds.exe` under Wine + Xvfb — the
Source SDK 2007 engine branch never got a native Linux dedicated server.
`install.sh` handles the engine itself automatically (Steam appid 310 via
anonymous SteamCMD, not ModDB, so nothing is blocked) and writes the
`run-server` wrapper that starts it headless. The one thing it cannot stage
is the mod content: ModDB fronts every GE:S download, client and dedicated
server alike, with bot protection that 403s a scripted fetch. See the
comment in `install.sh` above the GoldenEye: Source block for the one-time
manual step — extracting `gesource/` from the server archive onto this box.
`health.games.goldeneye-source` flips true once both `gesource/` and
`run-server` exist.

## Games this host covers

Installed by default: OpenRA, OpenTTD, Luanti/Minetest, Mindustry, Hedgewars,
Warzone 2100, Freeciv, BZFlag, SuperTuxKart, OpenArena.

Optional (`--with-heavy`): Xonotic. Unvanquished is registered but not
auto-installed (large updater-based tree).

Not hosted here: official/closed platforms, 0 A.D. / BAR / Zero-K / Wesnoth
lobbies (those use their own matchmaking).
