# PlayBound Couch Input Protocol

Versioned phone → host controller transport for Couch Mode.

**Roles:** phone = input device, PC = game host, TV/display = separate later tier.  
**Mode now:** `legacy-virtual-pad` (phone state → virtual XInput).  
**Reserved:** `native-structured-input` (party games; not implemented).

## Identity

| Field | Purpose |
| --- | --- |
| `sessionId` | Host couch session |
| `joinCode` | Short QR / URL code (6 chars) |
| `hostToken` | Host-only secret for approve/kick/heartbeat |
| `controllerId` | Stable id for one phone endpoint |
| `controllerToken` | Phone secret for signal + reconnect |
| `sessionToken` | Issued on approve; required for input |
| `playerSlot` | 0–3 (Player 1–4) |

Reconnect with the same `controllerId` + `controllerToken` + `sessionToken` to reclaim `playerSlot`.

## Channels

1. **Control (reliable)** — hello, slot assign, profile, kick, rumble, metrics, ping. WebSocket or reliable DataChannel / HTTP.
2. **Input (prefer unreliable)** — axis/button state. WebRTC DataChannel (`ordered: false`, `maxRetransmits: 0`) when available; WebSocket fallback otherwise.

Cloud carries **signaling and session metadata only**. Stick packets stay on LAN/WebRTC (or direct host WS).

## Input packet JSON v1

```json
{
  "v": 1,
  "seq": 8432,
  "t": 174234,
  "p": 2,
  "buttons": 4129,
  "lx": -0.34,
  "ly": 0.81,
  "rx": 0.02,
  "ry": -0.12,
  "lt": 0.0,
  "rt": 0.72
}
```

| Key | Type | Meaning |
| --- | --- | --- |
| `v` | number | Protocol version (1) |
| `seq` | uint | Monotonic per controller |
| `t` | number | Capture time `performance.now()` or `Date.now()` ms |
| `p` | number | Player slot 0–3 |
| `buttons` | uint32 | Bitmask (see below) |
| `lx`–`ry` | float | Sticks −1…1 |
| `lt`/`rt` | float | Triggers 0…1 |

### Button bits (Xbox layout)

| Bit | Button |
| --- | --- |
| 0 | A |
| 1 | B |
| 2 | X |
| 3 | Y |
| 4 | LB |
| 5 | RB |
| 6 | Back / Select |
| 7 | Start |
| 8 | LS click |
| 9 | RS click |
| 10 | D-pad Up |
| 11 | D-pad Down |
| 12 | D-pad Left |
| 13 | D-pad Right |
| 14 | Guide (optional) |

## Control messages (JSON)

Envelope: `{ "type": "<name>", ... }`.

| type | Direction | Notes |
| --- | --- | --- |
| `hello` | phone → host | `{ controllerId, profile, deviceLabel }` |
| `welcome` | host → phone | `{ playerSlot, sessionToken, profile }` |
| `ping` / `pong` | both | `{ t }` for RTT |
| `kick` | host → phone | end input |
| `rumble` | host → phone | `{ low, high, ms }` (optional) |
| `metrics` | phone → host | optional client stats |
| `profile` | either | `{ profileId }` — reserved beyond `standard-gamepad` / `touch-gamepad` |

## Binary layout (reserved for v2)

Fixed 28-byte little-endian frame (no JSON):

| Offset | Size | Field |
| --- | --- | --- |
| 0 | u8 | version (=2) |
| 1 | u8 | player slot |
| 2 | u16 | flags (reserved) |
| 4 | u32 | seq |
| 8 | u32 | t (ms wrap) |
| 12 | u32 | buttons |
| 16 | i16 | lx × 32767 |
| 18 | i16 | ly × 32767 |
| 20 | i16 | rx × 32767 |
| 22 | i16 | ry × 32767 |
| 24 | u16 | lt × 65535 |
| 26 | u16 | rt × 65535 |

JSON v1 and binary v2 must map 1:1 so encoders can swap without redesigning hosts.

## Input profiles

| id | Status |
| --- | --- |
| `standard-gamepad` | Implemented (physical Gamepad API) |
| `touch-gamepad` | Implemented (on-screen) |
| `racing-wheel` | Reserved |
| `golf-swing` | Reserved |
| `tilt-steering` | Reserved |
| `party-buttons` | Reserved |
| `twin-stick` | Reserved |
| `pointer` | Reserved |

## Session roles (types)

- `host` — launcher
- `controller` — phone
- `display` — reserved (TV receiver; not used in Milestone 1)
