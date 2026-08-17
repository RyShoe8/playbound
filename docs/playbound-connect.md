# PlayBound Connect

PlayBound Connect is the multiplayer, dedicated-server, and transit stack. Discord is voice and chat. Connect is how friends actually land in the same game.

Home PCs often cannot accept inbound UDP/TCP (CGNAT, consumer NAT). Connect hosts the room on a public VPS. Every client connects **outbound**.

Read this file before changing join, hosting, connect args, adapters, or STUN/TURN.

## Four modes

Declared per game in [`platform/src/lib/multiplayer/adapters.ts`](../platform/src/lib/multiplayer/adapters.ts):

| Adapter | What happens |
|---|---|
| `managed-server` | Party Join Game provisions a dedicated process on the VPS. Launcher applies CLI connect args. |
| `playbound-native` | Custom P2P (HoloCure): 6-char room codes + STUN/TURN on the VPS. In-game join. |
| `direct-ip` | CLI join to an address PlayBound already knows. Not auto-provisioned unless the slug is also in `HOSTABLE_GAMES`. |
| `official` | Party presence and launch only. The game's own network stays theirs (CS2, Valorant, LoL, …). |

Public `/servers` is a **separate** path: discovery of existing community masters via [`platform/src/lib/servers/registry.ts`](../platform/src/lib/servers/registry.ts) and the Master Adapter on Render. It is not party hosting.

## Join Game → spawn

```
POST /api/parties/:id/join-game
  → provisionPartyHost() if the slug is hostable
  → POST GAME_HOST_URL/rooms  (VPS game-host agent)
  → party.hosted = { status, host, port }
  → playbound://join/{slug}?host=&port=
  → launcher playGame() substitutes connectArgs.js
  → child_process spawn
```

If `connectArgs` is `null` (Hedgewars, HoloCure), the launcher sets `manualConnect` and copies `host:port` for in-game paste.

Key files:

- [`platform/src/lib/playTogether/party.ts`](../platform/src/lib/playTogether/party.ts) — party mutations, `joinPartyGame`
- [`platform/src/lib/gameHost/provision.ts`](../platform/src/lib/gameHost/provision.ts) — attach/release VPS room
- [`platform/src/lib/gameHost/catalog.ts`](../platform/src/lib/gameHost/catalog.ts) — `HOSTABLE_GAMES`
- [`platform/game-host/recipes.js`](../platform/game-host/recipes.js) — spawn recipes on the VPS (**must stay in sync** with `HOSTABLE_GAMES`)
- [`launcher/services/connectArgs.js`](../launcher/services/connectArgs.js) — **authoritative** CLI join for hosted slugs (overrides the install record)
- [`platform/src/lib/launcher.ts`](../platform/src/lib/launcher.ts) — `launcherJoinUrl()`
- [`launcher/services/deepLinks.js`](../launcher/services/deepLinks.js) — `playbound://join/...`

## Transit

- Party hosted rooms: everyone connects outbound to `GAME_HOST_PUBLIC_IP:port`.
- P2P titles: coturn STUN/TURN on the VPS (`:3478`). See [`platform/src/lib/multiplayer/sessionManager.ts`](../platform/src/lib/multiplayer/sessionManager.ts).
- Master Adapter (Render): polls UDP/TCP game masters for the public server browser. Not used for party rooms.

VPS agent ops (install, firewall, env names — not secret values): [`platform/game-host/README.md`](../platform/game-host/README.md).

Limits (defaults): max concurrent VPS rooms `GAME_HOST_MAX_ROOMS` (8), idle party timeout 4h, party max size 8.

## How to add a hostable game

1. Adapter row in `adapters.ts` (`managed-server` or `direct-ip`).
2. Entry in `HOSTABLE_GAMES` (`catalog.ts`) with port range and protocol.
3. Matching spawn recipe in `game-host/recipes.js` and install the dedicated binary on the VPS.
4. CLI template in `launcher/services/connectArgs.js` (`null` if the client has no argv join).
5. Party Join Game from two machines. Confirm the process listens and the client lands in the room, not the main menu.

## Related admin

Games table has Install / Party health lights. Failures yellow a light. Live stream: `/admin/ops`. Auto-bugs stay on `/admin/bugs`.
