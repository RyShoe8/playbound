/**
 * Explicit, source-backed Windows controller recipes awaiting physical play tests.
 * The keyboard defaults come from the six curated controls batches. These are
 * deliberately `testing`: catalog keyboard verification is not a controller
 * play test. Only OutRun, imported separately by apply-control-profile-wave,
 * has been exercised with a physical pad.
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
const shooter: Spec[] = [
  ...wasd,
  ["fire", "Fire", "mouse:left", "RT"],
  ["jump", "Jump", "Space", "A"],
  ["menu", "Pause / menu", "Escape", "START"],
];
const pointerStrategy: Spec[] = [
  ...arrows,
  ["select", "Select / interact", "mouse:left", "RT"],
  ["context", "Context / cancel", "mouse:right", "LT"],
  ["back", "Back / close", "Escape", "B"],
];

const recipes: Array<{ slug: string; bindings: Spec[]; mouse: boolean; note: string }> = [
  { slug: "tinywind", mouse: false, note: "Move with the left stick; A confirms, Start opens pause/back.", bindings: [
    ...wasd, ["confirm", "Interact / confirm", "Space", "A"], ["pause", "Pause / back", "Escape", "START"],
  ] },
  { slug: "8bit-killer", mouse: true, note: "Right stick aims; RT fires. Built from the curated Windows keyboard layout.", bindings: [
    ...shooter, ["use", "Use / open", "E", "X"], ["weapon1", "Weapon slot 1", "1", "Y"],
  ] },
  { slug: "meteorite", mouse: true, note: "Right stick aims; RT fires. A uses Space, X uses E.", bindings: [
    ...shooter, ["interact", "Interact", "E", "X"],
  ] },
  { slug: "thief-gold", mouse: true, note: "Original PC controls; right stick look, RT attack, LT use item.", bindings: [
    ...wasd, ["attack", "Attack", "mouse:left", "RT"], ["use", "Use item", "mouse:right", "LT"],
    ["jump", "Jump", "Space", "A"], ["crouch", "Crouch", "X", "B"],
    ["leanLeft", "Lean left", "Q", "LB"], ["leanRight", "Lean right", "E", "RB"],
    ["drop", "Drop item", "R", "Y"], ["menu", "Menu", "Escape", "START"],
  ] },
  { slug: "thief-2-the-metal-age", mouse: true, note: "Original PC controls; right stick look, RT attack, LT use item.", bindings: [
    ...wasd, ["attack", "Attack", "mouse:left", "RT"], ["use", "Use item", "mouse:right", "LT"],
    ["jump", "Jump", "Space", "A"], ["crouch", "Crouch", "X", "B"],
    ["leanLeft", "Lean left", "Q", "LB"], ["leanRight", "Lean right", "E", "RB"],
    ["drop", "Drop item", "R", "Y"], ["menu", "Menu", "Escape", "START"],
  ] },
  { slug: "rollercoaster-tycoon", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers click.", bindings: [
    ...pointerStrategy, ["rotate", "Rotate view", "Enter", "Y"],
    ["zoomOut", "Zoom out", "PageUp", "LB"], ["zoomIn", "Zoom in", "PageDown", "RB"],
  ] },
  { slug: "corsixth", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers click.", bindings: [
    ...pointerStrategy, ["rotateLeft", "Rotate object left", "Z", "LB"],
    ["rotateRight", "Rotate object right", "X", "RB"], ["pause", "Pause", "P", "START"],
  ] },
  { slug: "unknown-horizons", mouse: true, note: "Left stick pans with WASD; right stick moves the pointer.", bindings: [
    ...wasd, ["select", "Select / interact", "mouse:left", "RT"],
    ["context", "Context action / cancel", "mouse:right", "LT"],
    ["rotateLeft", "Rotate map left", "Q", "LB"], ["rotateRight", "Rotate map right", "E", "RB"],
    ["pause", "Pause", "Space", "START"], ["back", "Back", "Escape", "B"],
  ] },
  { slug: "openttd", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers click.", bindings: [
    ...pointerStrategy, ["rail", "Rail construction", "4", "X"],
    ["road", "Road construction", "5", "Y"],
  ] },
  { slug: "dune-legacy", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers issue orders.", bindings: [
    ...pointerStrategy, ["attackOrder", "Attack order", "A", "X"],
    ["moveOrder", "Move order", "M", "Y"], ["pause", "Pause", "Space", "START"],
  ] },
  { slug: "shattered-pixel-dungeon", mouse: true, note: "Left stick walks; right stick moves the pointer; RT selects.", bindings: [
    ...arrows, ["select", "Select / interact", "mouse:left", "RT"],
    ["wait", "Wait a turn", "Space", "A"], ["inventory", "Inventory", "I", "Y"],
    ["search", "Search", "S", "X"], ["character", "Character info", "C", "BACK"],
  ] },
  { slug: "panzer-marshal", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers select or inspect.", bindings: [
    ...pointerStrategy, ["endTurn", "End turn", "Enter", "Y"], ["menu", "Game menu", "Escape", "START"],
  ] },
  { slug: "lincity-ng", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers build or bulldoze.", bindings: [
    ...pointerStrategy, ["pause", "Pause", "P", "START"],
  ] },
  { slug: "widelands", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers build or cancel.", bindings: [
    ...pointerStrategy,
  ] },
  { slug: "heroes-of-might-and-magic-3-complete", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers select or inspect.", bindings: [
    ...pointerStrategy, ["nextHero", "Next hero", "H", "LB"],
    ["nextTown", "Next town", "T", "RB"], ["spell", "Cast spell", "C", "Y"],
  ] },
  { slug: "dungeon-keeper-gold", mouse: true, note: "Left stick pans; right stick moves the pointer; triggers pick up or drop.", bindings: [
    ...pointerStrategy, ["possess", "Possess creature", "P", "Y"], ["map", "Map", "M", "X"],
  ] },
];

export const testingControlProfiles = recipes.map(({ slug, bindings, mouse, note }) => ({
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
