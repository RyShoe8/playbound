/**
 * Third wave of source-backed Windows controller recipes, same contract as
 * waves 1 and 2: `testing` status only, keyboard defaults taken from the
 * curated controls batches (scripts/control-batches/batch-2, -5 and -6), and
 * no physical play test yet.
 *
 * Every game here had neither native pad support nor a profile. Left out on
 * purpose: Tomb Raider 1+2+3 and Red Eclipse (the curated batches record a
 * native controller scheme), Zero-K and Beyond All Reason (their curated
 * entries put both camera panning and the attack command on A, so a binding
 * could not be stated with confidence), and online games with kernel or
 * server-side anti-cheat.
 *
 * Chorded keybinds (Ctrl+0-9 control groups) are not representable by a
 * single action output, so they are left unbound rather than approximated.
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
  ["up", "Pan up", "ArrowUp", "LEFT_UP"],
  ["down", "Pan down", "ArrowDown", "LEFT_DOWN"],
  ["left", "Pan left", "ArrowLeft", "LEFT_LEFT"],
  ["right", "Pan right", "ArrowRight", "LEFT_RIGHT"],
];
const pointerStrategy: Spec[] = [
  ...arrows,
  ["select", "Select units", "mouse:left", "RT"],
  ["order", "Move / issue order", "mouse:right", "LT"],
];
// Fire / aim / jump / crouch / sprint shared by the first-person games below.
const fpsCore: Spec[] = [
  ...wasd,
  ["fire", "Fire", "mouse:left", "RT"],
  ["aim", "Aim", "mouse:right", "LT"],
  ["jump", "Jump", "Space", "A"],
  ["crouch", "Crouch", "LeftCtrl", "B"],
  ["menu", "Pause / menu", "Escape", "START"],
];

const recipes: Array<{ slug: string; bindings: Spec[]; mouse: boolean; note: string }> = [
  { slug: "cry-of-fear", mouse: true, note: "Right stick looks; RT fires, LT aims. Click the left stick to sprint.", bindings: [
    ...fpsCore, ["sprint", "Sprint", "LeftShift", "LS"], ["reload", "Reload", "R", "X"], ["use", "Use", "E", "Y"],
    ["inventory", "Inventory", "Tab", "BACK"], ["flashlight", "Flashlight", "F", "RB"],
  ] },
  { slug: "stalker-anomaly", mouse: true, note: "Right stick looks; RT fires, LT aims. Click the left stick to sprint; D-pad up opens the PDA, down the detector.", bindings: [
    ...fpsCore, ["sprint", "Sprint", "LeftShift", "LS"], ["reload", "Reload", "R", "X"], ["use", "Use / pick up", "F", "Y"],
    ["inventory", "Inventory", "I", "BACK"], ["pda", "PDA", "P", "DPAD_UP"], ["detector", "Detector", "O", "DPAD_DOWN"],
  ] },
  { slug: "stalker-lost-alpha", mouse: true, note: "Right stick looks; RT fires, LT aims. Click the left stick to sprint; D-pad up opens the PDA.", bindings: [
    ...fpsCore, ["sprint", "Sprint", "LeftShift", "LS"], ["reload", "Reload", "R", "X"], ["use", "Use / pick up", "F", "Y"],
    ["inventory", "Inventory", "I", "BACK"], ["pda", "PDA", "P", "DPAD_UP"], ["flashlight", "Flashlight", "L", "RB"],
  ] },
  { slug: "assaultcube", mouse: true, note: "Right stick looks; RT fires, LT scopes. The D-pad picks weapon slots 1-4.", bindings: [
    ...fpsCore, ["reload", "Reload", "R", "X"], ["scores", "Scores", "Tab", "BACK"],
    ["slot1", "Weapon slot 1", "1", "DPAD_UP"], ["slot2", "Weapon slot 2", "2", "DPAD_RIGHT"],
    ["slot3", "Weapon slot 3", "3", "DPAD_DOWN"], ["slot4", "Weapon slot 4", "4", "DPAD_LEFT"],
  ] },
  { slug: "star-wars-knights-of-the-old-republic", mouse: true, note: "Left stick walks and strafes; right stick moves the pointer. A takes the default action on the target, X pauses combat, bumpers cycle targets.", bindings: [
    ["forward", "Move forward", "W", "LEFT_UP"], ["backward", "Move backward", "S", "LEFT_DOWN"],
    ["strafeLeft", "Strafe left", "Z", "LEFT_LEFT"], ["strafeRight", "Strafe right", "C", "LEFT_RIGHT"],
    ["rotateLeft", "Rotate camera left", "A", "DPAD_LEFT"], ["rotateRight", "Rotate camera right", "D", "DPAD_RIGHT"],
    ["action", "Default action on target", "R", "A"], ["click", "Click", "mouse:left", "RT"],
    ["prevTarget", "Previous target", "Q", "LB"], ["nextTarget", "Next target", "E", "RB"],
    ["pause", "Pause combat", "Space", "X"], ["leader", "Change party leader", "Tab", "Y"],
    ["map", "Map", "M", "BACK"], ["menu", "Game menu", "Escape", "START"],
  ] },
  { slug: "idle-slayer", mouse: true, note: "A jumps; right stick moves the pointer and RT clicks upgrades and menus.", bindings: [
    ["jump", "Jump / activate", "Space", "A"], ["click", "Click", "mouse:left", "RT"], ["close", "Close menu", "Escape", "B"],
  ] },
  { slug: "ground-control-anthology", mouse: true, note: "Left stick pans; right stick moves the pointer; RT selects, LT orders. Control groups (Ctrl+0-9) are not bound.", bindings: [
    ...pointerStrategy, ["attack", "Attack", "A", "X"], ["stop", "Stop", "S", "B"],
  ] },
  { slug: "ground-control-2-operation-exodus", mouse: true, note: "Left stick pans; right stick moves the pointer; RT selects, LT orders; bumpers rotate the camera.", bindings: [
    ...pointerStrategy, ["rotateLeft", "Rotate camera left", "Q", "LB"], ["rotateRight", "Rotate camera right", "E", "RB"],
    ["attack", "Attack-move", "A", "X"], ["stop", "Stop", "S", "B"], ["menu", "Pause / menu", "Escape", "START"],
  ] },
  { slug: "seven-kingdoms-ancient-adversaries", mouse: true, note: "Left stick scrolls the map; right stick moves the pointer; RT selects, LT orders.", bindings: [
    ...pointerStrategy, ["pause", "Pause", "P", "Y"], ["menu", "Game menu", "Escape", "START"],
  ] },
  { slug: "openhv", mouse: true, note: "Left stick pans; right stick moves the pointer; RT selects, LT orders. Attack-move needs A + click and is not bound.", bindings: [
    ...pointerStrategy, ["stop", "Stop", "S", "B"], ["deploy", "Deploy / undeploy", "F", "X"],
  ] },
];

export const testingControlProfilesWave3 = recipes.map(({ slug, bindings, mouse, note }) => ({
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
