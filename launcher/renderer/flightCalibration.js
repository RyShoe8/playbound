/**
 * Measuring a flight device the player owns, once, in about a minute.
 *
 * A device without a measured profile still works through the generic layout,
 * but sticks disagree about where the throttle and twist live and which way a
 * hat reports. This walks the player through each control ("move the
 * throttle", "press the button you want for fire") and turns what the browser's
 * Gamepad API reports into a device profile (see services/flightDevices.js).
 * The launcher keeps it for this PC and offers it to the site, so the next
 * player with the same device never calibrates at all.
 *
 * Gamepad API axis order for a HID stick follows the device's report, which is
 * the same order SDL uses for it; that is what lets a profile measured here
 * drive FreeSpace Open. Hats arrive as one axis encoding the direction.
 */

/** Steps in order. `optional` ones can be skipped when the device lacks the control. */
export const CALIBRATION_STEPS = [
  { key: "stickX", kind: "axis", prompt: "Move the stick fully left and right" },
  { key: "stickY", kind: "axis", prompt: "Move the stick fully forward and back" },
  { key: "throttle", kind: "axis", prompt: "Move the throttle from minimum to maximum", optional: true },
  { key: "twist", kind: "axis", prompt: "Twist the stick left and right", optional: true },
  { key: "rocker", kind: "axis", prompt: "Rock the throttle's rudder rocker, if it has one", optional: true },
  { key: "fire", kind: "button", prompt: "Press the button you want for primary fire" },
  { key: "altFire", kind: "button", prompt: "Press the button for secondary fire", optional: true },
  { key: "targetNearest", kind: "button", prompt: "Press the button for target nearest enemy", optional: true },
  { key: "cyclePrimary", kind: "button", prompt: "Press the button to cycle primary weapons", optional: true },
  { key: "cycleSecondary", kind: "button", prompt: "Press the button to cycle secondary weapons", optional: true },
  { key: "targetReticle", kind: "button", prompt: "Press the button to target what's under the reticle", optional: true },
  { key: "pause", kind: "button", prompt: "Press the button for pause", optional: true },
  { key: "hatRight", kind: "hat", prompt: "Push the hat switch to the right", optional: true },
  { key: "hatUp", kind: "hat", prompt: "Push the hat switch up", optional: true },
];

/**
 * Axes resting at full deflection. Only a candidate list: a throttle parked at
 * minimum rests at -1 too, so an axis is called unusable (the HOTAS 4's RX)
 * only if calibration never assigns it. A centred hat reads above 1 and is not
 * an axis at all.
 */
export function pinnedAxes(idle) {
  return (idle?.axes || []).flatMap((value, index) => (Math.abs(value) > 0.95 && Math.abs(value) <= 1.05 ? [index] : []));
}

/**
 * Which axis the player moved: the one with the widest range across the
 * samples, ignoring pinned axes, ones already assigned, and anything that
 * barely moved. Null until a clear winner exists.
 */
export function movedAxis(samples, { exclude = [] } = {}) {
  if (!Array.isArray(samples) || samples.length < 2) return null;
  const count = Math.max(...samples.map((s) => s.axes?.length || 0));
  let best = null;
  for (let i = 0; i < count; i++) {
    if (exclude.includes(i)) continue;
    const values = samples.map((s) => s.axes?.[i]).filter((v) => typeof v === "number");
    if (values.length < 2) continue;
    const range = Math.max(...values) - Math.min(...values);
    if (range > 0.8 && (!best || range > best.range)) best = { index: i, range };
  }
  return best ? best.index : null;
}

/** First button pressed now that was not pressed at rest, or null. */
export function pressedButton(idle, now, { exclude = [] } = {}) {
  const buttons = now?.buttons || [];
  for (let i = 0; i < buttons.length; i++) {
    if (exclude.includes(i)) continue;
    if (buttons[i] && !idle?.buttons?.[i]) return i;
  }
  return null;
}

/*
 * A DirectInput hat read through the Gamepad API is one axis stepping through
 * eight positions from -1 (up) clockwise; at rest it reads above 1. Only the
 * four cardinal positions matter here.
 */
const POV_CARDINALS = [
  ["up", -1],
  ["right", -3 / 7],
  ["down", 1 / 7],
  ["left", 5 / 7],
];

/** The direction a hat axis value reports, or null when centred or diagonal. */
export function povDirection(value) {
  if (typeof value !== "number" || value > 1.05) return null;
  const hit = POV_CARDINALS.find(([, v]) => Math.abs(value - v) < 0.07);
  return hit ? hit[0] : null;
}

/** The hat axis: one that rests above 1 (centred POV) and now reads a cardinal direction. */
export function hatReading(idle, now) {
  const axes = now?.axes || [];
  for (let i = 0; i < axes.length; i++) {
    if (typeof idle?.axes?.[i] === "number" && idle.axes[i] > 1.05) {
      const direction = povDirection(axes[i]);
      if (direction) return { index: i, direction };
    }
  }
  // Pads with a standard mapping expose the d-pad as buttons 12–15.
  const pad = [["up", 12], ["down", 13], ["left", 14], ["right", 15]].find(([, b]) => now?.buttons?.[b] && !idle?.buttons?.[b]);
  return pad ? { index: null, direction: pad[0] } : null;
}

/**
 * The hat map a profile stores: for each physical push, the direction the
 * device reports. Measured from two pushes (right and up); the other two
 * follow, since a hat that swaps one pair swaps it symmetrically.
 */
export function hatMapFrom(reportedRight, reportedUp) {
  const order = ["up", "right", "down", "left"];
  if (!order.includes(reportedRight) || !order.includes(reportedUp)) {
    return { up: "up", right: "right", down: "down", left: "left" };
  }
  const opposite = (d) => order[(order.indexOf(d) + 2) % 4];
  const map = { up: reportedUp, right: reportedRight, down: opposite(reportedUp), left: opposite(reportedRight) };
  return new Set(Object.values(map)).size === 4 ? map : { up: "up", right: "right", down: "down", left: "left" };
}

/** Assemble the profile from what each step captured. */
export function buildCalibratedProfile({ vidPid, label, idle, captured }) {
  const axes = {};
  for (const key of ["stickX", "stickY", "throttle", "twist", "rocker"]) {
    if (Number.isInteger(captured[key])) axes[key] = captured[key];
  }
  const buttons = {};
  const roles = {};
  for (const step of CALIBRATION_STEPS.filter((s) => s.kind === "button")) {
    const index = captured[step.key];
    if (!Number.isInteger(index)) continue;
    const name = `Button ${index + 1}`;
    buttons[name] = index;
    roles[step.key] = name;
  }
  return {
    id: `calibrated-${String(vidPid).replace(":", "-")}`,
    vidPid,
    label: String(label || "Flight device").replace(/\s*\(.*$/, "").trim().slice(0, 60) || "Flight device",
    deviceType: Number.isInteger(axes.throttle) ? "hotas" : "flightstick",
    axes,
    unusableAxes: pinnedAxes(idle).filter((i) => !Object.values(axes).includes(i)),
    buttons,
    roles,
    hat: hatMapFrom(captured.hatRight, captured.hatUp),
  };
}

/** A plain snapshot of a live Gamepad; live objects cannot be compared over time. */
export function snapshot(pad) {
  return {
    axes: Array.from(pad?.axes || []),
    buttons: Array.from(pad?.buttons || []).map((b) => Boolean(b?.pressed)),
  };
}
