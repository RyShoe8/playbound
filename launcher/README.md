# PlayBound Launcher

Electron desktop app for discovering, installing, updating, and launching free
PC games and servers. Handles the `playbound://` deep-link protocol used by the
website.

## Requirements

- Node.js 20+
- Windows (for building Windows releases and verifying signatures)

## Development

```bash
npm install
npm start
```

Useful checks:

```bash
npm run test:resolve      # exercise game path resolution
npm run test:deep-link    # exercise playbound:// handling
npm run sync-catalog      # refresh the bundled offline catalog
```

## Building

| Command | Output | Signed |
| --- | --- | --- |
| `npm run dist:dev` | `dist/` | No — never, even with a certificate installed |
| `npm run dist:prod` | `dist/` | Yes — required, and verified before the build succeeds |
| `npm run dist` | `dist/` | Only if signing credentials happen to be present |

Both targets are produced: the NSIS installer
(`PlayBound-Setup-<version>.exe`) and the portable build
(`PlayBound-Launcher-Portable-<version>.exe`).

Build configuration lives in [`electron-builder.js`](electron-builder.js).

> That filename matters. electron-builder discovers `electron-builder.js` — not
> `electron-builder.config.js` — and a `build` key in `package.json` would take
> precedence over it entirely. If either changes, the config is silently ignored
> and the build falls back to defaults. The tell is a packaged exe named
> `playbound-launcher.exe` instead of `PlayBound.exe`.

## Release Signing

Production Windows releases are signed as **The Media Shop, LLC** — the legal
entity the code-signing certificate must be issued to, and the publisher name
Windows shows users in the UAC prompt and the file's Digital Signatures tab.

Signing happens automatically. There are no manual steps once a certificate is
installed and a few environment variables are set — no application code changes
are needed to switch certificates, or to move between a standard and an EV
certificate.

**Full guide: [`docs/windows-code-signing.md`](../docs/windows-code-signing.md)**

### How the pipeline behaves

```
sync catalog  →  build + sign  →  verify every binary  →  release
```

- **Development builds are never signed.** `dist:dev` forces signing off.
- **Production builds must be signed.** `dist:prod` fails if credentials are
  missing, if signing fails, or if any shipped binary fails verification.
- **Everything shipped is signed** — installer, portable build, app executable,
  uninstaller, the `elevate.exe` helper, and Electron's bundled native binaries.
- **Missing credentials never block a normal build.** With nothing configured,
  builds still succeed and simply produce unsigned artifacts.

### Check the current state

```bash
npm run signing:status
```

Reports which certificates are visible to the machine, how the environment
resolves, and whether the next production build would succeed. It never prints
secrets.

### Set up signing

Standard certificate (`.pfx` file):

```powershell
$env:WINDOWS_CERT_PATH = "$env:USERPROFILE\.certs\playbound.pfx"
$env:WINDOWS_CERT_PASSWORD = "…"
npm run dist:prod
```

EV certificate (hardware token, selected from the Windows certificate store):

```powershell
$env:WINDOWS_CERT_SHA1 = "A1B2C3D4…"
npm run dist:prod
```

Main environment variables — see the
[full reference](../docs/windows-code-signing.md#environment-variables):

| Variable | Purpose |
| --- | --- |
| `WINDOWS_SIGNING_ENABLED` | `true` = required · `false` = never · unset = sign if credentials exist |
| `WINDOWS_CERT_PATH` / `WINDOWS_CERT_PASSWORD` | Standard certificate |
| `WINDOWS_CERT_SHA1` | EV certificate thumbprint |
| `WINDOWS_TIMESTAMP_SERVER` | Timestamp server override |
| `WINDOWS_PUBLISHER_NAME` | Publisher override — needed if the certificate subject ever changes |

### Verify a build

```bash
npm run verify:signatures
```

Runs automatically as part of `dist:prod`. Checks the installer, the portable
build, and every executable and native binary the installer unpacks, reporting
the signer and confirming each signature is timestamped.

### Security

Certificates and passwords are **never** committed and never hardcoded. All
credentials come from the environment; `.gitignore` blocks `*.pfx`, `*.p12`,
`*.cer`, `*.key`, `certs/`, `secrets/`, and `.env.signing*` as a backstop.

A leaked signing key lets anyone publish malware attributed to PlayBound, and
the only fix is revoking and re-purchasing the certificate. Store certificates
outside the repository on encrypted media, and rotate immediately on any
suspected exposure.

## Auto-updates

The launcher updates itself via `electron-updater` against the generic feed
configured in `electron-builder.js`.

`electron-updater` verifies that an update is signed by the same publisher as
the installed build. Existing unsigned installs will accept the first signed
release without issue, but once users are on signed builds a change to the
certificate's subject name will cause updates to be rejected. See
[certificate changes and auto-updates](../docs/windows-code-signing.md#certificate-changes-and-auto-updates)
before renewing with different details or switching CA.
