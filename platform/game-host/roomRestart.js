/**
 * Whether a room whose process just exited should be started again.
 *
 * Several dedicated servers are not long-lived processes. OpenRA's own
 * launch-dedicated.sh wraps the server in `while true` precisely because it
 * exits when a game ends — upstream treats one process as one match. The agent
 * spawned it once, so the end of a match looked identical to the server dying:
 * everyone was booted mid-session and the party wound itself back with the room
 * gone.
 *
 * The judgement worth making is between a server that finished and a binary
 * that cannot run. A process that lasted twenty minutes and exited has done its
 * job and should come back; one that dies in two seconds will die again, and
 * restarting it in a loop turns a broken install into a busy VPS.
 *
 * Run: node roomRestart.test.js
 */

/** Enough restarts to cover an evening of matches, few enough to notice a fault. */
const MAX_RESTARTS = 5;

/**
 * A server that did not survive this long never hosted anything. Bind failures,
 * missing data files and bad argv all land well inside it.
 */
const MIN_HEALTHY_MS = 15_000;

function shouldRestartRoom({
  deliberate = false,
  restarts = 0,
  uptimeMs = 0,
  maxRestarts = MAX_RESTARTS,
  minHealthyMs = MIN_HEALTHY_MS,
} = {}) {
  if (deliberate) {
    return { restart: false, reason: "the room was stopped on purpose" };
  }
  if (restarts >= maxRestarts) {
    return { restart: false, reason: `already restarted ${restarts} times` };
  }
  if (uptimeMs < minHealthyMs) {
    return {
      restart: false,
      reason: `only stayed up ${Math.round(uptimeMs / 1000)}s, which is a failure to start rather than a finished match`,
    };
  }
  return { restart: true, reason: "exited on its own after a healthy run" };
}

export { shouldRestartRoom, MAX_RESTARTS, MIN_HEALTHY_MS };
