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

**Redeploy this service after pulling Master Adapter changes** — Vercel deploys
do not update the adapter. From the Render dashboard: Manual Deploy → Deploy
latest commit (root directory `platform/master-adapter`).

1. Web Service from this repo, root directory `platform/master-adapter`, Docker (or Node).
2. Env:
   - `MASTER_ADAPTER_KEY` — long random secret (required in production)
   - `PORT` — set by Render
   - Optional env fallbacks (prefer setting lobby login on the admin game page → Dedicated servers):
     - `ZEROK_LOBBY_USER` / `ZEROK_LOBBY_PASS` — Zero-K account (PasswordHash as used by Chobby)
     - `ZEROAD_LOBBY_JID` / `ZEROAD_LOBBY_PASSWORD` — 0 A.D. lobby account
     - `ZEROAD_LOBBY_ROOMS` — comma-separated MUC rooms (default `arena27,arena26,arena`)
3. Health check: `/health`
4. On Vercel:
   - `MASTER_ADAPTER_URL` — service URL (no trailing slash)
   - `MASTER_ADAPTER_KEY` — same secret

Lobby credentials from the catalog are forwarded as `x-playbound-lobby-user` /
`x-playbound-lobby-pass` on Zero-K and 0 A.D. requests.

### 0 A.D. listing flow

Modern XpartaMuPP does **not** answer an IQ get for the game list. The adapter:

1. Logs in with a resource that starts with `0ad` (e.g. `0ad-playbound`)
2. Joins versioned MUC rooms (`arena27`, `arena26`, `arena`)
3. Waits for pushed `jabber:iq:gamelist` IQs

Without credentials the API returns a single lobby pointer row. With credentials
configured, failures return an error + empty list (no fake lobby row).

## Games

| Slug | Kind |
|------|------|
| `xonotic` | dpmaster UDP + getstatus/getinfo |
| `unvanquished` | dpmaster UDP + getstatus/getinfo |
| `mindustry` | GitHub directory + UDP ping |
| `hedgewars` | TCP lobby (PROTO 59) |
| `battle-for-wesnoth` | TCP WML lobby |
| `warzone-2100` | HTTPS netlobby (GameId fallback) |
| `zero-k` | ZKS TCP (presence; battles with credentials) |
| `0ad` | XMPP MUC push (pointer without creds; full list with creds) |
| `veloren` | HTTP serverlist + UDP query_port ServerInfo |

HTTP-only titles (Beyond All Reason, OpenRA, OpenTTD, SuperTuxKart, …) are
fetched directly by Vercel providers — not this service.
