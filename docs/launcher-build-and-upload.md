# Launcher build and Blob upload

How PlayBound ships the desktop app. Follow this when the user says **build**, **upload**, **release the launcher**, or **dist:prod / dist:dev**.

Signing internals (certificates, eSigner budget, SmartScreen) live in [windows-code-signing.md](./windows-code-signing.md). This file is the **release procedure**.

The operator does **not** run a local Next.js server. Builds and uploads are CLI-only.

## Layout

| Piece | Where |
| --- | --- |
| Version | `launcher/package.json` `"version"` (electron-builder reads this) |
| Windows orchestrator | `launcher/scripts/build-windows.js` |
| electron-builder config | `launcher/electron-builder.js` (not `electron-builder.config.js`) |
| Upload | `platform/scripts/upload-launcher.ts` → `npm run upload:launcher` from **`platform/`** |
| Blob token | `BLOB_READ_WRITE_TOKEN` in `platform/.env.local` |
| Feed URL baked into the app | `publish[0].url` in `electron-builder.js` → `https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher/` |

Windows artifact names:

- Installer: `launcher/dist/PlayBound-Setup-<version>.exe`
- Portable: `launcher/dist/PlayBound-Launcher-Portable-<version>.exe`
- Signed update feed: `latest.yml` (public users)
- Unsigned update feed: `admin.yml` (admins and internal testers)
- Site aliases on Blob: `PlayBound-Launcher-Setup.exe` (public signed) and `PlayBound-Launcher-Setup-Admin.exe` (unsigned admin)

> [!IMPORTANT]
> **Channel Separation Policy:**
> - **Regular users must NEVER receive unsigned releases.** They listen to the `latest` channel (`latest.yml`), which only receives signed production builds.
> - **Admins and internal testers** have accounts linked with admin permissions and listen to the `admin` channel (`admin.yml`), allowing rapid iteration with unsigned builds.
> - Running `npm run upload:launcher` without `--prod` uploads **exclusively to the `admin` channel** (`admin.yml` and `PlayBound-Launcher-Setup-Admin.exe`), leaving the public channel untouched.
> - Only `npm run upload:launcher -- --prod` (for signed builds) or explicit `--promote-prod --i-know-its-unsigned` touches the public `latest.yml` / `PlayBound-Launcher-Setup.exe`.

Mac: `PlayBound-macOS-<version>.dmg` + `latest-mac.yml` / `admin-mac.yml`  
Linux: `PlayBound-Linux-<version>.AppImage` + `latest-linux.yml` / `admin-linux.yml`

## Always do this first

1. **Bump** `launcher/package.json` `"version"` (patch unless the user names a different bump). Auto-update will not pick up a rebuild of the same version.
2. **Commit and push** launcher + site changes the user asked to ship. Catalog recipes in `platform/src/lib/data/launcherInstall.ts` only reach a `dist:*` bundled catalog after production has them — `dist:dev` / `dist:prod` both run `scripts/sync-catalog.js`, which **overwrites** `launcher/catalog.js` from `https://playbound.club/api/launcher/catalog` (remote slug wins). If those recipe edits are not live yet, wait for the Vercel deploy, or skip sync and invoke electron-builder directly (see [Skip catalog sync](#skip-catalog-sync)).
3. Confirm `platform/.env.local` exists. If Blob upload later says the token is missing:

   ```powershell
   cd platform
   npx vercel env pull .env.local --environment=production
   ```

Do not commit `.env.local`, certificates, or passwords.

## Signed Windows (preferred public release)

eSigner is **metered (~5 signings per successful `dist:prod`)**. Failed attempts can still spend quota. Rehearse with `dist:dev` first. Do not run `dist:prod` “to see if it works.”

```powershell
cd launcher
npm run signing:status
$env:WINDOWS_CERT_SHA1 = "<thumbprint from signing:status>"
npm run dist:prod
```

`dist:prod` sets `WINDOWS_SIGNING_ENABLED=true`, then: sync catalog → `electron-builder --win` → `verify-signatures --required`.

Success looks like: `[signing] Mode: store`, then NSIS + portable artifacts, then verification OK. Output includes `latest.yml` (not `admin.yml`).

Upload from **`platform/`** (so Next loads `.env.local`):

```powershell
cd platform
npm run upload:launcher
```

With `latest.yml` present and `admin.yml` absent, that writes:

- `launcher/PlayBound-Setup-<version>.exe`
- `launcher/latest.yml`
- `launcher/PlayBound-Setup-<version>.exe.blockmap`
- `launcher/PlayBound-Launcher-Setup.exe` (site download alias)

Pass **`--prod`** explicitly. The upload script defaults to the admin channel; without `--prod` a signed build still lands only on `admin.yml` / `PlayBound-Launcher-Setup-Admin.exe`.

### VPS archive + R2 hot cache (required for site downloads)

Blob is the updater/CDN object store. **Site downloads that go through the R2 hot cache need the installer on the VPS file system first.**

`upload-launcher.ts` tries to register the artifact and archive it to the VPS, but that step needs `MONGODB_URI` and `GAME_HOST_SECRET`. Both are Vercel Sensitive env vars — `vercel env pull` cannot retrieve them — so the CLI almost always logs:

```text
Could not register the mirror artifact (upload itself succeeded): …
```

That is expected. Finish the release on production admin:

1. Open **[/admin/download-mirrors](https://playbound.club/admin/download-mirrors)**.
2. Use **Upload signed launcher** (`LauncherReleaseUploader`) with the built `PlayBound-Setup-<version>.exe` (same file you just signed).
3. Wait until status is **On the VPS** / `vpsStatus: verified`.
4. In the cache table, **Promote to R2** so the hot cache is seeded.

Do not treat a Blob-only upload as a complete production ship for the site installer path.

### eSigner / store signing failed

Typical log:

```text
The provided authorization grant is invalid, expired, revoked, ...
SignerSign() failed. (-2146893821/0x80090003)
```

SSL.com CKA / eSigner needs a fresh login (browser + TOTP). **Stop retrying `dist:prod`.** Tell the user signing is broken. If they still want a ship: use the unsigned path below.

`npx electron-builder --win` on this machine can exit 0 with almost no output. Prefer `npm run dist:prod` / `dist:dev`, or:

```powershell
node node_modules/electron-builder/cli.js --win
```

Older Windows PowerShell does not accept `&&`. Use `;` or separate commands. Set env vars with `$env:NAME = "value"`, not `NAME=value`.

## Unsigned Windows

Use for local iteration, or when signing is down and the user still wants a build uploaded.

```powershell
cd launcher
npm run dist:dev
```

This **forces** `WINDOWS_SIGNING_ENABLED=false` even if a cert is in the store. Produces `admin.yml`. SmartScreen will warn.

Upload **admin-only** (does not touch the public installer or `latest.yml`):

```powershell
cd platform
npm run upload:launcher
```

That writes `admin.yml` and `PlayBound-Launcher-Setup-Admin.exe`.

### Promote an unsigned build to the public channel

This overwrites `PlayBound-Launcher-Setup.exe` **and** `latest.yml`. Every site download and every auto-update client gets an unsigned binary. The script **refuses** unless you pass both flags:

```powershell
cd platform
npm run upload:launcher -- --promote-prod --i-know-its-unsigned
```

Existing **signed** installs may **reject** an unsigned update (electron-updater publisher check). Friends often need to run Setup by hand. Say that when you promote.

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

## Blob map

Base: `https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher/`

| File | Role |
| --- | --- |
| `PlayBound-Setup-<ver>.exe` | Versioned Windows installer |
| `PlayBound-Launcher-Setup.exe` | Stable site download (public) |
| `PlayBound-Launcher-Setup-Admin.exe` | Unsigned Windows |
| `latest.yml` | electron-updater, signed/public |
| `admin.yml` | electron-updater, unsigned |
| `*.blockmap` | Delta updates |

The site env var `NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL` should already point at the public alias. Only change it on Vercel if the printed URL from upload differs.

## Checklist (agent)

- [ ] Version bumped in `launcher/package.json`
- [ ] Relevant code committed/pushed if the user asked
- [ ] Tried **signed** `dist:prod` unless the user asked for unsigned or eSigner is known-broken
- [ ] Did not burn extra `dist:prod` attempts after a grant/token error
- [ ] Upload run from `platform/` with **`--prod`** for a public signed release
- [ ] **VPS + R2:** after Blob upload, tell the user (or use) **Upload signed launcher** on `/admin/download-mirrors`, then **Promote to R2** — CLI VPS archive usually fails without Sensitive env
- [ ] Unsigned public promote used `--promote-prod --i-know-its-unsigned` and the SmartScreen / auto-update caveat was stated
- [ ] Returned the versioned + alias URLs from the upload script
