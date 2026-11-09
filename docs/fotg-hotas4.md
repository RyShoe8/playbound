# Fate of the Galaxy — T.Flight HOTAS 4

Status: physical SDL inputs captured November 8–9, 2026; preset generation
tested and applied to the local installation. In-flight behavior and menu
navigation have not yet been validated. This is not universal controller certification.

Tested device: T.Flight Hotas 4, GUID
`03006FCE4F0400007CB6000000000000`, using the installed FSO 26.0.1 SDL2.
Select it as the first flight device. Other driver modes need their own input
capture before reusing this mapping.

## Flight preset

- Stick X/Y: yaw/pitch.
- Twist (SDL RZ / axis 5): bank.
- Throttle rocker (SDL U / axis 6): alternate bank. These inputs add together;
  use either control, rather than opposite inputs simultaneously.
- Throttle (SDL Z / axis 2): absolute throttle. Forward was measured negative.
- Hat: inherited view up/right/rear/left controls.
- R1/trigger: primary fire.
- L1: secondary fire.
- R3: targeting computer.
- L3: nearest hostile.
- Square: primary firing rate.
- Cross: stationary targeting.
- Circle: S-foils.
- Triangle: equalize shields.
- R2: cycle secondary weapon.
- L2: cycle primary weapon.
- Share: target under reticle.
- Options: active pause (the game's repurposed `TOGGLE_GLIDING` action).

PS produced no SDL input in its capture; it has no game binding. The device
reports twelve buttons, all accounted for above. RX/RY report maximum at rest;
do not inherit the engine's RX bank default. Disabled game actions such as
afterburner and countermeasures remain disabled. Keyboard and mouse button
bindings are inherited; mouse flight axes are removed from this HOTAS preset.

The named preset is `PlayBound TFlight HOTAS 4`. Existing custom presets are
not selected over. Original table and pilot files are saved once alongside
the originals with `.playbound-hotas4.bak` extensions. Restore while the game
is closed if needed. Future launcher code applies the preset when selecting
the flight device; local changes do not require a launcher release to test.

## Repeatable diagnosis

Use `launcher/scripts/probe-sdl-joystick.py --dll <game SDL2.dll> --seconds 30`
to capture read-only SDL changes. Exercise one labeled control at a time.
Initial zero values can persist until the first hardware event; never treat
an untouched capture as proof of calibrated center or missing hardware.

Before calling a game/controller combination fully configured, verify axis
direction and deadzones, primary/secondary actions, targeting, camera,
pause/menu navigation, and absence of duplicate actions in actual gameplay.
Preserve player customizations and record the exact device/driver and game
version. Device detection alone is insufficient.
