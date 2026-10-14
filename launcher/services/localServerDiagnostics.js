"use strict";

/** Local-only diagnostics. This never relays commands or logs over the network. */
function createLocalDiagnosticsHandler({ launcherJson, localServers }) {
  return async (_event, partyId) => {
    if (!/^[a-f0-9]{24}$/i.test(String(partyId || ""))) return { error: "Invalid party" };
    try {
      const access = await launcherJson(`/api/parties/${partyId}/server-settings`);
      if (!access?.canEdit || access.controlKind !== "local") return { error: "Only the self-hosting party leader can read local diagnostics" };
      const entry = localServers.get(partyId);
      if (!entry) return { running: false, lines: [], startedAt: null };
      return {
        running: entry.child.exitCode == null && entry.child.signalCode == null,
        startedAt: entry.startedAt,
        lines: entry.logs.slice(-100),
      };
    } catch { return { error: "Could not verify access to this local server" }; }
  };
}

function createLocalRestartHandler({ launcherJson }) {
  return async (_event, partyId) => {
    if (!/^[a-f0-9]{24}$/i.test(String(partyId || ""))) return { error: "Invalid party" };
    try {
      return await launcherJson(`/api/parties/${partyId}/server-action`, { method: "POST", body: { action: "restart" } });
    } catch { return { error: "Could not queue the local server restart" }; }
  };
}
module.exports = { createLocalDiagnosticsHandler, createLocalRestartHandler };
