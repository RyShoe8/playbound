"use strict";
/** Bound background retries and report a persistent outage once per episode. */
function createRemotePlayHealth({ now = Date.now, report }) {
  const phases = new Map();
  return {
    ready(phase) { return now() >= (phases.get(phase)?.retryAt || 0); },
    recovered(phase) { phases.delete(phase); },
    failed(phase, message) {
      const count = (phases.get(phase)?.count || 0) + 1;
      phases.set(phase, { count, retryAt: now() + Math.min(60_000, 4000 * 2 ** Math.min(count - 1, 4)) });
      if (count === 3) report(phase, message);
    },
  };
}
/** An old request cannot sign out a newly linked account. */
async function confirmRemotePlaySession({ token, currentToken, validate, expired }) {
  if (!token || currentToken() !== token) return "changed";
  const result = await validate(token);
  if (currentToken() !== token) return "changed";
  if (result.transient) return "unknown";
  if (result.valid) return "valid";
  expired();
  return "expired";
}
module.exports = { createRemotePlayHealth, confirmRemotePlaySession };
