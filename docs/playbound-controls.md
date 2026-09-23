# PlayBound Controls (Windows V1)

PlayBound Controls maps a physical controller to keyboard and mouse input for a game or edition with a verified Control Profile. The user presses Play; the launcher fetches the profile, activates the Input Engine, and releases its synthetic keys and mouse buttons when the game exits or fails to launch.

## Authoring and rollout

Open **Admin → Games → Control Profiles**. Create a draft recipe for an existing game slug and, if needed, an existing edition slug. The editor starts with left-stick WASD bindings. Add semantic actions (`id`, `label`, keyboard or mouse-button `output`) and bind physical inputs to those actions. The supported inputs are the standard pad buttons, `LEFT_UP`, `LEFT_DOWN`, `LEFT_LEFT`, `LEFT_RIGHT`, `LT`, and `RT`. The right stick controls mouse motion using `stickMouseSettings`.

Test the draft with a physical controller on Windows before setting `status` to `verified`. Record the tested controller and mark anti-cheat compatibility verified only after checking that game's behavior. The API rejects verification without those checks. Exactly one verified profile is allowed per game and edition. An edition uses its own verified profile when present, otherwise the game's base profile. Draft and testing profiles never activate for players.

**OutRun pilot:** `launcher/services/inputEngine/profiles/outrun.json` is a testing recipe for the locally installed OutRun 4.0 Windows build. Its steering, pedals, and gear outputs come directly from `Resources/Settings/Settings.txt`; the right stick does not move the mouse. `node launcher/services/inputEngine/outrun.test.js` verifies the command stream and key releases. To test it in the development launcher, set `PLAYBOUND_CONTROLS_PILOT_OUTRUN=1` before starting Electron, then launch OutRun normally. This override is disabled in packaged launchers. Record the physical controller and verify the profile only after the drive and menu behavior are observed. Version 5.0 is the public install recipe, so confirm its shipped key settings too before making this profile public.

The public controls page distinguishes native support from PlayBound Enhanced. The launcher activates PlayBound Controls only for a verified keyboard/mouse profile on Windows and skips it when keyboard input or phone/couch mode is selected. The .NET input host is required in Windows builds; the older PowerShell fallback supports virtual pads but cannot synthesize keyboard or mouse input.

## Shared in-game overlay

The existing PlayBound overlay has **Server** and **Controls** tabs. Open it with `Ctrl+P` on Windows or `⌘+P` on Mac. Controls works without a party; Server continues to manage party servers. During a Windows PlayBound Controls session the Controls tab shows the active profile and button bindings. Look sensitivity and invert-Y take effect immediately and are saved locally per profile target. The Controls engine itself is Windows-only in V1, while the shared overlay and its Mac shortcut remain available for server management.

## Input path

The launcher renderer reads the physical pad through Chromium's Gamepad API and forwards frames over IPC. The main-process Input Engine turns button edges, left-stick directions, and trigger thresholds into game actions; the response curve turns right-stick movement into mouse deltas. The existing .NET controller sidecar sends keyboard and mouse events through Windows `SendInput`. It accumulates fractional mouse movement so low sensitivity still produces motion. No SDL3 dependency or new kernel driver is required for this version.

The launcher tests cover action edges, context changes, directional/trigger inputs, response curves, release commands, and solo/party overlay rendering. Before verifying an actual game profile, test normal exit and a forced game kill with a real pad, then confirm all held inputs release and the mouse response feels appropriate in that game. Games that read only raw device input may require a future game-specific backend.
