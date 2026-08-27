import { renderHomeView } from "./home.js";
import {
  api,
  applyAccountToSidebar,
  applyCompatibilitySetting,
  applyDiscoverySetting,
  bindViews,
  cacheInvalidate,
  cachePut,
  DISCORD_INVITE,
  editionsContextSlug,
  endGameSession,
  fmtBytes,
  loadCompatibilitySetting,
  refreshAccountStatus,
  runStatusAction,
  selectExecutableLabel,
  isViewReady,
  markViewDirty,
  prefetchGameDetail,
  setCatalogCache,
  setCompatibilityFilter,
  setDiscoveryMode,
  setInstallQueueState,
  setProgress,
  setStatus,
  setStatusAction,
  shouldReturnToFriendsAfterPartyInstall,
  clearPartyInstallReturn,
  state,
  toggleQueuePopover,
  updateGamesFamilyNav,
  updateInstallQueueUI,
  views,
  wireEnhanceSelect,
} from "./shared.js";
import {
  wireNotifications,
  onNotificationsAccountChanged,
  closeNotificationsPanel,
} from "./notifications.js";

async function finishPartyInstallReturn(slug) {
  if (!shouldReturnToFriendsAfterPartyInstall(slug)) return false;
  clearPartyInstallReturn();
  setStatus("Install complete — back in your party.");
  const areaSlot = document.getElementById("friends-party-area");
  if (areaSlot) areaSlot.dataset.sig = "";
  await navigateTo("friends", { force: true });
  return true;
}

const KEEP_ALIVE = new Set([
  "home",
  "games",
  "mods",
  "gear",
  "events",
  "servers",
  "friends",
  "settings",
  "library",
  "couch",
]);

function isSameDeepLinkContext(a, b) {
  if (!a || !b) return false;
  if (a.action !== b.action || String(a.slug || "") !== String(b.slug || "")) return false;
  if (String(a.editionSlug || "") !== String(b.editionSlug || "")) return false;
  if (a.action === "install-mod") {
    return Boolean(a.mod) === Boolean(b.mod) && String(a.modError || "") === String(b.modError || "");
  }
  if (a.action === "join") {
    return (
      String(a.join?.host || "") === String(b.join?.host || "") &&
      Number(a.join?.port || 0) === Number(b.join?.port || 0)
    );
  }
  return true;
}

const viewLoaders = {
  games: () => import("./views/games.js"),
  search: () => import("./views/search.js"),
  library: () => import("./views/library.js"),
  couch: () => import("./views/couch.js"),
  friends: () => import("./views/friends.js"),
  gear: () => import("./views/gear.js"),
  gearDetail: () => import("./views/gear.js"),
  editions: () => import("./views/editions.js"),
  mods: () => import("./views/mods.js"),
  events: () => import("./views/events.js"),
  eventDetail: () => import("./views/events.js"),
  servers: () => import("./views/servers.js"),
  settings: () => import("./views/settings.js"),
  gameDetail: () => import("./views/detail.js"),
  modDetail: () => import("./views/detail.js"),
  editionDetail: () => import("./views/detail.js"),
  deepLink: () => import("./views/deep-link.js"),
};

const loadedViews = new Set();

async function ensureViewModule(viewName) {
  const key =
    viewName === "gameDetail" || viewName === "modDetail" || viewName === "editionDetail"
      ? "detail"
      : viewName === "eventDetail"
        ? "events"
        : viewName === "gearDetail"
          ? "gear"
          : viewName;
  if (loadedViews.has(key)) return;
  const load = viewLoaders[viewName];
  if (!load) return;
  await load();
  loadedViews.add(key);
}

function applyNavChrome(viewName) {
  const navBtns = document.querySelectorAll(".nav-btn");
  const navKey =
    viewName === "gameDetail" || viewName === "editionDetail" || viewName === "modDetail"
      ? null
      : viewName === "editions"
        ? "editions"
        : viewName === "eventDetail"
          ? "events"
          : viewName === "gearDetail"
            ? "gear"
            : viewName;
  navBtns.forEach((btn) => {
    const isGamesParent = btn.dataset.view === "games" && !btn.classList.contains("sub-nav-btn");
    const isEventsParent = btn.dataset.view === "events";
    const isGearParent = btn.dataset.view === "gear";
    const active =
      (Boolean(navKey) && btn.dataset.view === navKey) ||
      (isEventsParent && (viewName === "events" || viewName === "eventDetail")) ||
      (isGearParent && (viewName === "gear" || viewName === "gearDetail")) ||
      (isGamesParent &&
        (viewName === "games" ||
          viewName === "mods" ||
          viewName === "gameDetail" ||
          viewName === "modDetail" ||
          viewName === "editionDetail" ||
          viewName === "editions"));
    btn.classList.toggle("active", active);
  });
  Object.keys(views).forEach((k) => {
    views[k]?.classList.toggle("active", k === viewName);
  });
  updateGamesFamilyNav();
}

/** Stable key identifying "the same page" for back-button history and scroll memory. */
function routeKeyFor(viewName, params = {}) {
  if (viewName === "gameDetail") return `gameDetail:${params.slug}`;
  if (viewName === "modDetail") return `modDetail:${params.slug}`;
  if (viewName === "gearDetail") return `gearDetail:${params.slug}`;
  if (viewName === "editionDetail") return `editionDetail:${params.gameSlug}:${params.editionSlug}`;
  if (viewName === "eventDetail") return `eventDetail:${params.eventId}`;
  if (viewName === "editions") return `editions:${params.gameSlug || editionsContextSlug() || ""}`;
  return viewName;
}

function updateBackButtonVisibility() {
  const btn = document.getElementById("topbar-back-btn");
  if (btn) btn.classList.toggle("hidden", state.navStack.length === 0);
}

/** Record where we're leaving from — including scroll position — before switching views. */
function pushNavHistory() {
  const content = document.getElementById("content");
  state.navStack.push({
    key: routeKeyFor(state.currentView, state.currentViewParams),
    view: state.currentView,
    params: state.currentViewParams,
    scrollTop: content ? content.scrollTop : 0,
  });
  // A back history is only useful a handful of steps deep; cap it so it can't grow forever.
  if (state.navStack.length > 50) state.navStack.shift();
  updateBackButtonVisibility();
}

/** Pop the back-button history and return, restoring scroll position once the view repaints. */
export async function goBack() {
  const entry = state.navStack.pop();
  updateBackButtonVisibility();
  if (!entry) return;
  await navigateTo(entry.view, { ...entry.params, __back: true });
  requestAnimationFrame(() => {
    const content = document.getElementById("content");
    if (content) content.scrollTop = entry.scrollTop || 0;
  });
}

export async function navigateTo(viewName, params = {}) {
  if (viewName === "editions" && !editionsContextSlug() && !params.gameSlug) {
    return navigateTo("games");
  }

  closeNotificationsPanel();

  const force = Boolean(params.force);
  const isBack = Boolean(params.__back);
  const cameFromView = state.currentView;
  const cameFromParams = state.currentViewParams;
  if (!isBack && cameFromView && routeKeyFor(cameFromView, cameFromParams) !== routeKeyFor(viewName, params)) {
    pushNavHistory();
  }

  state.currentView = viewName;
  state.currentViewParams = params;
  applyNavChrome(viewName);
  updateBackButtonVisibility();

  if (viewName === "home") {
    if (!force && isViewReady(views.home)) return;
    return renderHomeView();
  }

  await ensureViewModule(viewName);

  if (!force && KEEP_ALIVE.has(viewName) && isViewReady(views[viewName])) {
    if (viewName === "friends") void api.refreshFriendsData?.();
    return;
  }

  if (viewName === "games") return api.renderGamesView?.();
  if (viewName === "search") {
    if (params.q !== undefined) {
      state.searchQuery = params.q;
      state.searchFilters.q = params.q;
    }
    return api.renderSearchView?.();
  }
  if (viewName === "editions") return api.renderEditionsView?.(params.gameSlug);
  if (viewName === "mods") return api.renderModsView?.();
  if (viewName === "servers") return api.renderServersView?.();
  if (viewName === "events") return api.renderEventsView?.();
  if (viewName === "eventDetail") {
    if (!force && isViewReady(views.eventDetail, params.eventId)) return;
    return api.renderEventDetailView?.(params.eventId);
  }
  if (viewName === "library") return api.renderLibraryView?.();
  if (viewName === "couch") return api.renderCouchView?.();
  if (viewName === "friends") return api.renderFriendsView?.();
  if (viewName === "gear") return api.renderGearView?.();
  if (viewName === "gearDetail") {
    if (!force && isViewReady(views.gearDetail, params.slug)) return;
    return api.renderGearDetailView?.(params.slug);
  }
  if (viewName === "settings") return api.renderSettingsView?.();
  if (viewName === "gameDetail") {
    if (!force && isViewReady(views.gameDetail, params.slug)) return;
    return api.renderGameDetailView?.(params.slug);
  }
  if (viewName === "modDetail") {
    if (!force && isViewReady(views.modDetail, params.slug)) return;
    return api.renderModDetailView?.(params.slug);
  }
  if (viewName === "editionDetail") {
    const token = `${params.gameSlug}:${params.editionSlug}`;
    if (!force && isViewReady(views.editionDetail, token)) return;
    return api.renderEditionDetailView?.(params.gameSlug, params.editionSlug);
  }
  if (viewName === "deepLink") return api.renderDeepLinkView?.(params.ctx ?? state.deepLinkCtx);
}

export async function openGameDetail(slug, fromView) {
  state.detailReturnView = fromView || "games";
  state.currentDetailSlug = slug;
  return navigateTo("gameDetail", { slug });
}

export async function openModDetail(slug, fromView) {
  state.detailReturnView = fromView || "mods";
  state.currentModDetailSlug = slug;
  return navigateTo("modDetail", { slug });
}

export async function openGearDetail(slug, fromView) {
  state.detailReturnView = fromView || "gear";
  return navigateTo("gearDetail", { slug });
}

export async function openEditionDetail(gameSlug, editionSlug) {
  state.currentEditionDetail = { gameSlug, editionSlug };
  return navigateTo("editionDetail", { gameSlug, editionSlug });
}

export async function openEventDetail(eventId, fromView) {
  state.detailReturnView = fromView || "events";
  state.currentEventDetailId = eventId;
  return navigateTo("eventDetail", { eventId });
}

api.navigateTo = navigateTo;
api.goBack = goBack;
api.finishPartyInstallReturn = finishPartyInstallReturn;
api.openGameDetail = openGameDetail;
api.openModDetail = openModDetail;
/*
 * Was missing, so clicking a gear card did nothing at all: gear.js calls
 * api.openGearDetail?.(), and the optional chaining swallowed the absence
 * silently rather than throwing. The view, the route and the function all
 * existed — only this line was absent.
 */
api.openGearDetail = openGearDetail;
api.openEditionDetail = openEditionDetail;
api.openEventDetail = openEventDetail;
api.renderHomeView = renderHomeView;
api.prefetchView = (name) => void ensureViewModule(name);
api.prefetchGameDetail = prefetchGameDetail;

function wireShell() {
  bindViews();
  wireEnhanceSelect();

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!btn.dataset.view) return;
      if (btn.dataset.view === "editions") {
        const slug = editionsContextSlug();
        if (!slug) {
          void navigateTo("games");
          return;
        }
        void navigateTo("editions", { gameSlug: slug });
        return;
      }
      void navigateTo(btn.dataset.view);
    });
  });

  updateGamesFamilyNav();

  document.getElementById("topbar-back-btn")?.addEventListener("click", () => {
    void goBack();
  });
  updateBackButtonVisibility();

  document.getElementById("sidebar-discord")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.playbound.openExternal(DISCORD_INVITE, { campaign: "discord" });
  });

  document.querySelectorAll('input[name="compat-filter"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) void setCompatibilityFilter(input.value);
    });
  });

  document.querySelectorAll('input[name="discovery-filter"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) void setDiscoveryMode(input.value);
    });
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-discovery-mode]");
    if (!btn) return;
    void setDiscoveryMode(btn.dataset.discoveryMode);
  });

  const statusMsg = document.getElementById("statusbar-msg");
  statusMsg?.addEventListener("click", () => {
    if (state.statusAction) {
      void runStatusAction();
    } else if (state.installQueue?.totalCount > 0) {
      toggleQueuePopover();
    }
  });
  statusMsg?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (state.statusAction) void runStatusAction();
      else if (state.installQueue?.totalCount > 0) toggleQueuePopover();
    }
  });

  document.getElementById("statusbar-queue-toggle")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleQueuePopover();
  });

  document.getElementById("queue-popover-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("statusbar-queue-popover")?.classList.add("hidden");
  });

  document.getElementById("queue-popover-content")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-queue-cancel-slug]");
    if (!btn || !window.playbound?.cancelInstallQueueItem) return;
    e.stopPropagation();
    const slug = btn.dataset.queueCancelSlug;
    const editionSlug = btn.dataset.queueCancelEdition || null;
    btn.disabled = true;
    void window.playbound.cancelInstallQueueItem(slug, editionSlug).then((res) => {
      if (res?.error) setStatus(res.error, true);
    });
  });

  // Close queue popover when clicking outside
  document.addEventListener("click", (e) => {
    const popover = document.getElementById("statusbar-queue-popover");
    if (!popover || popover.classList.contains("hidden")) return;
    if (e.target.closest("#statusbar-queue-popover") || e.target.closest("#statusbar-queue-toggle")) return;
    popover.classList.add("hidden");
  });

  const searchForm = document.getElementById("global-search-form");
  const searchInput = document.getElementById("global-search-input");
  const searchClear = document.getElementById("global-search-clear");

  const syncSearchClear = () => {
    if (!searchClear || !searchInput) return;
    searchClear.classList.toggle("hidden", !searchInput.value.trim());
  };

  if (searchForm && searchInput) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = searchInput.value.trim();
      state.searchQuery = val;
      state.searchFilters.q = val;
      syncSearchClear();
      void navigateTo("search", { q: val, force: true });
    });

    searchInput.addEventListener("input", () => {
      syncSearchClear();
      const val = searchInput.value;
      state.searchQuery = val;
      state.searchFilters.q = val;
      if (state.currentView === "search") {
        api.paintSearchResults?.(state.catalogCache);
      }
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = searchInput.value.trim();
        state.searchQuery = val;
        state.searchFilters.q = val;
        syncSearchClear();
        void navigateTo("search", { q: val, force: true });
      }
    });
  }

  searchClear?.addEventListener("click", () => {
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }
    state.searchQuery = "";
    state.searchFilters.q = "";
    syncSearchClear();
    if (state.currentView === "search") {
      api.paintSearchResults?.(state.catalogCache);
    }
  });
}

function wireMainEvents() {
  window.addEventListener("beforeunload", () => endGameSession());
  window.playbound.onGameExited?.((data) => {
    const slug = data?.slug;
    if (!slug || !state._activeGameSession || state._activeGameSession.slug !== slug) return;
    endGameSession();
  });

  window.playbound.onAccount((data) => {
    if (data?.message) setStatus(data.message, data.connected === false);
    void refreshAccountStatus().then(() => onNotificationsAccountChanged());
    if (data?.connected) void loadCompatibilitySetting();
    markViewDirty(views.settings);
    if (state.currentView === "settings") api.renderSettingsView?.();
    /*
     * Remount Friends only on real auth flips / errors — not every library sync
     * status tick (that remount used to call syncLibraryNow again → loop).
     */
    const authFlipped =
      typeof data?.connected === "boolean" && data.connected !== state.accountState?.connected;
    const authError = data?.connected === false || Boolean(data?.error);
    if (authFlipped || authError) {
      markViewDirty(views.friends);
      if (state.currentView === "friends") api.renderFriendsView?.();
    }
    if (state.currentView === "library" && /library|located|Locate/i.test(data?.message || "")) {
      markViewDirty(views.library);
      api.renderLibraryView?.();
    }
  });

  window.playbound.onNavigate?.((data) => {
    if (!data?.view) return;
    if (data.view === "gameDetail" && data.slug) {
      void openGameDetail(data.slug, data.fromView || "friends");
      return;
    }
    void navigateTo(data.view, data);
  });

  window.playbound.onUpdateStatus?.((data) => {
    state.updateStatus = data || { phase: "idle" };
    const phase = data?.phase;
    const patchSettingsControls = (hintText, isReady) => {
      const hintEl = document.getElementById("set-update-hint");
      if (hintEl && hintText) hintEl.textContent = hintText;
      const installBtn = document.getElementById("set-btn-install-update");
      if (installBtn) installBtn.disabled = !isReady;
      const checkBtn = document.getElementById("set-btn-check-update");
      if (checkBtn) checkBtn.disabled = false;
    };

    if (phase === "checking") {
      setStatus("Checking for updates…");
      setProgress(null);
    } else if (phase === "available") {
      const el = document.getElementById("statusbar-msg");
      if (el) {
        el.textContent = `Update ${data.version} available — click to download`;
        el.style.color = "var(--accent-light)";
      }
      setStatusAction("check-updates");
      setProgress(null);
      patchSettingsControls(`Update ${data.version} available.`, false);
    } else if (phase === "downloading") {
      const pct = Math.max(0, Math.min(100, Number(data.percent) || 0));
      setStatus(`Downloading update… ${pct}%`);
      setProgress(pct);
      patchSettingsControls(`Downloading… ${pct}%`, false);
    } else if (phase === "ready") {
      const el = document.getElementById("statusbar-msg");
      if (el) {
        el.textContent = `Update ${data.version} ready — click to install and restart`;
        el.style.color = "var(--accent-light)";
      }
      setStatusAction("install-update");
      setProgress(null);
      patchSettingsControls(`Version ${data.version} downloaded.`, true);
    } else if (phase === "none") {
      setStatus(data.version ? `You're up to date (v${data.version}).` : "You're up to date.");
      setProgress(null);
      patchSettingsControls("You're on the latest build (or check to confirm).", false);
    } else if (phase === "error") {
      setStatus(data.message || "Update error", true);
      setProgress(null);
      patchSettingsControls(data.message || "Update error", false);
    }
  });

  window.playbound.onInstallQueueUpdated?.((data) => {
    setInstallQueueState(data);
  });

  window.playbound.getInstallQueue?.().then((data) => {
    if (data) setInstallQueueState(data);
  }).catch(() => {});

  window.playbound.onProgress(({ phase, received, total, addon, message, title, slug, queue, queueCount }) => {
    if (queue) setInstallQueueState(queue);

    const titlePrefix = title ? `${title}: ` : "";
    const queuedText = queueCount && queueCount > 1 ? ` · (+${queueCount - 1} queued)` : "";

    if (phase === "resolving") setStatus(`${titlePrefix}Resolving download package…${queuedText}`);
    else if (phase === "queued") {
      // No bar: this install has not started and has no progress of its own.
      setStatus(message || `${titlePrefix}Queued — waiting for current install to finish…`);
      setProgress(null);
    } else if (phase === "java") setStatus(message || "Installing Java…");
    else if (phase === "dosbox") setStatus(message || "Installing DOSBox…");
    else if (phase === "downloading") {
      const pct = total ? Math.round((received / total) * 100) : null;
      const prefix = addon ? `Downloading ${addon}...` : "Downloading...";
      setStatus(`${titlePrefix}${prefix} ${fmtBytes(received)}${total ? ` of ${fmtBytes(total)} (${pct}%)` : ""}${queuedText}`);
      setProgress(pct);
    } else if (phase === "extracting") {
      setStatus(`${titlePrefix}Extracting game files… this can take a few minutes${queuedText}`);
      setProgress("indeterminate");
    } else if (phase === "installer-ready") {
      setStatus(addon || `${titlePrefix}Waiting for the installer to finish…`);
      setProgress(null);
    } else if (phase === "installing-base") {
      setStatus(`${titlePrefix}Installing required base game…`);
      setProgress(null);
    } else if (phase === "done") {
      setStatus(`${titlePrefix}Complete!`);
      setProgress(null);
    }
  });

  window.playbound.onInstallDetected(async (data) => {
    setProgress(null);
    if (data?.uninstalled) {
      setStatus("Removed from this PC.");
    } else if (data?.slug) {
      setStatus("Install detected — added to library.");
    } else if (data?.scanned != null) {
      setStatus(`Library scan found ${data.scanned} install(s).`);
    } else {
      setStatus("Installs updated.");
    }

    const returnToParty =
      !data?.uninstalled && data?.slug && (await finishPartyInstallReturn(data.slug));

    if (data?.slug) {
      cacheInvalidate(`game:${data.slug}`);
      cacheInvalidate(`editions:${data.slug}`);
    } else {
      cacheInvalidate("game");
      cacheInvalidate("editions");
    }
    cacheInvalidate("installed");
    cacheInvalidate("installedMods");
    markViewDirty(views.library, views.gameDetail, views.editionDetail);
    if (returnToParty) {
      /* navigateTo("friends") above already refreshed the party panel. */
    } else if (state.currentView === "library") api.renderLibraryView?.();
    else if (state.currentView === "home") api.paintHomeGrids?.(state.catalogCache, state.recentCache);
    else if (state.currentView === "gameDetail" && data?.slug && state.currentDetailSlug === data.slug) {
      api.renderGameDetailView?.(data.slug, { force: true });
    } else if (
      // Installing an edition now leaves you on the edition page, so that page
      // has to pick the finished install up itself and swap Install for Play.
      state.currentView === "editionDetail" &&
      data?.slug &&
      state.currentEditionDetail?.gameSlug === data.slug
    ) {
      api.renderEditionDetailView?.(
        state.currentEditionDetail.gameSlug,
        state.currentEditionDetail.editionSlug,
        { force: true }
      );
    }
    /* Party config-sync needs a fresh poll after install so “wrong version” clears. */
    if (returnToParty || state.currentView === "friends" || state._activeParty) {
      const areaSlot = document.getElementById("friends-party-area");
      if (areaSlot) areaSlot.dataset.sig = "";
      void api.refreshFriendsData?.();
    }
  });

  window.playbound.onInstallScan?.((data) => {
    const phase = data?.phase;
    if (phase === "queued") {
      if (data.message) setStatus(data.message);
      return;
    }
    if (phase === "scanning" || phase === "waiting") {
      if (data.message) setStatus(data.message);
      else if (data.slug) setStatus(`Searching for ${data.slug}…`);
      return;
    }
    if (phase === "pending") {
      if (data.message) setStatus(data.message);
      else if (data.slug) setStatus(`Waiting for ${data.slug} install…`);
    } else if (phase === "needs-locate") {
      setStatus(
        data.message ||
          (data.slug
            ? `Couldn't find ${data.slug} automatically — ${selectExecutableLabel().toLowerCase()} in Library.`
            : `Couldn't find the install — ${selectExecutableLabel().toLowerCase()} in Library.`),
        true
      );
    } else if (phase === "dismissed") {
      setStatus("Removed from Library.");
    }
    if (data?.slug) {
      cacheInvalidate(`game:${data.slug}`);
      cacheInvalidate(`editions:${data.slug}`);
    }
    cacheInvalidate("installed");
    cacheInvalidate("installedMods");
    markViewDirty(views.library, views.gameDetail);
    if (state.currentView === "library") api.renderLibraryView?.();
    else if (state.currentView === "home") api.paintHomeGrids?.(state.catalogCache, state.recentCache);
    else if (state.currentView === "gameDetail" && data?.slug && state.currentDetailSlug === data.slug) {
      api.renderGameDetailView?.(data.slug, { force: true });
    }
  });

  window.playbound.onInstallDetectFailed?.((data) => {
    const name = data?.slug || "the game";
    setStatus(
      `Couldn't auto-detect ${name}. Open Library and click ${selectExecutableLabel()} to locate it.`,
      true
    );
    if (data?.slug) {
      cacheInvalidate(`game:${data.slug}`);
      cacheInvalidate(`editions:${data.slug}`);
    }
    cacheInvalidate("installed");
    cacheInvalidate("installedMods");
    markViewDirty(views.library, views.gameDetail);
    if (state.currentView === "library") api.renderLibraryView?.();
    else if (state.currentView === "gameDetail" && data?.slug && state.currentDetailSlug === data.slug) {
      api.renderGameDetailView?.(data.slug, { force: true });
    }
  });

  window.playbound.onContext((data) => {
    if (data) {
      const same =
        state.currentView === "deepLink" && isSameDeepLinkContext(state.deepLinkCtx, data);
      state.deepLinkCtx = data;
      // Remounting this panel auto-starts install/mod-install. A second
      // identical context event must not start a second download.
      if (same) return;
      void navigateTo("deepLink", { ctx: data });
    } else if (state.currentView === "deepLink") {
      void navigateTo("home");
    }
  });

  window.playbound.onCatalogUpdated?.((list) => {
    setCatalogCache(list);
    if (state.currentView === "home") api.paintHomeGrids?.(state.catalogCache, state.recentCache);
    else if (state.currentView === "games") api.paintGamesGrid?.(state.catalogCache);
    else if (state.currentView === "search") api.paintSearchResults?.(state.catalogCache);
  });
}

/**
 * Tell the main process which controllers are connected.
 *
 * The Gamepad API lives only in this context, and it deliberately reports
 * nothing until a pad has been interacted with — so this reports at startup,
 * on connect/disconnect, and once more after a short delay to catch a pad that
 * was already plugged in before the window existed.
 *
 * Main uses this to write bindings into games that keep them in a config file,
 * so the player does not rebind the same pad in every game.
 */
function wireGamepadReporting() {
  const report = () => {
    try {
      const pads = Array.from(navigator.getGamepads?.() || [])
        .filter(Boolean)
        .map((p) => ({ id: p.id, mapping: p.mapping, connected: p.connected }));
      void window.playbound.reportGamepads?.(pads);
    } catch {
      /* Never block the UI over a controller. */
    }
  };
  window.addEventListener("gamepadconnected", report);
  window.addEventListener("gamepaddisconnected", report);
  report();
  // A pad connected before this window opened stays silent until it is used.
  window.setTimeout(report, 3000);
}

async function boot() {
  document.querySelectorAll('link[href*="fonts.googleapis.com"]').forEach((el) => {
    el.media = "all";
  });
  wireShell();
  wireMainEvents();
  wireGamepadReporting();
  wireNotifications();

  let bootState = null;
  try {
    bootState = await window.playbound.getBootstrapState?.();
  } catch {
    bootState = null;
  }

  if (bootState) {
    setCatalogCache(bootState.catalog);
    state.recentCache = Array.isArray(bootState.recent) ? bootState.recent : [];
    applyCompatibilitySetting(bootState.settings);
    applyDiscoverySetting(bootState.settings);
    applyAccountToSidebar(bootState.account);
    if (bootState.context) {
      state.deepLinkCtx = bootState.context;
      await navigateTo("deepLink", { ctx: bootState.context });
    } else {
      await navigateTo("home");
    }
  } else {
    await navigateTo("home");
  }

  void refreshAccountStatus();

  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
  idle(() => {
    void import("./views/games.js");
    void import("./views/library.js");
    void import("./views/mods.js");
    void import("./views/detail.js");
    void import("./views/servers.js");
    void window.playbound.getModsCatalog?.()
      .then((res) => {
        if (res) cachePut("mods", res);
      })
      .catch(() => {});
  });
}

void boot();
