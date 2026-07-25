# PlayBound Master Adapter (UDP / dpmaster)

Small always-on Node service that polls UDP game masters and exposes normalized
JSON for the PlayBound site (Vercel) to consume.

## Local

```bash
cd platform/master-adapter
MASTER_ADAPTER_KEY=dev npm start
# GET http://localhost:8787/health
# GET http://localhost:8787/v1/xonotic/servers -H "x-playbound-adapter-key: dev"
```

## Render

1. New **Web Service** from this repo, root directory `platform/master-adapter`, Docker.
2. Set env:
   - `MASTER_ADAPTER_KEY` — long random secret
   - `PORT` — Render sets this automatically
3. Health check path: `/health`
4. On Vercel (PlayBound), set:
   - `MASTER_ADAPTER_URL` — e.g. `https://playbound-master-adapter.onrender.com`
   - `MASTER_ADAPTER_KEY` — same secret

Games served: `xonotic`, `unvanquished`.
