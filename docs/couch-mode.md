# Couch Mode

Phone → PC controller bridge for PlayBound. Phones are input devices; the PC hosts the game. TV/display casting is intentionally separate and not required.

## Quick start

### From Play (single-player or local)

1. Install a **controller-supported** game in the launcher.
2. Click **Play**. When the game supports a controller, choose:
   - **Play normally** — keyboard/mouse or a pad already on this PC
   - **Use phone as controller** — optional; scan the QR, then play
3. You do **not** need to open Controllers / Couch Mode first.

### Controllers page (friends / several phones)

1. Open **Controllers** in the PlayBound launcher.
2. Click **Start phone controllers** (Windows may ask once — choose Allow).
3. Friends scan the QR code (or open `https://playbound.club/controller/CODE`) — **no PlayBound account**.
4. Use **Touch** or **Physical pad** on the phone.
5. Launch the game. It should see standard Xbox pads.

No separate driver download. PlayBound bundles and installs what it needs.

## Architecture (Milestone 1)

| Piece | Role |
| --- | --- |
| `/controller/[code]` PWA | Capture touch / Gamepad API |
| `/api/couch/*` | Session codes, approve/kick, WebRTC signaling |
| Launcher Couch Mode | Host UI, WebRTC answerer, LAN WebSocket fallback |
| `VirtualControllerProvider` | Stable API; Windows uses ViGEm behind the scenes |

Sessions are stored in Mongo (`couch_sessions`) so Vercel serverless instances share state. Input packets never go through the cloud — only signaling and session metadata.

Protocol details: [couch-input-protocol.md](./couch-input-protocol.md).

## Bundled controller stack (Windows)

- **ViGEmBus** setup is vendored at `launcher/resources/vigem/` (pinned in `VERSION`) and shipped as `extraResources`.
- PlayBound Setup runs a silent install best-effort via [`launcher/nsis/installer.nsh`](../launcher/nsis/installer.nsh).
- If the driver is still missing (portable build, UAC declined), **Start Couch Mode** elevates and installs the bundled setup automatically (`ensureVigem.js`).
- Controller I/O uses bundled **PlayBound.VigemHost.ps1** + **Nefarius.ViGEm.Client.dll** (no node-gyp).
- `dist:dev` / `dist:prod` run `vendor-vigem.js` and `vendor-vigem-client.js` before electron-builder.

Maintainers: .NET SDK is optional (can build an alternate `PlayBound.VigemHost.exe`); PowerShell host is the default ship path.

## Proof game

SuperTuxKart (`supertuxkart`) is a good smoke test: local multiplayer, standard gamepad.

## Out of scope (later)

Miracast / AirPlay / custom streaming, Linux/macOS virtual pads, motion/golf profiles, party-native phone UIs, PlayBound Stick.
