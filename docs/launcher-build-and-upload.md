# Launcher build and release

How PlayBound ships the desktop app. Follow this when the user says **build**, **upload**, **release the launcher**, or **dist:prod / dist:dev**.

Signing internals (certificates, eSigner budget, SmartScreen) live in [windows-code-signing.md](./windows-code-signing.md). This file is the **release procedure**.

The operator does **not** run a local Next.js server.

## Layout

| Piece | Where |
| --- | --- |
| Version | `launcher/package.json` `"version"` (electron-builder reads this) |
| Windows orchestrator | `launcher/scripts/build-windows.js` |
| electron-builder config | `launcher/electron-builder.js` (not `electron-builder.config.js`) |
| **Public signed Windows ship** | Admin → [/admin/download-mirrors](https://playbound.club/admin/download-mirrors) → **Upload signed launcher** → **Promote to R2** |
| Unsigned / Mac / Linux Blob upload | `platform/scripts/upload-launcher.ts` → `npm run upload:launcher` from **`platform/`** |
| Update-feed URL helpers | `platform/src/lib/launcherUpdateFeed.ts` |
| Runtime updater feed | `https://playbound.club/api/launcher/updates/` (overrides electron-builder `publish.url`) |

Windows artifact names:

- Installer: `launcher/dist/PlayBound-Setup-<version>.exe`
- Portable: `launcher/dist/PlayBound-Launcher-Portable-<version>.exe`
- Signed update feed: `latest.yml` (public users)
- Unsigned update feed: `admin.yml` (admins and internal testers)
- Admin Blob alias: `PlayBound-Launcher-Setup-Admin.exe` (unsigned only)

> [!IMPORTANT]
> **Channel Separation Policy:**
> - **Regular users must NEVER receive unsigned releases.** They listen to the `latest` channel (`latest.yml`), which only receives signed production builds via Admin upload.
> - **Admins and internal testers** listen to the `admin` channel (`admin.yml`) from `npm run upload:launcher` (no `--prod`).
> - **Do not** use `upload:launcher -- --prod` for Windows. The script refuses it. Public signed Windows is Admin upload + Promote to R2 only.

Mac: `PlayBound-macOS-<version>.dmg` + `latest-mac.yml` / `admin-mac.yml`  
Linux: `PlayBound-Linux-<version>.AppImage` + `latest-linux.yml` / `admin-linux.yml`

## Always do this first

1. **Bump** `launcher/package.json` `"version"` (patch unless the user names a different bump). Auto-update will not pick up a rebuild of the same version.
2. **Commit and push** launcher + site changes the user asked to ship. Catalog recipes in `platform/src/lib/data/launcherInstall.ts` only reach a `dist:*` bundled catalog after production has them — `dist:dev` / `dist:prod` both run `scripts/sync-catalog.js`, which **overwrites** `launcher/catalog.js` from `https://playbound.club/api/launcher/catalog` (remote slug wins). If those recipe edits are not live yet, wait for the Vercel deploy, or skip sync and invoke electron-builder directly (see [Skip catalog sync](#skip-catalog-sync)).

Do not commit `.env.local`, certificates, or passwords.

## Signed Windows (public release)

eSigner is **metered (~5 signings per successful `dist:prod`)**. Failed attempts can still spend quota. Rehearse with `dist:dev` first. Do not run `dist:prod` “to see if it works.”

```powershell
cd launcher
npm run signing:status
npm run dist:prod
```

`dist:prod` auto-picks The Media Shop store cert when present, sets `WINDOWS_SIGNING_ENABLED=true`, then: sync catalog → `electron-builder --win` → `verify-signatures --required`.

Success looks like: `[signing] Mode: store`, then NSIS artifacts, then verification OK.

### Ship (entire public process)

1. Open **[/admin/download-mirrors](https://playbound.club/admin/download-mirrors)**.
2. **Upload signed launcher** with `launcher/dist/PlayBound-Setup-<version>.exe`.
3. Wait until status is **On the VPS** / `vpsStatus: verified`.
4. **Promote to R2** in the cache table.

That is the full public signed Windows release. The admin route:

- Archives the installer to the VPS (server-side `MONGODB_URI` / `GAME_HOST_SECRET`)
- Publishes `latest.yml` with a download URL ending in `.exe`
- Registers the mirror artifact for site `/api/launcher/download`

### `.exe` hard rule (electron-updater)

electron-updater names the cached installer from the **URL pathname**. If `latest.yml` points at `/api/launcher/download` with no filename, the cache file is literally named `download` and Windows asks what to open it with.

Public feeds **must** use:

`https://playbound.club/api/launcher/download/PlayBound-Setup-<version>.exe`

Guards: `platform/src/lib/launcherUpdateFeed.ts` (build + assert). Promote to R2 refuses launcher rows whose archive path omits the `.exe` filename.

### eSigner / store signing failed

Typical log:

```text
The provided authorization grant is invalid, expired, revoked, ...
SignerSign() failed. (-2146893821/0x80090003)
```

SSL.com CKA / eSigner needs a fresh login (browser + TOTP). **Stop retrying `dist:prod`.** Tell the user signing is broken. If they still want a ship: use the unsigned path below.

Older Windows PowerShell does not accept `&&`. Use `;` or separate commands. Set env vars with `$env:NAME = "value"`, not `NAME=value`.

## Unsigned Windows

Use for local iteration, or when signing is down and the user still wants a build uploaded.

```powershell
cd launcher
npm run dist:dev

cd ../platform
npm run upload:launcher
```

This **forces** `WINDOWS_SIGNING_ENABLED=false`. Produces `admin.yml` + `PlayBound-Launcher-Setup-Admin.exe`. Does **not** touch the public channel. Needs `BLOB_READ_WRITE_TOKEN` (`npx vercel env pull .env.local --environment=production` if missing).

### Promote an unsigned build to the public channel

Emergency only. Overwrites public `latest.yml`. The script **refuses** unless you pass both flags:

```powershell
cd platform
npm run upload:launcher -- --promote-prod --i-know-its-unsigned
```

Existing **signed** installs may **reject** an unsigned update. Prefer fixing signing and doing a normal Admin signed ship instead.

## Mac and Linux

Not signed through the Windows eSigner path. Promoting to the public aliases is the normal ship:

```powershell
cd launcher
npm run dist:mac
# or: npm run dist:linux

cd ../platform
npm run upload:launcher -- --mac --promote-prod
# or: npm run upload:launcher -- --linux --promote-prod
```

## Skip catalog sync

`build-windows.js` always syncs first. To pack the working-tree `catalog.js` (uncommitted path expansions, or production API still stale):

```powershell
cd launcher
$env:WINDOWS_SIGNING_ENABLED = "true"   # or "false"
$env:WINDOWS_CERT_SHA1 = "<thumbprint>" # signed only
node node_modules/electron-builder/cli.js --win
```

For signed: then `npm run verify:signatures -- --required`. After a skipped-sync build, do not commit a `catalog.js` that sync would have replaced unless the user wants that snapshot.

## Blob map (admin / fallback)

Base: `https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher/`

| File | Role |
| --- | --- |
| `PlayBound-Launcher-Setup-Admin.exe` | Unsigned Windows |
| `latest.yml` | electron-updater, signed/public (also written by Admin upload) |
| `admin.yml` | electron-updater, unsigned |
| `launcher/staged/PlayBound-Setup-<ver>.exe` | Staging object during Admin upload |

Site + updater prefer R2/VPS via `/api/launcher/download[/PlayBound-Setup-<ver>.exe]`.

## Checklist (agent)

- [ ] Version bumped in `launcher/package.json`
- [ ] Relevant code committed/pushed if the user asked
- [ ] Tried **signed** `dist:prod` unless the user asked for unsigned or eSigner is known-broken
- [ ] Did not burn extra `dist:prod` attempts after a grant/token error
- [ ] **Public signed:** Admin **Upload signed launcher** + wait verified + **Promote to R2** (no Windows `--prod` CLI)
- [ ] Update feed URL ends with `.exe`
- [ ] Unsigned admin upload used default channel (no `--prod`) when asked for admin-only
- [ ] Unsigned public promote used `--promote-prod --i-know-its-unsigned` and the SmartScreen / auto-update caveat was stated
