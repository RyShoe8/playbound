/**
 * Couch Mode input authentication.
 *
 * A controller is bound to one approved slot after it presents the host
 * wsToken (LAN) and/or its sessionToken (any transport). Input packets then
 * use that bound slot — the packet's `p` field is ignored so a client cannot
 * write into someone else's virtual pad.
 */

"use strict";

/**
 * @param {object} msg
 * @param {object} opts
 * @param {string} opts.expectedWsToken
 * @param {boolean} opts.requireWsToken
 * @param {Array<{ controllerId?: string, sessionToken?: string|null, playerSlot?: number|null, status?: string }>} opts.controllers
 */
function authenticateCouchClient(msg, opts) {
  if (!msg || typeof msg !== "object") return { ok: false, reason: "invalid" };
  if (msg.type !== "auth" && msg.type !== "hello") {
    return { ok: false, reason: "not-auth" };
  }
  if (opts.requireWsToken) {
    if (!opts.expectedWsToken || msg.wsToken !== opts.expectedWsToken) {
      return { ok: false, reason: "bad-ws-token" };
    }
  }
  const controllerId = typeof msg.controllerId === "string" ? msg.controllerId : "";
  const sessionToken = typeof msg.sessionToken === "string" ? msg.sessionToken : "";
  if (!controllerId || !sessionToken) {
    return { ok: false, reason: "missing-credentials" };
  }
  const row = (opts.controllers || []).find((c) => c.controllerId === controllerId);
  if (!row || row.status !== "approved") {
    return { ok: false, reason: "not-approved" };
  }
  if (!row.sessionToken || row.sessionToken !== sessionToken) {
    return { ok: false, reason: "not-approved" };
  }
  if (row.playerSlot == null || !Number.isInteger(row.playerSlot) || row.playerSlot < 0) {
    if (row.spectator === true && row.playerSlot == null) {
      return { ok: true, controllerId, playerSlot: null, sessionToken };
    }
    return { ok: false, reason: "no-slot" };
  }
  return { ok: true, controllerId, playerSlot: row.playerSlot, sessionToken };
}

/** Resolve every multiplexed frame against the host's approved identities. */
function authenticatedInputSlot(controllerId, sessionToken, controllers) {
  if (!controllerId || !sessionToken) return null;
  const row = (controllers || []).find((c) => c.controllerId === controllerId);
  if (!row || row.status !== "approved" || row.spectator || row.sessionToken !== sessionToken) return null;
  return Number.isInteger(row.playerSlot) && row.playerSlot >= 0 ? row.playerSlot : null;
}

function bindInputToSlot(parsed, playerSlot) {
  if (!parsed || playerSlot == null) return null;
  return { ...parsed, p: playerSlot };
}

module.exports = { authenticateCouchClient, authenticatedInputSlot, bindInputToSlot };
