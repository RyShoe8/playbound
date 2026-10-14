const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("playbound", {
  getOverlayContext: async () => ({ party: { id: "0123456789abcdef01234567", gameSlug: "openarena", gameTitle: "Local fixture" } }),
  getServerSettings: async () => ({ supported: true, phase: "live", canEdit: process.env.PLAYBOUND_SMOKE_LOCAL_ROLE !== "member", controlKind: "local", gameSlug: "openarena", partySize: 2,
    capabilities: { liveApply: false, restart: true }, status: { status: "running", host: null, port: 27960 }, values: { bots: 1 },
    definitions: [{ key: "bots", label: "Bot fill", feature: "bots", type: "number", min: 0, max: 16, default: 1, apply: "live" }] }),
  getLocalServerDiagnostics: async () => ({ running: true, lines: ["Server ready", "<script>do not execute</script>"] }),
  applyServerSettings: async (_id, settings) => ({ outcome: "queued", applied: settings, status: { status: "pending" } }),
  restartLocalPartyServer: async () => ({ outcome: "queued" }),
  hideOverlay: async () => {},
});
