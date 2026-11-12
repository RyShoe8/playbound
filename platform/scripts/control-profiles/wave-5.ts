/**
 * Fifth wave of Windows controller recipes, same contract as waves 1-4:
 * `testing` status only and no physical play test yet.
 *
 * Source: the curated controls stored on each game in the live catalog
 * (curated through the CMS after the batch files, so they are not in
 * scripts/control-batches). Battlefield 1942's were read from the game's own
 * Mods/bf1942/Settings/Default/Controls files. RimWorld is left out: its
 * curated controls record a native controller scheme.
 *
 * Where a game's curated list gives one key two jobs (Unturned's F is both
 * Interact and Inspect), only the first is bound.
 */
type Key = string;
type Input = string;
type Spec = [id: string, label: string, output: Key, input: Input];

const wasd: Spec[] = [
  ["forward", "Move forward", "W", "LEFT_UP"],
  ["backward", "Move backward", "S", "LEFT_DOWN"],
  ["left", "Move / strafe left", "A", "LEFT_LEFT"],
  ["right", "Move / strafe right", "D", "LEFT_RIGHT"],
];
const pointer: Spec[] = [
  ["select", "Select", "mouse:left", "RT"],
  ["order", "Order / context action", "mouse:right", "LT"],
];

const recipes: Array<{ slug: string; bindings: Spec[]; mouse: boolean; note: string }> = [
  { slug: "battlefield-1942-anthology", mouse: true, note: "Right stick looks; RT fires, LT alt-fires. The left stick also drives land vehicles (W/S/A/D); aircraft pitch and roll stay on the arrow keys.", bindings: [
    ...wasd, ["fire", "Fire", "mouse:left", "RT"], ["altFire", "Alternate fire", "mouse:right", "LT"],
    ["jump", "Jump / action", "Space", "A"], ["crouch", "Crouch", "LeftCtrl", "B"], ["reload", "Reload", "R", "X"],
    ["use", "Use / enter or leave vehicle", "E", "Y"], ["prone", "Lie prone", "Z", "RS"], ["walk", "Walk", "LeftShift", "LS"],
    ["slot1", "Weapon slot 1", "1", "DPAD_UP"], ["slot2", "Weapon slot 2", "2", "DPAD_RIGHT"],
    ["slot3", "Weapon slot 3", "3", "DPAD_DOWN"], ["slot4", "Weapon slot 4", "4", "DPAD_LEFT"],
    ["map", "Map", "M", "RB"], ["camera", "Toggle camera mode", "C", "LB"],
    ["scores", "Scoreboard", "Tab", "BACK"], ["menu", "In-game menu", "Enter", "START"],
  ] },
  { slug: "deus-ex-goty-edition", mouse: true, note: "Right stick looks; RT fires or uses the item in hand, LT uses objects in the world. Bumpers take out belt items 1 and 2.", bindings: [
    ...wasd, ["fire", "Fire / use item in hand", "mouse:left", "RT"], ["use", "Use object in the world", "mouse:right", "LT"],
    ["jump", "Jump", "Space", "A"], ["crouch", "Crouch", "C", "B"],
    ["belt1", "Belt item 1", "1", "LB"], ["belt2", "Belt item 2", "2", "RB"],
    ["inventory", "Inventory", "F1", "BACK"], ["goals", "Goals and notes", "F2", "DPAD_UP"],
    ["menu", "Main menu", "Escape", "START"],
  ] },
  { slug: "star-wars-galactic-battlegrounds-saga", mouse: true, note: "Right stick moves the pointer and scrolls at the screen edge; RT selects, LT gives the contextual order.", bindings: [
    ...pointer, ["stop", "Stop", "S", "B"], ["garrison", "Garrison", "G", "X"],
    ["commandCenter", "Select Command Center", "H", "Y"], ["convert", "Convert (Jedi / Sith)", "C", "RB"],
    ["options", "Options", "F10", "BACK"], ["menu", "System menu", "Escape", "START"],
  ] },
  { slug: "sudden-strike-2-gold", mouse: true, note: "Right stick moves the pointer and scrolls at the screen edge; RT selects, LT orders. Face buttons toggle Stand Ground and Hold Fire.", bindings: [
    ...pointer, ["standGround", "Toggle Stand Ground", "G", "X"], ["holdFire", "Toggle Hold Fire", "T", "Y"],
  ] },
  { slug: "unturned", mouse: true, note: "Right stick looks; RT fires, LT aims. Click the left stick to sprint; bumpers lean. The left stick also drives (W/S/A/D).", bindings: [
    ...wasd, ["fire", "Fire / light attack", "mouse:left", "RT"], ["aim", "Aim / heavy attack", "mouse:right", "LT"],
    ["jump", "Jump", "Space", "A"], ["crouch", "Crouch", "X", "B"], ["reload", "Reload", "R", "X"],
    ["interact", "Interact / get in or out", "F", "Y"], ["sprint", "Sprint", "LeftShift", "LS"], ["prone", "Prone", "Z", "RS"],
    ["leanLeft", "Lean left", "Q", "LB"], ["leanRight", "Lean right", "E", "RB"],
    ["inventory", "Inventory", "G", "BACK"], ["map", "Map", "M", "DPAD_UP"], ["crafting", "Crafting", "Y", "DPAD_LEFT"],
    ["skills", "Skills", "U", "DPAD_RIGHT"], ["dashboard", "Dashboard", "Tab", "DPAD_DOWN"], ["menu", "Pause / menu", "Escape", "START"],
  ] },
];

export const testingControlProfilesWave5 = recipes.map(({ slug, bindings, mouse, note }) => ({
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
