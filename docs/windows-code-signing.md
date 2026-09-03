# Windows Code Signing

How PlayBound signs its Windows launcher, how to set it up, and how to verify it worked.

**To bump, build, and upload to Blob (signed or unsigned), follow [launcher-build-and-upload.md](./launcher-build-and-upload.md).** This file is the signing setup, not the release checklist.

The build pipeline is already configured. Once a certificate is installed and a
few environment variables are set, `npm run dist:prod` produces signed,
verified artifacts with no further changes to any code.

> ### Signing identity and plan
>
> PlayBound releases are signed as **The Media Shop, LLC**, using an
> **SSL.com OV certificate with eSigner cloud signing**.
>
> **Signings are metered: 240 per year (~20/month, unused roll over).** That
> budget drives two defaults — native binary signing is off, and `npm run dist`
> never signs. See [Signing budget](#signing-budget).
>
> The certificate must be issued to that exact legal entity — the name Windows
> shows users in the UAC prompt and the file's Digital Signatures tab comes
> straight from the certificate's subject, not from anything in this repo.
> When purchasing, make sure the CA vets and issues under *The Media Shop, LLC*
> (including the comma and `LLC`), and keep that name identical across renewals
> so SmartScreen reputation and auto-updates carry over.

- [Signing budget](#signing-budget)
- [How Windows code signing works](#how-windows-code-signing-works)
- [Standard vs EV certificates](#standard-vs-ev-certificates)
- [Buying a certificate](#buying-a-certificate)
- [Storing certificates](#storing-certificates)
- [Installing a certificate](#installing-a-certificate)
- [Environment variables](#environment-variables)
- [Signing locally](#signing-locally)
- [Signing in GitHub Actions](#signing-in-github-actions)
- [Verifying a signed executable](#verifying-a-signed-executable)
- [SmartScreen reputation](#smartscreen-reputation)
- [Troubleshooting](#troubleshooting)
- [Best practices](#best-practices)

---

## Signing budget

Unlike a traditional certificate — where the private key sits on your disk or a
token and signing is free and unlimited — **eSigner meters every signature**.
The plan allows **240 signings per year (~20/month)**, and unused signings roll
over while the certificate is active.

One release signs several files, not one:

| Setting | Signings per release | Releases/year |
| --- | --- | --- |
| **Default** (`npm run dist:prod`) | **~4** | **~60** |
| With Portable (`npm run dist:portable`) | ~5 | ~48 |
| Native binaries included (`WINDOWS_SIGN_ALL_BINARIES=true`) | ~10 | ~24 |

The four standard files are: `PlayBound.exe`, `elevate.exe`, the generated uninstaller,
and the `PlayBound-Setup-<version>.exe` NSIS installer. Bundled third-party binaries
(`ViGEmBus_Setup.exe` and `7za.exe`) are skipped by `launcher/scripts/custom-sign.js`
because ViGEmBus is already signed by its vendor and 7za is an internal helper, saving
valuable quota. Building portable adds `PlayBound-Launcher-Portable-<version>.exe` (+1).

**Why native signing is off by default.** Those DLLs are stock Electron
binaries, not our code. Signing them helps with enterprise allow-listing and
some AV heuristics, but it more than doubles the per-release cost and cuts the
release budget from ~48/year to ~21. For a consumer app the trade is rarely
worth it. Turn it on deliberately if a specific deployment scenario needs it.

**Why `npm run dist` never signs.** Signing runs only via `npm run dist:prod`.
An earlier design signed automatically whenever credentials were present, which
meant anyone with the environment variables set in their shell could burn ~5
signings by running `dist` to check something unrelated. On a metered plan that
is a live footgun, so signing is now strictly opt-in.

**Failed builds still consume signings.** If a build signs four files and then
fails on the fifth, those four are spent. Rehearse with `npm run dist:dev`
(free, never signs) before running a real release.

To see the current cost at any time:

```bash
npm run signing:status
```

It prints the per-build cost, the implied releases per year, and how to change
it. `npm run dist:prod` also reports signings consumed once verification passes.

> **Worth confirming with SSL.com**, as their documentation does not state it:
> whether a "signing" is counted per file or per API call, whether failed
> signing attempts count against quota, and whether exceeding the quota is a
> hard stop or an overage charge. All three affect the numbers above.

---

## How Windows code signing works

Code signing attaches a cryptographic signature to an executable that proves
two things: **who published it** (identity) and **that it has not been modified
since** (integrity). It does not certify that the software is safe — only that
it genuinely came from the named publisher and arrived intact.

The mechanics:

1. A Certificate Authority (CA) verifies your legal identity and issues a
   certificate binding your organisation's name to a public key.
2. At build time, `signtool.exe` hashes the executable, encrypts the hash with
   your private key, and embeds that signature plus your certificate into the
   file's Authenticode structure.
3. On the user's machine, Windows recomputes the hash, decrypts the signature
   using the public key in the embedded certificate, and confirms they match.
   It then walks the certificate chain up to a root CA in the Windows Trusted
   Root store.

If any link fails — file modified, chain broken, certificate revoked or expired
— Windows treats the file as untrusted.

### Why timestamping matters

Certificates expire, typically after one to three years. Without a timestamp,
every signature made with a certificate stops validating the day that
certificate expires, including on builds users already installed.

A timestamp is a countersignature from a trusted time authority asserting *when*
the signing happened. Windows then validates the signature against the
certificate's status **at signing time**, so correctly timestamped builds keep
working indefinitely.

Our config always timestamps, via `WINDOWS_TIMESTAMP_SERVER` (default
`http://timestamp.digicert.com`). `verify-signatures.js` warns loudly if any
artifact ends up without one — usually a sign the timestamp server was
unreachable during the build.

### What gets signed here

Everything that reaches a user's disk:

| Artifact | Why |
| --- | --- |
| `PlayBound-Setup-<version>.exe` | The NSIS installer users download |
| `PlayBound-Launcher-Portable-<version>.exe` | The portable build |
| `PlayBound.exe` | The app executable the installer writes to disk |
| `__uninstaller-nsis-*.exe` | Generated uninstaller |
| `elevate.exe` | NSIS privilege-elevation helper |
| `ffmpeg.dll`, `libEGL.dll`, `vulkan-1.dll`, `*.node`, … | Electron's bundled native binaries |

Signing the installer alone is not enough: enterprise allow-listing and some
AV heuristics inspect the unpacked payload. Native binary signing can be turned
off with `WINDOWS_SIGN_ALL_BINARIES=false` if build time becomes a problem.

---

## Standard vs EV certificates

|  | **Standard (OV)** | **EV (Extended Validation)** |
| --- | --- | --- |
| Cost / year | ~$100–400 | ~$250–600 |
| Vetting | Business existence check | Deeper legal, physical, operational vetting |
| Private key | `.pfx` file you hold | Hardware token / HSM — key cannot be exported |
| SmartScreen | Builds reputation gradually | **Immediate** trust, no warning period |
| CI/CD | Straightforward (file + password) | Harder — needs the token or a cloud HSM |
| Issuance | Hours to days | Days to weeks |

**The practical difference is SmartScreen.** With a standard certificate, early
downloads still show "Windows protected your PC" until enough installs
accumulate reputation — which can take weeks and a few hundred downloads. An EV
certificate skips that entirely from the first signed build.

**Recommendation:** if unsigned-download friction is currently costing installs,
EV pays for itself. If releases are infrequent and slow reputation growth is
acceptable, a standard certificate is fine. This pipeline supports both with no
code changes — only environment variables differ.

> **Note on EV in CI:** the private key lives on a physical token, so a plain
> GitHub-hosted runner cannot use it. The options are a self-hosted runner with
> the token attached, or a cloud signing service (Azure Trusted Signing,
> DigiCert KeyLocker, SSL.com eSigner). electron-builder 25 has built-in Azure
> Trusted Signing support via `azureSignOptions` if you go that route.

---

## Buying a certificate

Reputable CAs and resellers:

- **DigiCert** — the most expensive, best tooling, KeyLocker cloud signing.
- **Sectigo** (formerly Comodo) — widely used, mid-priced.
- **SSL.com** — competitive, eSigner cloud signing for CI.
- **Certera / SignMyCode / The SSL Store** — resellers, often materially cheaper
  for the same underlying Sectigo or DigiCert certificate.

You will need, as an organisation:

- **Legal entity registration for The Media Shop, LLC** — the name on the
  certificate must match the registered entity exactly, since that is what
  Windows displays to users
- A verifiable business phone listing (D-U-N-S, Google Business, or similar)
  under that same entity name
- Proof of address
- Someone available to answer the verification call

> Check the issued certificate's subject before the first release. If the CA
> issues under a variant (`The Media Shop LLC` without the comma, or a DBA), that
> variant becomes the publisher name users see and the value auto-updates key
> off — decide deliberately rather than discovering it after shipping.

Sole traders and individuals can obtain standard certificates from some CAs
with government ID, but EV generally requires a registered entity.

> Budget real calendar time. EV vetting routinely takes one to three weeks. Start
> before you need it.

---

## Storing certificates

**Certificates must never enter the repository.** A leaked signing key lets
anyone publish malware attributed to PlayBound, and the only remedy is
revocation and re-purchase — plus every build signed with it becomes suspect.

The root `.gitignore` blocks `*.pfx`, `*.p12`, `*.pvk`, `*.cer`, `*.key`,
`certificates/`, `certs/`, `secrets/`, and `.env.signing*`. Treat that as a
safety net, not permission to keep certificates near the working tree.

Where they should live:

| Context | Location |
| --- | --- |
| Local (standard) | Outside the repo, e.g. `%USERPROFILE%\.certs\playbound.pfx`, on an encrypted volume |
| Local (EV) | Hardware token; the key never exists as a file |
| CI (standard) | GitHub Actions secret, base64-encoded |
| CI (EV) | Self-hosted runner with token, or a cloud signing service |
| Backup | Encrypted password manager or offline encrypted media, access-logged |

Never send a `.pfx` over email or Slack, never commit one "temporarily", and
rotate immediately if either happens.

---

## Installing a certificate

### SSL.com eSigner (our setup)

eSigner keeps the private key in a cloud HSM — there is no `.pfx` and no
hardware token. The bridge is **eSigner CKA (Cloud Key Adapter)**, a Windows
application that acts as a virtual token and loads the certificate into the
Windows certificate store, letting `signtool.exe` sign against the cloud HSM.

The practical consequence: **the ordinary certificate-store path works
unchanged.** No custom signing hook, no `CodeSignTool` wiring, and nothing in
`electron-builder.js` needs to change.

1. Install eSigner CKA from [SSL.com Downloads](https://www.ssl.com/downloads/)
   and sign in with your SSL.com credentials plus TOTP.
2. Confirm the certificate is visible and read its thumbprint:

   ```bash
   npm run signing:status
   ```

3. Set the thumbprint and build:

   ```powershell
   $env:WINDOWS_CERT_SHA1 = "…"
   npm run dist:prod
   ```

Because CKA is store-backed rather than token-backed, this also works on
GitHub-hosted runners — the usual "EV signing needs a self-hosted runner"
constraint does not apply. See
[Cloud Code Signing Automation with CI/CD Services](https://www.ssl.com/guide/code-signing-automation/).

New certificates include 30 days of free eSigner, which is enough to exercise
the whole pipeline before paying for a subscription.

### Standard (.pfx file)

No installation is strictly required — the build reads the file directly. Just
place it somewhere safe outside the repo and point `WINDOWS_CERT_PATH` at it.

To install it into the Windows certificate store instead (which lets you use
thumbprint selection):

```powershell
Import-PfxCertificate -FilePath "$env:USERPROFILE\.certs\playbound.pfx" -CertStoreLocation Cert:\CurrentUser\My -Password (Read-Host -AsSecureString "PFX password")
```

### EV (hardware token)

1. Install the token vendor's middleware (SafeNet Authentication Client, or the
   CA's equivalent).
2. Plug in the token and unlock it with its PIN.
3. Confirm Windows can see the certificate:

```powershell
Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.EnhancedKeyUsageList.FriendlyName -contains 'Code Signing' } | Format-List Subject, Thumbprint, NotAfter
```

Copy the `Thumbprint` value into `WINDOWS_CERT_SHA1`. Spaces and stray
formatting characters are stripped automatically, so pasting straight from
`certmgr.msc` is fine.

Or just run:

```bash
npm run signing:status
```

which lists every code-signing certificate on the machine with its thumbprint,
expiry, and whether the private key is present.

---

## Environment variables

| Variable | Purpose |
| --- | --- |
| `WINDOWS_SIGNING_ENABLED` | `true` = signing required (build fails without it) · `false`/unset/`auto` = never sign, even if credentials exist — signing is opt-in |
| `WINDOWS_CERT_PATH` | Path to `.pfx`/`.p12`. Selects **standard** mode. |
| `WINDOWS_CERT_PASSWORD` | Password for that `.pfx`. |
| `WINDOWS_CERT_SHA1` | Certificate thumbprint in the Windows store. Selects **EV** mode. Separators are stripped. |
| `WINDOWS_CERT_SUBJECT_NAME` | Alternative EV selector by subject name. |
| `WINDOWS_TIMESTAMP_SERVER` | RFC 3161 timestamp URL. Default `http://timestamp.digicert.com`. |
| `WINDOWS_PUBLISHER_NAME` | Publisher name override — for PlayBound, `The Media Shop, LLC`. Normally unnecessary: electron-builder reads it from the certificate. Set it when it cannot be derived, or when the certificate subject changes (see [auto-updates](#certificate-changes-and-auto-updates)). |
| `WINDOWS_SIGN_ALL_BINARIES` | `false` to sign only executables, skipping `.dll`/`.node`. Default `true`. |
| `WINDOWS_EXPECTED_PUBLISHER` | Optional guard. When set (e.g. `The Media Shop, LLC`), verification fails if artifacts were signed by a different publisher — catches picking the wrong certificate on a machine holding several. Not enforced on Electron's third-party pre-signed binaries. |
| `WINDOWS_SIGNING_ALLOW_UNTRUSTED` | `true` to accept signatures that do not chain to a trusted root — for testing with self-signed certificates only. |
| `CSC_LINK` / `WIN_CSC_LINK` | electron-builder's native convention, honoured as a fallback. |

**Precedence:** `WINDOWS_CERT_SHA1` / `WINDOWS_CERT_SUBJECT_NAME` (EV) →
`WINDOWS_CERT_PATH` (standard) → `CSC_LINK`. If both an EV selector and a
`.pfx` are set, the store wins and a warning is printed.

Check how any combination resolves without building:

```bash
npm run signing:status
```

---

## Signing locally

### Development — always unsigned, always fast

```bash
npm run dist:dev
```

Forces signing off even on a machine holding a certificate. Use this for day-to-day
builds.

### Production — signed and verified

Set credentials for the session, then build.

**PowerShell, standard certificate:**

```powershell
$env:WINDOWS_CERT_PATH = "$env:USERPROFILE\.certs\playbound.pfx"
$env:WINDOWS_CERT_PASSWORD = Read-Host -AsSecureString "PFX password" | ConvertFrom-SecureString -AsPlainText
npm run dist:prod
```

**PowerShell, EV certificate:**

```powershell
$env:WINDOWS_CERT_SHA1 = "A1B2C3D4E5F6...."
npm run dist:prod
```

`dist:prod` sets `WINDOWS_SIGNING_ENABLED=true` for you, so the build fails if
credentials are missing, if signing fails, or if verification finds an unsigned
binary. It runs:

```
sync catalog → build + sign → verify every binary → report
```

### The default `npm run dist`

Unchanged from before this pipeline existed. It signs automatically **if**
credentials happen to be present and produces an unsigned build otherwise —
convenient, but prefer the explicit `dist:dev` / `dist:prod` for anything that
matters.

> Avoid putting passwords directly in a script or shell history. Prefer
> `Read-Host -AsSecureString`, a password manager CLI, or a gitignored
> `.env.signing` you source manually.

---

## Signing in GitHub Actions

Nothing needs configuring in GitHub yet. The pipeline already detects CI
credentials, enables signing automatically when they exist, and skips signing
gracefully when they do not — so workflows keep passing on forks and PRs that
have no access to secrets.

When you are ready, add repository secrets and a workflow like this.

### Standard certificate

Add secrets `WINDOWS_CERT_BASE64` (the `.pfx`, base64-encoded) and
`WINDOWS_CERT_PASSWORD`.

Encode the certificate:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("playbound.pfx")) | Set-Clipboard
```

```yaml
name: Release Windows

on:
  push:
    tags: ["v*"]

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
        working-directory: launcher

      # Materialise the certificate outside the workspace so it can never be
      # picked up by a build step or archived as an artifact.
      - name: Restore signing certificate
        shell: pwsh
        env:
          CERT_BASE64: ${{ secrets.WINDOWS_CERT_BASE64 }}
        run: |
          $path = Join-Path $env:RUNNER_TEMP 'playbound.pfx'
          [IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($env:CERT_BASE64))
          "WINDOWS_CERT_PATH=$path" | Out-File $env:GITHUB_ENV -Append

      - name: Build signed release
        working-directory: launcher
        env:
          WINDOWS_SIGNING_ENABLED: "true"
          WINDOWS_CERT_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}
        run: npm run dist:prod

      - name: Remove certificate
        if: always()
        shell: pwsh
        run: Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $env:RUNNER_TEMP 'playbound.pfx')

      - uses: actions/upload-artifact@v4
        with:
          name: windows-release
          path: |
            launcher/dist/*.exe
            launcher/dist/*.blockmap
            launcher/dist/latest.yml
```

Setting `WINDOWS_SIGNING_ENABLED: "true"` is what makes the job fail rather than
silently publish unsigned binaries if a secret is missing.

### EV certificate

A GitHub-hosted runner cannot access a hardware token. Either:

- **Self-hosted runner** with the token attached and unlocked. Set
  `WINDOWS_CERT_SHA1` and the same workflow works unchanged.
- **Cloud signing** (Azure Trusted Signing, DigiCert KeyLocker, SSL.com
  eSigner). electron-builder 25 supports Azure Trusted Signing natively via
  `azureSignOptions` in `launcher/electron-builder.js`.

### Certificate changes and auto-updates

The launcher auto-updates through `electron-updater`, which verifies that a
downloaded update is signed by the **same publisher** as the installed build.

- Existing **unsigned** installs will accept the first signed release — they
  have no publisher name recorded, so verification is skipped. No breakage.
- Once users are on signed builds, a change to the certificate's subject name
  (renewal under a slightly different legal name, or switching CA) will cause
  updates to be **rejected**, stranding users on the old version.

If the subject name ever changes, set `WINDOWS_PUBLISHER_NAME` to the **previous**
publisher name for at least one release so existing clients still accept the
update, then drop it once users have migrated.

---

## Verifying a signed executable

The production build verifies automatically and fails if anything is unsigned.
To check manually:

```bash
npm run verify:signatures
```

It walks `dist/`, checks the installer, the portable build, and every executable
and native binary in `win-unpacked/`, and reports the signer, timestamp status,
and any failures.

### Ad-hoc checks

**PowerShell:**

```powershell
Get-AuthenticodeSignature .\dist\PlayBound-Setup-0.1.26.exe | Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
```

`Status` must be `Valid`, and `SignerCertificate` must show a subject
containing **`The Media Shop, LLC`**. A populated `TimeStamperCertificate`
confirms timestamping.

`npm run verify:signatures` prints the signer subject on success, so a wrong or
unexpected certificate is visible in the build log rather than something you
find out about after release.

**signtool:**

```powershell
signtool verify /pa /v .\dist\PlayBound-Setup-0.1.26.exe
```

**GUI:** right-click the file → Properties → Digital Signatures.

### What the statuses mean

| Status | Meaning |
| --- | --- |
| `Valid` | Signed, intact, chains to a trusted root. |
| `NotSigned` | No signature. Signing did not run. |
| `HashMismatch` | File modified after signing — treat as compromised. |
| `NotTrusted` | Signature is valid but the chain is not trusted — usually a self-signed certificate. |
| `UnknownError` | Commonly an untrusted or incomplete chain; inspect `StatusMessage`. |

For deliberate self-signed testing, set `WINDOWS_SIGNING_ALLOW_UNTRUSTED=true`
to downgrade `NotTrusted` / `UnknownError` to warnings. Never set it in CI.

---

## SmartScreen reputation

SmartScreen is a separate reputation system layered on top of signing. A valid
signature is necessary but not automatically sufficient.

**How it works:** Microsoft tracks how often a binary and its signing
certificate are downloaded and installed without incident. Reputation accrues to
the *certificate*, not to individual files — so every release signed with the
same certificate contributes to a shared pool.

- **Unsigned:** "Windows protected your PC" on essentially every download.
  Users must click *More info → Run anyway*. Most do not.
- **Standard certificate, new:** warnings continue until reputation builds —
  commonly a few weeks and several hundred clean installs.
- **Standard certificate, established:** warnings disappear.
- **EV certificate:** trusted immediately, from the first signed build.

**Practical consequences:**

- Keep using the same certificate. Switching resets reputation to zero.
- Renew *before* expiry with the same subject details; a renewed certificate
  generally inherits standing.
- Reputation is per-certificate, so signing every release consistently matters
  more than any single release.
- If a build is ever flagged incorrectly, submit it at
  <https://www.microsoft.com/en-us/wdsi/filesubmission>.

---

## Troubleshooting

**`npm run signing:status` says "no signing credentials"**
Environment variables are not visible to the process. They are per-shell — a new
terminal will not have them. Re-set them, or confirm with
`Get-ChildItem Env:WINDOWS_*`.

**"Cannot extract publisher name from code signing certificate"**
electron-builder could not read the subject from the certificate. Usually a
corrupt or wrong-format `.pfx`, or a wrong password. If the certificate is
genuinely fine, set `WINDOWS_PUBLISHER_NAME` explicitly.

**"cannot execute … 7za.exe … Cannot create symbolic link"**
electron-builder unpacks its signing toolchain and fails on macOS symlinks
inside the archive because Windows requires elevated rights to create symlinks.
The Windows tools usually still extract, but the non-zero exit can abort the
build. Fix by enabling **Developer Mode** (Settings → Privacy & security → For
developers), which permits unprivileged symlink creation, or run the build from
an elevated terminal. Clearing
`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` forces a clean re-extract.

**Signing appears to succeed but artifacts are unsigned**
Confirm the build actually loaded the config — the log must contain
`loaded configuration file=…\electron-builder.js`. If the packaged exe is named
`playbound-launcher.exe` rather than `PlayBound.exe`, the config was not loaded:
either the file was renamed away from `electron-builder.js`, or a `build` key
was reintroduced into `package.json` (which takes precedence and suppresses the
config file entirely).

**"The specified timestamp server could not be reached"**
Transient outage or blocked egress. Retry, or set `WINDOWS_TIMESTAMP_SERVER` to
an alternative: `http://timestamp.sectigo.com`,
`http://timestamp.globalsign.com/tsa/r6advanced1`,
`http://tsa.starfieldtech.com`. Never ship untimestamped signatures.

**EV token: "The password or PIN is incorrect" / no prompt in CI**
Most tokens require an interactive PIN. Vendor middleware can cache it for
unattended signing (SafeNet: enable single-logon), but a plain hosted runner
cannot supply it — use a self-hosted runner or cloud signing.

**Verification fails only on `.dll` files**
`WINDOWS_SIGN_ALL_BINARIES` was disabled for the build but enabled during
verification, or vice versa. Keep it consistent between the two.

---

## Best practices

**Key handling**
- Never commit certificates, passwords, or tokens. The `.gitignore` entries are
  a backstop, not a strategy.
- Store `.pfx` files on encrypted volumes; keep EV keys on their token.
- Limit who can access signing material, and log that access.
- Rotate immediately on any suspected exposure.

**Build pipeline**
- Sign every production release. Reputation compounds; gaps waste it.
- Always timestamp.
- Never publish artifacts that failed verification — that is why `dist:prod`
  exits non-zero.
- Keep development builds unsigned so a signing failure is impossible to mistake
  for success.

**Certificate lifecycle**
- Diary the expiry date and renew 30+ days early.
- Renew with identical subject details to preserve SmartScreen reputation and
  auto-update compatibility.
- Keep the old certificate until every artifact signed with it is retired.

**Verification**
- Check `npm run signing:status` after any certificate or environment change.
- Spot-check a real download on a clean machine before announcing a release —
  it is the only way to see what users actually see.
