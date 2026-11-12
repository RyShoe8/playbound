/**
 * Seventh wave: Diablo + Hellfire's original release, same contract as waves
 * 1-6 (`testing`, no physical play test yet).
 *
 * Scoped to the `official` edition on purpose. The DevilutionX edition has
 * native pad support, and an unscoped profile would also be found for it
 * (lookup falls back from an edition to the game-wide profile). Launcher
 * 0.3.235 resolves the game page's Play button to the installed edition, so
 * this is offered there as well as on the edition page.
 *
 * Source: DevilutionX's keymapper defaults (Source/diablo.cpp,
 * InitKeymapActions), which keep the 1996 keys. Its own additions (F2/F3
 * quick save and load, Y party panel) are not bound.
 */
type Key = string;
type Input = string;
type Spec = [id: string, label: string, output: Key, input: Input];

const bindings: Spec[] = [
  ["primary", "Move / attack / pick up / talk", "mouse:left", "RT"],
  ["cast", "Cast the selected spell", "mouse:right", "LT"],
  ["standGround", "Attack in place (hold)", "LeftShift", "A"],
  ["close", "Close open panels", "Space", "B"],
  ["character", "Character", "C", "X"],
  ["inventory", "Inventory", "I", "Y"],
  ["speedbook", "Speedbook (choose spell)", "S", "LB"],
  ["automap", "Automap", "Tab", "RB"],
  ["spellbook", "Spellbook", "B", "LS"],
  ["highlight", "Show items on the ground (hold)", "LeftAlt", "RS"],
  ["quests", "Quest log", "Q", "BACK"],
  ["belt1", "Belt item 1", "1", "DPAD_UP"],
  ["belt2", "Belt item 2", "2", "DPAD_RIGHT"],
  ["belt3", "Belt item 3", "3", "DPAD_DOWN"],
  ["belt4", "Belt item 4", "4", "DPAD_LEFT"],
  ["menu", "Main menu", "Escape", "START"],
];

export const testingControlProfilesWave7 = [{
  gameSlug: "diablo-hellfire",
  editionSlug: "official",
  name: "PlayBound Preview",
  version: "0.1.0",
  platform: "windows" as const,
  inputStrategy: "keyboard_mouse" as const,
  status: "testing" as const,
  antiCheatCompatibility: "unknown" as const,
  testedControllers: [],
  actions: bindings.map(([id, label, output]) => ({
    id, label,
    output: output.startsWith("mouse:")
      ? { type: "mouseButton" as const, button: output.slice(6) }
      : { type: "key" as const, vk: output },
  })),
  bindings: bindings.map(([id, , , input]) => ({ actionId: id, physicalInput: input })),
  contexts: [],
  stickMouseSettings: { enabled: true, deadzone: 0.15, curve: "exponential" as const, sensitivity: 1, acceleration: 0.2, smoothing: 0.08, maxVelocity: 650, invertY: false, precisionMultiplier: 0.4 },
  notes: "Right stick moves the pointer; RT walks, attacks and picks up, LT casts. The D-pad drinks from belt slots 1-4. Original release only; DevilutionX reads the pad itself. Key defaults are documented in PlayBound's controls catalog. Controller layout is unverified and awaits a physical play test.",
}];
