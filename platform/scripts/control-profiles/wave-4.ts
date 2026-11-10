/**
 * Fourth wave of source-backed Windows controller recipes, same contract as
 * waves 1-3: `testing` status only, keyboard defaults taken from the curated
 * controls batches (scripts/control-batches/batch-2, -3, -6 and -7), and no
 * physical play test yet.
 *
 * Each binding is one key or one click for one action. Left out on purpose:
 * competitive games with anti-cheat (Dota 2, League of Legends,
 * Counter-Strike: Source), games whose core commands are key + click chords
 * (EVE Online, Zero-K, Beyond All Reason), games with a native controller
 * scheme on record (Pokemon Dawn of Darkness, LOTRO), and browser games.
 *
 * MMO action bars (1-0, Ctrl/Alt+1-0) have more slots than a pad has
 * buttons; the first four slots are bound and the rest stay on the keyboard.
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
// Pointer-only games: the right stick is the mouse.
const pointer: Spec[] = [
  ["click", "Select / click", "mouse:left", "RT"],
  ["altClick", "Inspect / right-click", "mouse:right", "LT"],
];
// First four action-bar slots on the face buttons.
const actionBar: Spec[] = [
  ["slot1", "Action bar slot 1", "1", "A"],
  ["slot2", "Action bar slot 2", "2", "B"],
  ["slot3", "Action bar slot 3", "3", "X"],
  ["slot4", "Action bar slot 4", "4", "Y"],
];

const recipes: Array<{ slug: string; bindings: Spec[]; mouse: boolean; note: string }> = [
  { slug: "barotrauma", mouse: true, note: "Right stick aims; RT uses the held item, LT aims or grabs. Chat and radio need the keyboard.", bindings: [
    ...wasd, ["use", "Use item / attack", "mouse:left", "RT"], ["aim", "Aim / grab", "mouse:right", "LT"],
    ["sprint", "Sprint", "LeftShift", "LS"], ["interact", "Interact", "E", "A"], ["health", "Health interface", "H", "Y"],
    ["crew", "Crew list / command", "C", "X"], ["menu", "Pause / menu", "Escape", "START"],
  ] },
  { slug: "everquest", mouse: true, note: "Left stick moves; hold LT to mouselook with the right stick. Face buttons fire hotbuttons 1-4.", bindings: [
    ...wasd, ["select", "Select / click", "mouse:left", "RT"], ["mouselook", "Mouselook (hold)", "mouse:right", "LT"],
    ...actionBar, ["jump", "Jump", "Space", "RB"], ["attack", "Toggle auto-attack", "Q", "LB"],
    ["consider", "Consider target", "C", "DPAD_UP"], ["inventory", "Inventory", "I", "BACK"],
    ["map", "Map", "Backspace", "DPAD_DOWN"], ["menu", "Close window / menu", "Escape", "START"],
  ] },
  { slug: "ryzom", mouse: true, note: "Left stick moves; right stick is the mouse. Face buttons use action bar 1-4; RB targets the nearest.", bindings: [
    ...wasd, ...pointer, ...actionBar, ["jump", "Jump", "Space", "LB"], ["run", "Run", "LeftShift", "LS"],
    ["target", "Target nearest", "Tab", "RB"], ["inventory", "Inventory", "I", "BACK"], ["map", "Map", "M", "DPAD_UP"],
    ["menu", "Close window / menu", "Escape", "START"],
  ] },
  { slug: "star-wars-the-old-republic", mouse: true, note: "Left stick moves; right stick is the mouse. Face buttons use abilities 1-4; RB targets the nearest enemy, LB interacts.", bindings: [
    ...wasd, ...pointer, ...actionBar, ["jump", "Jump", "Space", "LS"], ["interact", "Interact / loot", "F", "LB"],
    ["target", "Target nearest enemy", "Tab", "RB"], ["inventory", "Inventory", "I", "BACK"],
    ["map", "Map", "M", "DPAD_UP"], ["character", "Character sheet", "C", "DPAD_LEFT"], ["quests", "Quest log", "L", "DPAD_RIGHT"],
    ["menu", "Close window / menu", "Escape", "START"],
  ] },
  { slug: "guild-wars-2", mouse: true, note: "Left stick moves; right stick is the mouse. Face buttons use weapon skills 1-4, RB dodges, LB interacts. One input is one action, as ArenaNet's remapping policy requires.", bindings: [
    ...wasd, ...pointer, ...actionBar, ["skill5", "Weapon skill 5", "5", "DPAD_UP"], ["heal", "Heal skill", "6", "DPAD_DOWN"],
    ["jump", "Jump", "Space", "LS"], ["dodge", "Dodge", "V", "RB"], ["interact", "Interact", "F", "LB"],
    ["swap", "Swap weapons", "Grave", "DPAD_LEFT"], ["inventory", "Inventory", "I", "BACK"], ["map", "World map", "M", "DPAD_RIGHT"],
    ["menu", "Close window / menu", "Escape", "START"],
  ] },
  { slug: "starcraft", mouse: true, note: "Left stick scrolls the map; right stick moves the pointer; RT selects, LT orders. Attack-move (A + click) and control groups are not bound.", bindings: [
    ["up", "Scroll up", "ArrowUp", "LEFT_UP"], ["down", "Scroll down", "ArrowDown", "LEFT_DOWN"],
    ["left", "Scroll left", "ArrowLeft", "LEFT_LEFT"], ["right", "Scroll right", "ArrowRight", "LEFT_RIGHT"],
    ["select", "Select", "mouse:left", "RT"], ["order", "Move / attack / rally", "mouse:right", "LT"],
    ["stop", "Stop", "S", "B"], ["hold", "Hold position", "H", "Y"], ["patrol", "Patrol", "P", "X"],
    ["menu", "Game menu", "F10", "START"],
  ] },
  { slug: "next-gen-chess", mouse: true, note: "Right stick moves the pointer; RT picks up and places pieces, LT or B cancels.", bindings: [
    ...pointer, ["confirm", "Confirm menu choice", "Enter", "A"], ["cancel", "Cancel selection", "Escape", "B"],
  ] },
  { slug: "ye-guild-clerk", mouse: true, note: "Right stick moves the pointer; RT selects; A advances dialogue.", bindings: [
    ...pointer, ["advance", "Advance dialogue / confirm", "Enter", "A"], ["back", "Menu / back", "Escape", "B"],
  ] },
  { slug: "hearthstone", mouse: true, note: "Right stick moves the pointer; hold RT to drag a card, LT inspects. End Turn is clicked like any button.", bindings: [
    ...pointer, ["menu", "Open menu", "Escape", "START"],
  ] },
  { slug: "marvel-snap", mouse: true, note: "Right stick moves the pointer; hold RT to drag a card, LT inspects. End Turn and Snap are clicked like any button.", bindings: [
    ...pointer,
  ] },
];

export const testingControlProfilesWave4 = recipes.map(({ slug, bindings, mouse, note }) => ({
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
