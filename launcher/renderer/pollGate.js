/*
 * Whether a poll should actually fire.
 *
 * The launcher lives in the tray. It is open far more hours than it is looked
 * at, and every one of those hours it was asking the server for friends,
 * parties and chat at full cadence — a request every few seconds, each one an
 * auth lookup plus a dozen database reads, for a window nobody had on screen.
 * Across a userbase that is the bulk of both the function invocations and the
 * connection pressure, and none of it renders anything.
 *
 * The rule is deliberately narrow, because the failure mode of over-applying
 * it is worse than the cost it saves: a member who stops polling misses their
 * leader launching the game. So a tick is only skipped when the window is
 * hidden AND nothing is happening — no live party, no game running. Anything
 * in flight keeps its cadence exactly as before.
 *
 * The long-idle case is the other half. A launcher left open on screen while
 * its owner is asleep is as pointless as a minimised one, and the main process
 * is the only side that can tell (the renderer sees no input either way when a
 * game has focus), so it pushes the answer in.
 */

let systemIdle = false;

/**
 * Told by the main process that the machine has been idle past its threshold,
 * or has come back. Safe to never call — the gate just never considers idle.
 */
export function setSystemIdle(idle) {
  systemIdle = Boolean(idle);
}

export function isSystemIdle() {
  return systemIdle;
}

/**
 * @param {{ liveParty?: boolean, playing?: boolean }} activity what is going on
 *   right now; either being true keeps polling at full cadence regardless.
 * @returns {boolean} true when this tick should be skipped
 */
export function pollSuspended(activity = {}) {
  if (activity.liveParty || activity.playing) return false;
  const hidden = typeof document !== "undefined" && document.hidden;
  return Boolean(hidden || systemIdle);
}
