/**
 * Second wave of source-backed Windows controller recipes, same contract as
 * wave-1: `testing` status only, keyboard defaults come from the curated
 * controls batches, and none of these have had a physical play test yet.
 *
 * Chorded keybinds (Ctrl+S, Ctrl+0-9, Attack-move's "A + Click") are not
 * representable by a single action output today, so they are simply left
 * unbound rather than approximated — see ControlProfile.actions' one
 * output per action. A game missing one of those extras still plays; it
 * just does not expose that specific shortcut via controller.
 */
type Key = string;
type Input = string;
type Spec = [id: string, label: string, output: Key, input: Input];

const wasd: Spec[] = [
  ["forward", "Move forward", "W", "LEFT_UP"],
  ["backward", "Move backward", "S", "LEFT_DOWN"],
  ["left", "Move left", "A", "LEFT_LEFT"],
  ["right", "Move right", "D", "LEFT_RIGHT"],
];
const arrows: Spec[] = [
  ["up", "Move up", "ArrowUp", "LEFT_UP"],
  ["down", "Move down", "ArrowDown", "LEFT_DOWN"],
  ["left", "Move left", "ArrowLeft", "LEFT_LEFT"],
  ["right", "Move right", "ArrowRight", "LEFT_RIGHT"],
];
const pointerStrategy: Spec[] = [
  ...arrows,
  ["select", "Select / interact", "mouse:left", "RT"],
  ["context", "Context / cancel", "mouse:right", "LT"],
];

const recipes: Array<{ slug: string; bindings: Spec[]; mouse: boolean; note: string }> = [
  { slug: "old-school-runescape", mouse: true, note: "Camera rotates with the left stick; right stick moves the pointer. RT clicks, LT opens the context menu.", bindings: [
    ...pointerStrategy, ["closeUi", "Close current interface", "Escape", "A"], ["panel", "Open side panel", "F1", "Y"],
  ] },
  { slug: "stronghold-crusader-hd", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers select or issue orders.", bindings: [
    ...pointerStrategy, ["rotateLeft", "Rotate map left", "Q", "LB"], ["rotateRight", "Rotate map right", "E", "RB"],
    ["pause", "Pause", "P", "START"], ["menu", "Game menu", "Escape", "B"],
  ] },
  { slug: "wolfenstein-enemy-territory", mouse: true, note: "Right stick aims; RT fires, LT alt-fires. Built from the curated Windows keyboard layout.", bindings: [
    ...wasd, ["fire", "Fire", "mouse:left", "RT"], ["altFire", "Aim / alternate fire", "mouse:right", "LT"],
    ["jump", "Jump", "Space", "A"], ["crouch", "Crouch", "C", "B"], ["use", "Use / activate", "F", "X"],
    ["reload", "Reload", "R", "Y"], ["menu", "Limbo menu", "L", "START"], ["scores", "Scores", "Tab", "BACK"],
  ] },
  { slug: "triplea", mouse: false, note: "Left stick pans the board; RT selects territories/units. Chorded shortcuts (Ctrl+S/O) are not bound.", bindings: [
    ...arrows, ["select", "Select territory / units", "mouse:left", "RT"],
    ["confirm", "Confirm current action", "Enter", "A"], ["cancel", "Cancel / close dialog", "Escape", "B"],
  ] },
  { slug: "space-station-14", mouse: true, note: "Right stick aims; RT interacts, LT is the context action. Built from the curated Windows keyboard layout.", bindings: [
    ...wasd, ["interact", "Interact / use hand", "mouse:left", "RT"], ["context", "Context action", "mouse:right", "LT"],
    ["inventory", "Open inventory", "I", "A"], ["swapHand", "Swap active hand", "X", "X"],
    ["drop", "Drop held item", "Q", "Y"], ["combat", "Toggle combat mode", "R", "B"],
  ] },
  { slug: "openciv3", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers select or take the context action.", bindings: [
    ...pointerStrategy, ["nextUnit", "Next unit", "W", "A"], ["fortify", "Fortify unit", "F", "X"],
    ["buildCity", "Build city", "B", "Y"], ["endTurn", "End turn", "Enter", "START"],
  ] },
  { slug: "tes-arena", mouse: false, note: "Left stick moves and turns like the original arrow-key controls. Attack approximates the mouse-drag swing as a single right-click.", bindings: [
    ["forward", "Move forward", "ArrowUp", "LEFT_UP"], ["backward", "Move backward", "ArrowDown", "LEFT_DOWN"],
    ["turnLeft", "Turn left", "ArrowLeft", "LEFT_LEFT"], ["turnRight", "Turn right", "ArrowRight", "LEFT_RIGHT"],
    ["attack", "Attack", "mouse:right", "RT"], ["castSpell", "Cast spell", "C", "A"],
    ["use", "Use / interact", "U", "X"], ["jump", "Jump", "J", "Y"], ["characterSheet", "Character sheet", "F1", "START"],
  ] },
  { slug: "star-wars-galaxies", mouse: true, note: "Right stick is mouselook. Toolbar slots (F1-F12) are not bound — too many for one layout.", bindings: [
    ...wasd, ["jump", "Jump", "Space", "A"], ["target", "Target nearest enemy", "Tab", "X"],
    ["interact", "Interact", "Grave", "Y"], ["map", "Map", "M", "B"],
  ] },
  { slug: "freeciv", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers select or take the context action.", bindings: [
    ...pointerStrategy, ["buildCity", "Build city", "B", "X"], ["fortify", "Fortify unit", "F", "A"],
    ["nextUnit", "Next unit", "W", "Y"], ["endTurn", "End turn", "Enter", "START"],
  ] },
  { slug: "warzone-2100", mouse: true, note: "Left stick pans; right stick moves the pointer; both triggers issue orders like the game's own left/right mouse.", bindings: [
    ...pointerStrategy, ["attack", "Attack command", "A", "X"], ["stop", "Stop", "S", "Y"], ["pause", "Pause", "F3", "START"],
  ] },
  { slug: "0ad", mouse: true, note: "Left stick pans the camera (WASD); right stick moves the pointer; triggers select or order units.", bindings: [
    ...wasd, ["select", "Select / order units", "mouse:left", "RT"], ["order", "Order units", "mouse:right", "LT"],
    ["menu", "Game menu", "Escape", "START"],
  ] },
  { slug: "battle-for-wesnoth", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers select a unit or open the context menu.", bindings: [
    ...pointerStrategy, ["zoomIn", "Zoom in", "PageUp", "LB"], ["zoomOut", "Zoom out", "PageDown", "RB"],
    ["cycleUnits", "Cycle units", "N", "X"], ["undo", "Undo move", "U", "Y"],
  ] },
  { slug: "openra", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers select or move/order. Same engine family as Dune Legacy.", bindings: [
    ...pointerStrategy, ["stop", "Stop / scatter", "S", "X"], ["powerDown", "Power down structure", "X", "Y"],
  ] },
  { slug: "theme-hospital", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers select/build or cancel.", bindings: [
    ...pointerStrategy, ["rotateLeft", "Rotate object", "Z", "LB"], ["rotateRight", "Rotate object", "X", "RB"],
    ["pause", "Pause", "P", "START"],
  ] },
  { slug: "ultima-7-complete", mouse: true, note: "Right stick is the pointer. RT is the game's own primary Right Mouse (move/interact); LT is Left Mouse (select/use).", bindings: [
    ["move", "Move / interact", "mouse:right", "RT"], ["select", "Select / use object", "mouse:left", "LT"],
    ["inventory", "Open inventory", "I", "A"], ["combat", "Enter combat mode", "C", "X"],
    ["keyring", "Use keyring", "K", "Y"], ["menu", "Game menu", "Escape", "START"],
  ] },
  { slug: "freetrain", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers select/build or cancel.", bindings: [
    ...pointerStrategy, ["rotate", "Rotate object", "R", "LB"], ["pause", "Pause", "Space", "START"],
  ] },
  { slug: "the-dark-mod", mouse: true, note: "Right stick looks and aims, RT attacks, LT uses/frobs. Same Thief-style layout as Thief Gold and Thief II.", bindings: [
    ...wasd, ["attack", "Attack", "mouse:left", "RT"], ["use", "Use / frob", "mouse:right", "LT"],
    ["jump", "Jump", "Space", "A"], ["crouch", "Crouch", "C", "B"],
    ["leanLeft", "Lean left", "Q", "LB"], ["leanRight", "Lean right", "E", "RB"],
    ["inventory", "Inventory", "Tab", "Y"], ["objectives", "Objectives", "O", "X"],
  ] },
  { slug: "bzflag", mouse: false, note: "Left stick drives like a tank: up/down throttles, left/right turns. RT fires.", bindings: [
    ["throttleForward", "Drive forward", "ArrowUp", "LEFT_UP"], ["throttleBackward", "Drive backward", "ArrowDown", "LEFT_DOWN"],
    ["turnLeft", "Turn left", "ArrowLeft", "LEFT_LEFT"], ["turnRight", "Turn right", "ArrowRight", "LEFT_RIGHT"],
    ["fire", "Fire", "mouse:left", "RT"], ["jump", "Jump", "Tab", "A"], ["dropFlag", "Drop flag", "Space", "B"],
  ] },
];

export const testingControlProfilesWave2 = recipes.map(({ slug, bindings, mouse, note }) => ({
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
