# Couch Mode

Phone → PC controller bridge for PlayBound. Phones are for **couch co-op** and for players who do not have a pad. Connect **online multiplayer** for local-only co-op titles still runs the game on the host PC; remotes join with a controller link (± P2P game view).

## Phone join rule

Never ask someone to type a long URL on a phone. Always:

1. **QR** on the host screen, or  
2. **Short entry:** open `playbound.club/c` and type the room code (Jackbox-style).

Deep links / QR targets use the short path `playbound.club/c/CODE`. Legacy `/controller/CODE` still works.

## Quick start

### From Play (single-player or local)

1. Install a **controller-supported** game in the launcher.
2. Click **Play**. When the game supports a controller, choose:
   - **Play normally** — keyboard/mouse or a pad already on this PC
   - **Use phone as controller** — optional; scan the QR (or `playbound.club/c` + code), then play
3. You do **not** need to open Controllers / Couch Mode first.

### Connect party (online multiplayer for local co-op)

1. Create a party on a couch-only game (e.g. Streets of Rage Remake, TMNT, X-Men Arcade Remake).
2. Host taps **Start Game** — Controllers start, and the host screen is shared best-effort for remotes.
3. Friends use **Join online** — **keyboard & mouse by default** (Touch / Pad optional). Phones: scan QR or `playbound.club/c` + code.
4. Host tip for SoR / OpenBOR: **Escape** (or Alt+F4) quits when menus hide a Quit button.

Local **Play** still offers the phone-controller popup when a game supports controllers — that flow is unchanged.

### Controllers page (local couch / spare phones)

1. Open **Controllers** in the PlayBound launcher.
2. Click **Start phone controllers** (Windows may ask once — choose Allow).
3. Friends **scan the QR**, or open `playbound.club/c` and enter the code — **no PlayBound account**.
4. Use **Touch** or **Physical pad** on the phone.
5. Launch the game. It should see standard Xbox pads.

No separate driver download. PlayBound bundles and installs what it needs.

## Architecture (pads + game view)

| Piece | Role |
| --- | --- |
| `/c` + `/c/[code]` | Short code entry + controller PWA (legacy `/controller` redirects / still works) |
| `/api/couch/*` | Session codes, approve/kick, WebRTC signaling |
| Launcher Couch Mode | Host UI, QR, WebRTC answerer (+ display tracks), LAN WebSocket fallback |
| `VirtualControllerProvider` | Stable API; Windows uses ViGEm behind the scenes |

Sessions are stored in Mongo (`couch_sessions`) so Vercel serverless instances share state. Input and video packets never go through the cloud — only signaling and session metadata. TURN is a rare NAT fallback, not the baseline path.

Protocol details: [couch-input-protocol.md](./couch-input-protocol.md).

## Bundled controller stack (Windows)

- **ViGEmBus** setup is vendored at `launcher/resources/vigem/` (pinned in `VERSION`) and shipped as `extraResources`.
- PlayBound Setup runs a silent install best-effort via [`launcher/nsis/installer.nsh`](../launcher/nsis/installer.nsh).
- If the driver is still missing (portable build, UAC declined), **Start Couch Mode** elevates and installs the bundled setup automatically (`ensureVigem.js`).
- Controller I/O uses bundled **PlayBound.VigemHost.ps1** + **Nefarius.ViGEm.Client.dll** (no node-gyp).
- `dist:dev` / `dist:prod` run `vendor-vigem.js` and `vendor-vigem-client.js` before electron-builder.

Maintainers: .NET SDK is optional (can build an alternate `PlayBound.VigemHost.exe`); PowerShell host is the default ship path.

## Proof game

SuperTuxKart (`supertuxkart`) is a good smoke test: local multiplayer, standard gamepad. Connect couch titles (SoR / TMNT / X-Men) prove pads + optional host game view.

## Out of scope (later)

Miracast / AirPlay as a separate product path, Linux/macOS virtual pads, motion/golf profiles, OpenBOR engine netplay (optional subset), PlayBound Stick.
