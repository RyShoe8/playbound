# PlayBound Master Adapter

Always-on Node service that polls UDP masters and TCP/XMPP lobbies, then exposes
normalized JSON for the PlayBound site (Vercel) via `fetchRemoteMaster`.

## Local

```bash
cd platform/master-adapter
npm install
MASTER_ADAPTER_KEY=dev npm start
# GET http://localhost:8787/health
# GET http://localhost:8787/v1/xonotic/servers -H "x-playbound-adapter-key: dev"
```

## Render

1. Web Service from this repo, root directory `platform/master-adapter`, Docker (or Node).
2. Env:
   - `MASTER_ADAPTER_KEY` — long random secret (required in production)
   - `PORT` — set by Render
   - Optional env fallbacks (prefer setting lobby login on the admin game page → Dedicated servers):
     - `ZEROK_LOBBY_USER` / `ZEROK_LOBBY_PASS` — Zero-K account (PasswordHash as used by Chobby)
     - `ZEROAD_LOBBY_JID` / `ZEROAD_LOBBY_PASSWORD` — 0 A.D. lobby account
3. Health check: `/health`
4. On Vercel:
   - `MASTER_ADAPTER_URL` — service URL (no trailing slash)
   - `MASTER_ADAPTER_KEY` — same secret

Lobby credentials from the catalog are forwarded as `x-playbound-lobby-user` /
`x-playbound-lobby-pass` on Zero-K and 0 A.D. requests.

## Games

| Slug | Kind |
|------|------|
| `xonotic` | dpmaster UDP |
| `unvanquished` | dpmaster UDP |
| `mindustry` | GitHub directory + UDP ping |
| `hedgewars` | TCP lobby |
| `battle-for-wesnoth` | TCP WML lobby |
| `warzone-2100` | HTTPS netlobby (GameId fallback) |
| `zero-k` | ZKS TCP (presence; battles with credentials) |
| `0ad` | XMPP (pointer; full list with credentials) |

HTTP-only titles (Veloren, Beyond All Reason, OpenRA, …) are fetched directly by Vercel providers — not this service.
