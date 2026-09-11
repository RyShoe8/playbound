# Adding ROM-Based Multiplayer Games (RetroArch Netplay)

This guide explains how to add ROM-based games — like Baseball Stars from GOG — to PlayBound with online multiplayer support using RetroArch's built-in netplay over PlayBound Connect's virtual LAN.

## How It Works

```
Player buys ROM game from GOG (DRM-free ROM file)
    ↓
PlayBound launcher detects ROM extension → resolves RetroArch core
    ↓
Multiplayer: RetroArch netplay syncs controller inputs over TCP 55435
    ↓
PlayBound Connect overlay → both players share one virtual LAN
    ↓
No port forwarding needed — host is directly addressable
```

**RetroArch netplay** is purpose-built for this: it frame-syncs controller inputs across the network, turning any local-multiplayer ROM into an online game. PlayBound manages the emulator, the core, the overlay network, and the controller config.

## Step-by-Step: Adding a New Game

You need to touch **4 files** (3 in `launcher/services/`, 1 in `platform/src/lib/multiplayer/`). Each change is one entry — copy the template and fill in the blanks.

### 1. Register the Core Override (if needed)

**File:** [`launcher/services/ManagedRetroArch.js`](../launcher/services/ManagedRetroArch.js)

Only needed when the ROM file extension is ambiguous (`.zip` for Neo Geo/arcade). If the extension uniquely identifies the system (`.nes`, `.gb`, `.sfc`, etc.), skip this step.

```js
// In SLUG_CORE_OVERRIDES:
const SLUG_CORE_OVERRIDES = {
  "baseball-stars": "fbneo",
  "your-game-slug": "fbneo",    // ← add your game here
};
```

### 2. Register the Game in the Netplay Registry

**File:** [`launcher/services/retroArchNetplay.js`](../launcher/services/retroArchNetplay.js)

This is the primary registry. Copy the template:

```js
"your-game-slug": {
  slug: "your-game-slug",
  title: "Your Game Title",
  core: "fbneo",              // see Core Reference below
  romFile: "romname.zip",     // ROM filename GOG provides
  maxPlayers: 2,              // max simultaneous netplay players
  netplayPort: NETPLAY_PORT,  // 55435 (RetroArch default)
  controllerType: "gamepad",  // "gamepad" or "arcade"
  source: "gog",              // where the player gets the ROM
  notes: "...",
},
```

### 3. Add the Multiplayer Adapter

**File:** [`platform/src/lib/multiplayer/adapters.ts`](../platform/src/lib/multiplayer/adapters.ts)

Add an adapter entry following the `mrboom` / `baseball-stars` pattern:

```typescript
"your-game-slug": {
  gameSlug: "your-game-slug",
  title: "Your Game Title",
  tier: "tier1_improved",
  adapterType: "direct-ip",
  protocol: "custom",
  client: {
    launchArguments: ["-C", "{host}"],
    inGameSteps: ["Wait for the netplay session to sync, then start a game."],
  },
  selfHost: {
    port: 55435,
    protocol: "tcp",
    verified: true,
    inGameSteps: ["Netplay -> Host", "Start hosting"],
  },
  notes:
    "RetroArch netplay, peer-hosted. <System> <Game> via <Core> core. GOG supplies the ROM.",
},
```

### 4. Add Connect Args

**File:** [`launcher/services/connectArgs.js`](../launcher/services/connectArgs.js)

Add one line in the RetroArch netplay section:

```js
"your-game-slug": ["-C", "{host}"],
```

### Done!

The launcher will now:
- Detect the ROM file and resolve the correct RetroArch core
- Download and provision RetroArch + the core automatically
- Add `-H` (host) or `-C {host}` (join) when in a party
- Use the PlayBound Connect overlay so no port forwarding is needed
- Apply controller profiles automatically

## Core Reference

| System | Extensions | Core | Notes |
|--------|-----------|------|-------|
| Game Boy / GBC | `.gb`, `.gbc` | `gambatte` | |
| Game Boy Advance | `.gba` | `mgba` | |
| NES / Famicom | `.nes` | `fceumm` | |
| SNES / Super Famicom | `.sfc`, `.smc` | `snes9x` | |
| Sega Genesis / Mega Drive | `.md`, `.gen` | `genesis_plus_gx` | |
| Neo Geo / Arcade | `.zip` | `fbneo` | Needs `SLUG_CORE_OVERRIDES` entry |
| Amiga | (disk images) | `puae` | |

**To add a new system**, add the core to the `CORES` array in `ManagedRetroArch.js` and optionally add the extension mapping to `coreForExtension()`.

## Worked Example: Baseball Stars

Baseball Stars is a Neo Geo MVS game. GOG sells it and delivers a `.zip` ROM set (`bstars.zip`).

**Changes made:**

1. **ManagedRetroArch.js** — Added `"fbneo"` to `CORES` array, added `"baseball-stars": "fbneo"` to `SLUG_CORE_OVERRIDES`
2. **retroArchNetplay.js** — Added full game entry with `core: "fbneo"`, `romFile: "bstars.zip"`, `maxPlayers: 2`
3. **adapters.ts** — Added `"baseball-stars"` adapter with `direct-ip`, `-C {host}` join, `selfHost` on port 55435
4. **connectArgs.js** — Added `"baseball-stars": ["-C", "{host}"]`

**How it plays:**
- Host clicks Play → RetroArch launches with `-L fbneo_libretro.dll bstars.zip -f -H`
- Joiner clicks Join Game → RetroArch launches with `-L fbneo_libretro.dll bstars.zip -f -C 100.64.x.x`
- Both are on the PlayBound Connect overlay, so the host's IP is directly reachable
- RetroArch syncs frame-by-frame inputs over TCP 55435
- Controllers are auto-configured via PlayBound's controller profiles

## Testing Checklist

After adding a game, verify:

- [ ] `node services/ManagedRetroArch.test.js` — core registration passes
- [ ] `node services/retroArchPlatform.test.js` — extension/platform tests pass
- [ ] `node services/retroArchNetplay.test.js` — netplay registry tests pass
- [ ] Core URL resolves (check `https://buildbot.libretro.com/nightly/<platform>/latest/<core>_libretro.<ext>.zip`)
- [ ] ROM launches in solo play with correct core
- [ ] Multiplayer: host gets `-H`, joiner gets `-C <host>`
- [ ] Controller input works in-game

## FAQ / Gotchas

### Neo Geo / Arcade ROMs are `.zip` — how does the launcher know which core?

The `.zip` extension is ambiguous, so the launcher uses the game slug to look up the correct core in `SLUG_CORE_OVERRIDES` (step 1). Without this entry, `.zip` files won't trigger the ROM launch path.

### Does the ROM path in `main.js` need to be updated for `.zip`?

Already done. The ROM detection regex includes `.zip`:
```js
const isRom = /\.(gb|gbc|gba|nes|sfc|smc|z64|n64|gen|zip)$/i.test(launchPath);
```

But `.zip` only triggers the ROM path when `coreForSlug(slug)` returns a core — random `.zip` files won't be treated as ROMs.

### Do BIOS files need to be handled?

Some cores (like `fbneo` for Neo Geo) need BIOS ROMs (e.g., `neogeo.zip`) in RetroArch's `system/` directory. GOG typically bundles these. If the game doesn't boot, check that the BIOS ROM is placed at `<retroarch>/system/neogeo.zip`.

### What about the catalog entry?

This guide covers multiplayer infrastructure only. The game also needs:
- A catalog entry in the PlayBound database (game + edition)
- The edition should use `installMethod: "gog"` or `"playbound_installer"`
- Cover art, description, etc.

These are separate from the multiplayer setup.

### Can I use this for non-GOG ROMs?

Yes. The `source` field in the netplay registry is informational. The player provides their own ROM file — PlayBound just supplies RetroArch, the core, the overlay network, and the controller config.

### What if a game needs more than 2 players?

RetroArch netplay supports up to 16 players. Set `maxPlayers` in the netplay registry entry. The adapter and connect args don't change — all players join the same way with `-C {host}`.

### RetroArch netplay port conflicts?

All netplay games share TCP 55435 (RetroArch's default). Since each game runs through its own party on its own Connect overlay, there's no conflict — the port is per-overlay-network, not per-machine.
