# PlayBound Connect

PlayBound Connect is the multiplayer, dedicated-server, and transit stack. Discord is voice and chat. Connect is how friends actually land in the same game.

Home PCs often cannot accept inbound UDP/TCP (CGNAT, consumer NAT). Connect hosts the room on a public VPS. Every client connects **outbound**.

Read this file before changing join, hosting, connect args, adapters, or STUN/TURN.

## Five modes

Declared per game in [`platform/src/lib/multiplayer/adapters.ts`](../platform/src/lib/multiplayer/adapters.ts):

| Adapter | What happens |
|---|---|
| `managed-server` | Party Join Game provisions a dedicated process on the VPS. Launcher applies CLI connect args. |
| `virtual-lan` | LAN-discovery-only games (HoloCure). Party shares one ZeroTier segment; the game finds its own peers. |
| `playbound-native` | Custom P2P transport with room codes + STUN/TURN on the VPS. In-game join. No game ships on this today. |
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

If `connectArgs` is `null` (Hedgewars), the launcher sets `manualConnect` and copies `host:port` for in-game paste.

## Join Game → virtual LAN

A `virtual-lan` game has no server to spawn and no address to pass. It finds peers by
broadcasting on the local network, so Connect supplies the network instead.

```
POST /api/parties/:id/join-game
  → provisionPartyLan()  — ZeroTier Central creates a private per-party network
  → party.lan = { networkId, status }
  → launcher prepare-virtual-lan:
      zerotier-cli info        → this machine's node id
      zerotier-cli join <nwid>
      POST /api/parties/:id/lan { nodeId }   → controller authorizes the node
      wait for the adapter, resolve its Windows friendly name
      write that name into the game's adapterFile
  → player: Play → Multiplayer → use saved adapter → Host/Join LAN Session
```

Why ZeroTier and not WireGuard/Tailscale: discovery here is UDP broadcast, and only an L2
overlay carries broadcast. That is what `virtualLan.requiresBroadcast` records.

The last step stays manual on purpose — the mod has no CLI and no config for
host/join, so the launcher gets the player as far as the adapter and stops.

Key files:

- [`platform/src/lib/virtualLan/client.ts`](../platform/src/lib/virtualLan/client.ts) — ZeroTier Central API
- [`platform/src/lib/virtualLan/provision.ts`](../platform/src/lib/virtualLan/provision.ts) — attach/release, authorize a node
- [`platform/src/app/api/parties/[id]/lan/route.ts`](../platform/src/app/api/parties/[id]/lan/route.ts) — node authorization
- [`launcher/services/virtualLan.js`](../launcher/services/virtualLan.js) — CLI, join, adapter name, adapter file

Needs `ZEROTIER_API_TOKEN`. Without it `provisionPartyLan` no-ops and the party still
forms — same soft-fail contract as a down VPS.

On the player's machine the ZeroTier client must be installed, and its CLI reads a
secret only an administrator can open, so an unelevated launcher gets
`needsElevation` back rather than a network.

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

## How to add a virtual-LAN game

1. Adapter row in `adapters.ts` with `adapterType: "virtual-lan"`, plus `virtualLan.adapterFile`
   if the game persists its chosen adapter somewhere the launcher can write.
2. Nothing on the VPS and nothing in `HOSTABLE_GAMES` — there is no process to spawn.
3. Party Join Game from two machines on different networks. Confirm the adapter appears on
   both, that the host's session shows up in the client's LAN list, and that the game is
   actually playable across it, not just discoverable.

## How to add a hostable game

1. Adapter row in `adapters.ts` (`managed-server` or `direct-ip`).
2. Entry in `HOSTABLE_GAMES` (`catalog.ts`) with port range and protocol.
3. Matching spawn recipe in `game-host/recipes.js` and install the dedicated binary on the VPS.
4. CLI template in `launcher/services/connectArgs.js` (`null` if the client has no argv join).
5. Party Join Game from two machines. Confirm the process listens and the client lands in the room, not the main menu.

## Related admin

Games table has Install / Party health lights. Failures yellow a light. Live stream: `/admin/ops`. Auto-bugs stay on `/admin/bugs`.
