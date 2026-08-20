/**
 * Controller detection, in one vocabulary every game writer can translate.
 *
 * Configuring a pad is per-game busywork the player should not have to do: you
 * find the options menu, rebind six things, and repeat it for the next game.
 * The launcher already knows which pad is plugged in, and several games keep
 * their bindings in a plain config file, so it can do this once.
 *
 * The shape here is deliberate. Detection produces a *canonical* profile —
 * "fire", "up", "menu" — and each game writer translates that into whatever
 * that game's config format calls those things. Without the middle layer,
 * adding a game would mean re-deriving pad layouts per game, and adding a pad
 * would mean touching every game.
 *
 * Nothing here writes files or knows about any game.
 */

/**
 * Actions a game might bind. Not every game uses all of them; a writer takes
 * what it needs and ignores the rest.
 */
const ACTIONS = [
  "up",
  "down",
  "left",
  "right",
  "fire",
  "altFire",
  "leftShoulder",
  "rightShoulder",
  "menu",
  "pause",
];

/**
 * Standard Gamepad API layout.
 *
 * The browser normalises most modern pads to this — index 0 is the bottom face
 * button, 9 is start, and axes 0/1 are the left stick. Both DualSense and Xbox
 * report `mapping: "standard"`, so one layout covers the pads people actually
 * own, and the per-family entries below exist for naming rather than remapping.
 */
const STANDARD = {
  buttons: {
    fire: 0,
    altFire: 1,
    leftShoulder: 4,
    rightShoulder: 5,
    menu: 9,
    pause: 8,
  },
  axes: { x: 0, y: 1 },
};

/**
 * Families, matched against the pad's reported id.
 *
 * `label` is what the game's config file should call this pad — OpenTyrian
 * keys its joystick section on the device name, so getting it wrong writes a
 * section the game will not read.
 */
const FAMILIES = [
  { id: "dualsense", label: "PS5 Controller", test: /dualsense|ps5|0ce6/i },
  { id: "dualshock4", label: "PS4 Controller", test: /dualshock|ps4|09cc|05c4/i },
  { id: "xbox", label: "Xbox Controller", test: /xbox|xinput|x-box/i },
  { id: "switchpro", label: "Switch Pro Controller", test: /switch pro|nintendo/i },
];

/** Anything unrecognised still works — standard mapping, honest label. */
const GENERIC = { id: "generic", label: "Gamepad" };

function familyFor(padId) {
  const id = String(padId || "");
  return FAMILIES.find((f) => f.test.test(id)) || GENERIC;
}

/**
 * Build a canonical profile from a Gamepad API entry.
 *
 * Takes the plain object the renderer sends over IPC rather than a live
 * Gamepad, so this stays testable and usable from the main process.
 */
function profileFromGamepad(pad) {
  if (!pad || typeof pad !== "object") return null;
  const family = familyFor(pad.id);
  return {
    family: family.id,
    label: family.label,
    rawId: String(pad.id || ""),
    /*
     * Non-standard pads still get the standard layout. It is a guess, but a
     * far better one than leaving the player with nothing bound — and every
     * game writer is expected to be overwritable by hand afterwards.
     */
    standardMapping: pad.mapping === "standard",
    buttons: { ...STANDARD.buttons },
    axes: { ...STANDARD.axes },
  };
}

/** The first connected pad, or null. Ignores the phantom empty slots. */
function pickPrimary(pads) {
  if (!Array.isArray(pads)) return null;
  const real = pads.filter((p) => p && p.connected !== false && p.id);
  return real.length ? profileFromGamepad(real[0]) : null;
}

module.exports = {
  ACTIONS,
  FAMILIES,
  GENERIC,
  STANDARD,
  familyFor,
  profileFromGamepad,
  pickPrimary,
};
