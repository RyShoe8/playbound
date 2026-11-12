/**
 * Sixth wave of Windows controller recipes, same contract as waves 1-5:
 * `testing` status only and no physical play test yet.
 *
 * Neither game had curated controls, so this wave's catalog change adds them
 * alongside the profiles. Sources:
 *   Starbound      https://starbounder.org/Hotkey
 *   Vintage Story  https://wiki.vintagestory.at/index.php/Controls
 * The Vintage Story wiki's Controller Compatibility page states the base game
 * does not support controllers.
 *
 * Held back: Diablo + Hellfire (its original edition is launched both with
 * and without an edition slug, so an edition-scoped profile would miss the
 * main Play button and an unscoped one would stack on DevilutionX's native
 * pad support) and Jedi Outcast (no reachable source for its defaults).
 */
type Key = string;
type Input = string;
type Spec = [id: string, label: string, output: Key, input: Input];

const recipes: Array<{ slug: string; bindings: Spec[]; mouse: boolean; note: string }> = [
  { slug: "starbound", mouse: true, note: "Left stick moves (down ducks); right stick aims the cursor. RT and LT use the left- and right-hand items.", bindings: [
    ["up", "Move up", "W", "LEFT_UP"], ["duck", "Duck", "S", "LEFT_DOWN"],
    ["left", "Move left", "A", "LEFT_LEFT"], ["right", "Move right", "D", "LEFT_RIGHT"],
    ["primary", "Left hand / attack", "mouse:left", "RT"], ["secondary", "Right hand / alt attack", "mouse:right", "LT"],
    ["jump", "Jump", "Space", "A"], ["interact", "Interact", "E", "X"], ["walk", "Walk", "LeftShift", "LS"],
    ["inventory", "Inventory", "I", "Y"], ["crafting", "Crafting", "C", "BACK"], ["journal", "Quest journal", "J", "DPAD_UP"],
    ["manipulator", "Matter Manipulator", "R", "DPAD_DOWN"], ["slot1", "Hotbar slot 1", "1", "DPAD_LEFT"],
    ["slot2", "Hotbar slot 2", "2", "DPAD_RIGHT"], ["swapBar", "Swap hotbars", "X", "RB"], ["deselect", "Put item away", "Z", "LB"],
    ["menu", "Options menu", "Escape", "START"],
  ] },
  { slug: "vintage-story", mouse: true, note: "Right stick looks; RT breaks and attacks, LT places and uses. Click the left stick to run; B sneaks.", bindings: [
    ["forward", "Move forward", "W", "LEFT_UP"], ["backward", "Move backward", "S", "LEFT_DOWN"],
    ["left", "Move left", "A", "LEFT_LEFT"], ["right", "Move right", "D", "LEFT_RIGHT"],
    ["primary", "Break / attack", "mouse:left", "RT"], ["secondary", "Place / use", "mouse:right", "LT"],
    ["jump", "Jump", "Space", "A"], ["sneak", "Sneak", "LeftShift", "B"], ["sprint", "Run", "LeftCtrl", "LS"],
    ["inventory", "Backpack and crafting", "E", "Y"], ["character", "Character", "C", "BACK"],
    ["swapHands", "Swap hands", "X", "X"], ["toolMode", "Tool mode", "F", "RB"], ["drop", "Drop one item", "Q", "LB"],
    ["map", "World map", "M", "DPAD_UP"], ["slot1", "Hotbar slot 1", "1", "DPAD_LEFT"], ["slot2", "Hotbar slot 2", "2", "DPAD_RIGHT"],
    ["menu", "Pause / settings", "Escape", "START"],
  ] },
];

export const testingControlProfilesWave6 = recipes.map(({ slug, bindings, mouse, note }) => ({
  gameSlug: slug,
  editionSlug: null,
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
  stickMouseSettings: { enabled: mouse, deadzone: 0.15, curve: "exponential" as const, sensitivity: mouse ? 1 : 1.35, acceleration: 0.2, smoothing: 0.08, maxVelocity: mouse ? 650 : 900, invertY: false, precisionMultiplier: 0.4 },
  notes: `${note} Key defaults are documented in PlayBound's controls catalog. Controller layout is unverified and awaits a physical play test.`,
}));
