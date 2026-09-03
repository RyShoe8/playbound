const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("playbound", {
  platform: {
    getOS: () => (process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux"),
    getOSVersion: () => process.getSystemVersion(),
    getArchitecture: () => process.arch,
    supportsDesktopShortcuts: () => process.platform === "win32",
    supportsDock: () => process.platform === "darwin",
    /** Short UI noun for the thing users pick when locating an install. */
    executableLabel: () =>
      process.platform === "darwin" ? "app" : process.platform === "win32" ? ".exe" : "binary",
    selectExecutableLabel: () =>
      process.platform === "darwin" ? "Select App" : "Select .exe",
  },
  // Existing
  getBootstrapState: () => ipcRenderer.invoke("get-bootstrap-state"),
  getContext: () => ipcRenderer.invoke("get-context"),
  chooseDirectory: (defaultPath) => ipcRenderer.invoke("choose-directory", defaultPath),
  install: (slug, targetDir, editionSlug, addons) =>
    ipcRenderer.invoke("install", slug, targetDir, editionSlug || null, addons),
  installMod: (slug, baseDir) => ipcRenderer.invoke("install-mod", slug, baseDir || null),
  locateExe: (slug) => ipcRenderer.invoke("locate-exe", slug),
  scanLibraryCandidates: () => ipcRenderer.invoke("scan-library-candidates"),
  addScannedGames: (slugs) => ipcRenderer.invoke("add-scanned-games", slugs || []),
  addCustomGame: (customTitle) => ipcRenderer.invoke("add-custom-game", customTitle || null),
  dismissPendingInstall: (slug) => ipcRenderer.invoke("dismiss-pending-install", slug),
  play: (slug, join, editionSlug) => {
    try {
      const pads = Array.from(navigator.getGamepads?.() || [])
        .filter(Boolean)
        .map((p) => ({ id: p.id, mapping: p.mapping, connected: p.connected }));
      void ipcRenderer.invoke("report-gamepads", pads);
    } catch {
      /* ignore */
    }
    return ipcRenderer.invoke("play", slug, join || null, editionSlug || null);
  },
  playMod: (slug) => ipcRenderer.invoke("play-mod", slug),
  /**
   * Whether this game can be joined from the command line.
   *
   * Synchronous because the library renders a button on it, and the answer is
   * a lookup in a static table in the main process — going async would mean
   * every card flickering a button in after paint.
   */
  joinCapability: (slug) => ipcRenderer.sendSync("join-capability", slug),
  /**
   * Per-game "always run as administrator".
   *
   * Settable before anything goes wrong, so a game known to need elevation
   * does not have to fail once to be configured — which is the only route a
   * custom-added game has, since it has no catalog row to carry the flag.
   */
  getRunAsAdmin: (slug) => ipcRenderer.invoke("get-run-as-admin", slug),
  setRunAsAdmin: (slug, on) => ipcRenderer.invoke("set-run-as-admin", slug, Boolean(on)),
  findBestServer: (slug) => ipcRenderer.invoke("find-best-server", slug),
  postTelemetry: (payload) => ipcRenderer.invoke("post-telemetry", payload),
  uninstall: (slug, editionSlug) => ipcRenderer.invoke("uninstall", slug, editionSlug || null),
  getInstalled: () => ipcRenderer.invoke("get-installed"),
  getInstalledMods: () => ipcRenderer.invoke("get-installed-mods"),
  getCloudLibrary: () => ipcRenderer.invoke("get-cloud-library"),
  uninstallMod: (slug) => ipcRenderer.invoke("uninstall-mod", slug),
  createShortcut: (slug) => ipcRenderer.invoke("create-shortcut", slug),
  // Save backups. Local and versioned; see services/SaveData.js.
  savesList: (slug, editionSlug) => ipcRenderer.invoke("saves-list", slug, editionSlug || null),
  savesSnapshot: (slug, editionSlug) => ipcRenderer.invoke("saves-snapshot", slug, editionSlug || null),
  savesRestore: (slug, editionSlug, snapshotId) =>
    ipcRenderer.invoke("saves-restore", slug, editionSlug || null, snapshotId),
  savesOpenFolder: (slug, editionSlug) =>
    ipcRenderer.invoke("saves-open-folder", slug, editionSlug || null),
  savesSyncStatus: (slug, editionSlug) =>
    ipcRenderer.invoke("saves-sync-status", slug, editionSlug || null),
  savesUpload: (slug, editionSlug) => ipcRenderer.invoke("saves-upload", slug, editionSlug || null),
  savesDownload: (slug, editionSlug, snapshotId) =>
    ipcRenderer.invoke("saves-download", slug, editionSlug || null, snapshotId || null),
  openFolder: (dir) => ipcRenderer.invoke("open-folder", dir),
  clearContext: () => ipcRenderer.invoke("clear-context"),
  openExternal: (url, opts) => ipcRenderer.invoke("open-external", url, opts || null),
  openDeepLink: (url) => ipcRenderer.invoke("open-deep-link", url),
  closeWindow: () => ipcRenderer.invoke("close-window"),
  openFriendsPopout: () => ipcRenderer.invoke("open-friends-popout"),
  closeFriendsPopout: () => ipcRenderer.invoke("close-friends-popout"),
  showMainWindow: (opts) => ipcRenderer.invoke("show-main-window", opts || {}),
  clipboardWrite: (text) => ipcRenderer.invoke("clipboard-write", text),
  /** Report connected gamepads so games can be auto-configured at launch. */
  reportGamepads: (pads) => ipcRenderer.invoke("report-gamepads", pads),
  startGamepadBridge: (profile) => ipcRenderer.invoke("gamepad-bridge-start", profile || {}),
  stopGamepadBridge: () => ipcRenderer.invoke("gamepad-bridge-stop"),
  gamepadBridgeSendFrame: (frame) => ipcRenderer.send("gamepad-bridge-frame", frame),
  getAccount: () => ipcRenderer.invoke("get-account"),
  setLauncherToken: (token) => ipcRenderer.invoke("set-launcher-token", token),
  clearLauncherToken: () => ipcRenderer.invoke("clear-launcher-token"),
  signIn: () => ipcRenderer.invoke("sign-in"),
  syncLibraryNow: (opts) => ipcRenderer.invoke("sync-library-now", opts || {}),
  reportBug: (payload) => ipcRenderer.invoke("report-bug", payload || {}),

  // Friends API
  getFriends: () => ipcRenderer.invoke("get-friends"),
  getFriendRequests: () => ipcRenderer.invoke("get-friend-requests"),
  acceptFriendRequest: (requestId) => ipcRenderer.invoke("accept-friend-request", requestId),
  declineFriendRequest: (requestId) => ipcRenderer.invoke("decline-friend-request", requestId),
  cancelFriendRequest: (requestId) => ipcRenderer.invoke("cancel-friend-request", requestId),
  blockUser: (targetUserId) => ipcRenderer.invoke("block-user", targetUserId),
  getAppearOffline: () => ipcRenderer.invoke("get-appear-offline"),
  setAppearOffline: (appearOffline) => ipcRenderer.invoke("set-appear-offline", appearOffline),
  /** Reads the hourly cache unless { force: true } — see main.js. */
  getHardwareProfile: (opts) => ipcRenderer.invoke("get-hardware-profile", opts || {}),
  syncHardwareProfile: () => ipcRenderer.invoke("sync-hardware-profile"),
  getHardwareCompatibility: (gameSlug, opts) =>
    ipcRenderer.invoke("get-hardware-compatibility", gameSlug, opts || {}),
  ensureManagedJava: (opts) => ipcRenderer.invoke("ensure-managed-java", opts || {}),
  getJavaStatus: () => ipcRenderer.invoke("get-java-status"),
  removeFriend: (friendId) => ipcRenderer.invoke("remove-friend", friendId),
  presenceHeartbeat: (payload) => ipcRenderer.invoke("presence-heartbeat", payload || {}),
  getPlayingGame: () => ipcRenderer.invoke("get-playing-game"),
  searchUsers: (query) => ipcRenderer.invoke("search-users", query),
  discoverPlayers: (params) => ipcRenderer.invoke("discover-players", params),
  sendFriendRequest: (targetUserId) => ipcRenderer.invoke("send-friend-request", targetUserId),
  inviteFriendByEmail: (email) => ipcRenderer.invoke("invite-friend-by-email", email),
  getFriendsUpcomingEvents: () => ipcRenderer.invoke("get-friends-upcoming-events"),
  getNotifications: () => ipcRenderer.invoke("get-notifications"),
  markNotificationsRead: (opts) => ipcRenderer.invoke("mark-notifications-read", opts || {}),
  showDesktopNotification: (opts) => ipcRenderer.invoke("show-desktop-notification", opts || {}),
  playInviteAction: (inviteId, action) =>
    ipcRenderer.invoke("play-invite-action", inviteId, action),
  getParties: (opts) => ipcRenderer.invoke("get-parties", opts),
  createParty: (opts) => ipcRenderer.invoke("create-party", opts || {}),
  joinParty: (partyId, password) => ipcRenderer.invoke("join-party", partyId, password),
  leaveParty: (partyId) => ipcRenderer.invoke("leave-party", partyId),
  inviteToParty: (partyId, friendIds) => ipcRenderer.invoke("invite-to-party", partyId, friendIds || []),
  setPartyGame: (partyId, gameSlug) => ipcRenderer.invoke("update-party", partyId, { gameSlug }),
  setPartyEdition: (partyId, editionSlug) =>
    ipcRenderer.invoke("update-party", partyId, { editionSlug: editionSlug || null }),
  setPartyOpenRaMod: (partyId, openRaMod) =>
    ipcRenderer.invoke("update-party", partyId, { openRaMod: openRaMod || null }),
  setPartyHostMode: (partyId, hostMode) => ipcRenderer.invoke("update-party", partyId, { hostMode }),
  // Publishes the leader's couch join code to the party; null clears it.
  setPartyCouchSession: (partyId, session) =>
    ipcRenderer.invoke("update-party", partyId, { couchSession: session ?? null }),
  setPartyPublicServer: (partyId, publicServer) =>
    ipcRenderer.invoke("update-party", partyId, { publicServer }),
  prepareSelfHost: (input) => ipcRenderer.invoke("prepare-self-host", input || {}),
  releaseSelfHost: (input) => ipcRenderer.invoke("release-self-host", input || {}),
  startHedgewarsLocalServer: (input) => ipcRenderer.invoke("start-hedgewars-local-server", input || {}),
  stopHedgewarsLocalServer: () => ipcRenderer.invoke("stop-hedgewars-local-server"),
  setPartyName: (partyId, name) => ipcRenderer.invoke("update-party", partyId, { name }),
  setPartyVisibility: (partyId, visibility) =>
    ipcRenderer.invoke("update-party", partyId, { visibility }),
  setPartyReady: (partyId, ready) => ipcRenderer.invoke("set-party-ready", partyId, ready),
  partyJoinGame: (partyId) => ipcRenderer.invoke("party-join-game", partyId),
  markSelfHostReady: (partyId) => ipcRenderer.invoke("mark-self-host-ready", partyId),
  probeLocalServer: (port) => ipcRenderer.invoke("probe-local-server", port),
  exitPartyGame: (partyId) => ipcRenderer.invoke("exit-party-game", partyId),
  endParty: (partyId) => ipcRenderer.invoke("end-party", partyId),
  removePartyMember: (partyId, userId) =>
    ipcRenderer.invoke("remove-party-member", partyId, userId),
  transferPartyLeadership: (partyId, userId) =>
    ipcRenderer.invoke("transfer-party-leadership", partyId, userId),
  provisionPartyDiscord: (partyId) => ipcRenderer.invoke("provision-party-discord", partyId),
  // Join the party's overlay segment and point the game's saved-adapter file at it.
  prepareVirtualLan: (opts) => ipcRenderer.invoke("prepare-virtual-lan", opts),
  onVirtualLanProgress: (cb) => {
    const listener = (_event, msg) => cb(msg);
    ipcRenderer.on("virtual-lan-progress", listener);
    return () => ipcRenderer.removeListener("virtual-lan-progress", listener);
  },
  getPartyChat: (partyId, after) => ipcRenderer.invoke("get-party-chat", partyId, after || null),
  sendPartyChat: (partyId, content) => ipcRenderer.invoke("send-party-chat", partyId, content),
  /** Prefers the Discord desktop app, falls back to the browser. */
  openDiscordInvite: (inviteUrl) => ipcRenderer.invoke("open-discord-invite", inviteUrl),
  setPresenceVisibility: (patch) => ipcRenderer.invoke("set-presence-visibility", patch || {}),
  getLfg: () => ipcRenderer.invoke("get-lfg"),
  setLfg: (enabled, gameSlug) => ipcRenderer.invoke("set-lfg", enabled, gameSlug || null),
  getDiscordStatus: () => ipcRenderer.invoke("get-discord-status"),
  linkDiscord: () => ipcRenderer.invoke("link-discord"),
  // Catalog / servers / mods
  getCatalog: (opts) => ipcRenderer.invoke("get-catalog", opts || {}),
  refreshCatalog: () => ipcRenderer.invoke("get-catalog", { refresh: true }),
  getServers: (slug) => ipcRenderer.invoke("get-servers", slug),
  getServerIndex: () => ipcRenderer.invoke("get-server-index"),
  getPartySync: (opts) => ipcRenderer.invoke("get-party-sync", opts || {}),

  // In-game overlay. See docs/server-control.md.
  startSelfHostServer: (partyId, slug) =>
    ipcRenderer.invoke("start-self-host-server", partyId, slug),
  stopSelfHostServer: (partyId) => ipcRenderer.invoke("stop-self-host-server", partyId),
  toggleOverlay: () => ipcRenderer.invoke("toggle-overlay"),
  hideOverlay: () => ipcRenderer.invoke("hide-overlay"),
  getOverlayContext: () => ipcRenderer.invoke("overlay-context"),
  getOverlayShortcut: () => ipcRenderer.invoke("get-overlay-shortcut"),
  setOverlayShortcut: (accelerator) => ipcRenderer.invoke("set-overlay-shortcut", accelerator),
  onOverlayOpened: (cb) => ipcRenderer.on("overlay-opened", () => cb()),
  getServerSettings: (partyId) => ipcRenderer.invoke("get-server-settings", partyId),
  applyServerSettings: (partyId, settings) =>
    ipcRenderer.invoke("apply-server-settings", partyId, settings),
  getConnectMeta: (slug) => ipcRenderer.invoke("get-connect-meta", slug),
  pingServers: (servers) => ipcRenderer.invoke("ping-servers", servers),
  getAllServers: () => ipcRenderer.invoke("get-all-servers"),
  getModsCatalog: () => ipcRenderer.invoke("get-mods-catalog"),
  getGearCatalog: () => ipcRenderer.invoke("get-gear-catalog"),
  getEvents: (opts) => ipcRenderer.invoke("get-events", opts || {}),
  getEventDetail: (id) => ipcRenderer.invoke("get-event-detail", id),
  createEvent: (data) => ipcRenderer.invoke("create-event", data),
  uploadEventCover: (fileBuffer, fileName, mimeType) =>
    ipcRenderer.invoke("upload-event-cover", fileBuffer, fileName, mimeType),
  rsvpEvent: (id, status) => ipcRenderer.invoke("rsvp-event", id, status),
  cancelEvent: (id) => ipcRenderer.invoke("cancel-event", id),
  deleteEvent: (id) => ipcRenderer.invoke("delete-event", id),
  tournamentAction: (id, action, data) =>
    ipcRenderer.invoke("tournament-action", id, action, data || {}),
  getFreeOffers: () => ipcRenderer.invoke("get-free-offers"),
  pingHosts: (hosts) => ipcRenderer.invoke("ping-hosts", hosts),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (patch) => ipcRenderer.invoke("save-settings", patch),
  getRecentlyPlayed: () => ipcRenderer.invoke("get-recently-played"),
  getGameDetail: (slug) => ipcRenderer.invoke("get-game-detail", slug),
  getModDetail: (slug) => ipcRenderer.invoke("get-mod-detail", slug),
  getGearDetail: (slug) => ipcRenderer.invoke("get-gear-detail", slug),
  getLiveStats: (opts) => ipcRenderer.invoke("get-live-stats", opts || {}),
  getEditions: (gameSlug) => ipcRenderer.invoke("get-editions", gameSlug || null),
  getGameGuides: (slug) => ipcRenderer.invoke("get-game-guides", slug),
  getModGuides: (slug) => ipcRenderer.invoke("get-mod-guides", slug),
  getGameReleases: (slug) => ipcRenderer.invoke("get-game-releases", slug),
  getGameReviews: (slug) => ipcRenderer.invoke("get-game-reviews", slug),
  getGameDiscussions: (slug) => ipcRenderer.invoke("get-game-discussions", slug),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  getCompatibilityRunners: () => ipcRenderer.invoke("get-compatibility-runners"),
  getOpenCiv3Display: () => ipcRenderer.invoke("get-openciv3-display"),
  setOpenCiv3Display: (payload) => ipcRenderer.invoke("set-openciv3-display", payload || {}),

  // Couch Mode — phone as controller
  couchStart: (opts) => ipcRenderer.invoke("couch-start", opts || {}),
  couchStop: () => ipcRenderer.invoke("couch-stop"),
  couchState: () => ipcRenderer.invoke("couch-state"),
  couchRefresh: () => ipcRenderer.invoke("couch-refresh"),
  couchControllerAction: (action, controllerId, playerSlot) =>
    ipcRenderer.invoke("couch-controller-action", action, controllerId, playerSlot),
  couchProbeDriver: () => ipcRenderer.invoke("couch-probe-driver"),
  couchRendererMessage: (payload) => ipcRenderer.invoke("couch-renderer-message", payload || {}),
  couchSignalPost: (body) => ipcRenderer.invoke("couch-signal-post", body || {}),
  couchSignalPoll: (since) => ipcRenderer.invoke("couch-signal-poll", since || 0),
  onCouchState: (cb) => ipcRenderer.on("couch-state", (_event, data) => cb(data || {})),
  onCouchStatus: (cb) => ipcRenderer.on("couch-status", (_event, data) => cb(data || {})),
  onCouchPeerSend: (cb) =>
    ipcRenderer.on("couch-peer-send", (_event, data) => cb(data || {})),
  getControllerSupport: (slug) => ipcRenderer.invoke("get-controller-support", slug),

  getInstallQueue: () => ipcRenderer.invoke("get-install-queue"),
  cancelInstallQueueItem: (slug, editionSlug) =>
    ipcRenderer.invoke("cancel-install-queue-item", slug, editionSlug || null),
  // Events
  onCatalogUpdated: (cb) => ipcRenderer.on("catalog-updated", (_event, data) => cb(data || [])),
  onLiveStatsUpdated: (cb) => ipcRenderer.on("live-stats-updated", (_event, data) => cb(data || {})),
  onContext: (cb) => ipcRenderer.on("context", (_event, data) => cb(data)),
  onProgress: (cb) => ipcRenderer.on("progress", (_event, data) => cb(data)),
  onInstallQueueUpdated: (cb) =>
    ipcRenderer.on("install-queue-updated", (_event, data) => cb(data || {})),
  onAccount: (cb) => ipcRenderer.on("account", (_event, data) => cb(data || {})),
  onInstallDetected: (cb) => ipcRenderer.on("install-detected", (_event, data) => cb(data || {})),
  onInstallDetectFailed: (cb) =>
    ipcRenderer.on("install-detect-failed", (_event, data) => cb(data || {})),
  onInstallScan: (cb) => ipcRenderer.on("install-scan", (_event, data) => cb(data || {})),
  onModInstallFinished: (cb) =>
    ipcRenderer.on("mod-install-finished", (_event, data) => cb(data || {})),
  onUpdateStatus: (cb) => ipcRenderer.on("update-status", (_event, data) => cb(data || {})),
  onGameExited: (cb) => ipcRenderer.on("game-exited", (_event, data) => cb(data || {})),
  onGameStarted: (cb) => ipcRenderer.on("game-started", (_event, data) => cb(data || {})),
  onNavigate: (cb) => ipcRenderer.on("navigate", (_event, data) => cb(data || {})),
});
