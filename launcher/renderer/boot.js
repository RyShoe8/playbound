import { renderHomeView } from "./home.js";
import {
  api,
  applyAccountToSidebar,
  applyCompatibilitySetting,
  bindViews,
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
  setProgress,
  setStatus,
  setStatusAction,
  state,
  updateGamesFamilyNav,
  views,
  wireEnhanceSelect,
} from "./shared.js";

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
]);

const viewLoaders = {
  games: () => import("./views/games.js"),
  library: () => import("./views/library.js"),
  friends: () => import("./views/friends.js"),
  gear: () => import("./views/gear.js"),
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
          : viewName;
  navBtns.forEach((btn) => {
    const isGamesParent = btn.dataset.view === "games" && !btn.classList.contains("sub-nav-btn");
    const isEventsParent = btn.dataset.view === "events";
    const active =
      (Boolean(navKey) && btn.dataset.view === navKey) ||
      (isEventsParent && (viewName === "events" || viewName === "eventDetail")) ||
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

export async function navigateTo(viewName, params = {}) {
  if (viewName === "editions" && !editionsContextSlug() && !params.gameSlug) {
    return navigateTo("games");
  }

  const force = Boolean(params.force);
  state.currentView = viewName;
  applyNavChrome(viewName);

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
  if (viewName === "editions") return api.renderEditionsView?.(params.gameSlug);
  if (viewName === "mods") return api.renderModsView?.();
  if (viewName === "servers") return api.renderServersView?.();
  if (viewName === "events") return api.renderEventsView?.();
  if (viewName === "eventDetail") {
    if (!force && isViewReady(views.eventDetail, params.eventId)) return;
    return api.renderEventDetailView?.(params.eventId);
  }
  if (viewName === "library") return api.renderLibraryView?.();
  if (viewName === "friends") return api.renderFriendsView?.();
  if (viewName === "gear") return api.renderGearView?.();
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
api.openGameDetail = openGameDetail;
api.openModDetail = openModDetail;
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

  document.getElementById("sidebar-discord")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.playbound.openExternal(DISCORD_INVITE, { campaign: "discord" });
  });

  document.querySelectorAll('input[name="compat-filter"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) void setCompatibilityFilter(input.value);
    });
  });

  const statusMsg = document.getElementById("statusbar-msg");
  statusMsg?.addEventListener("click", () => {
    void runStatusAction();
  });
  statusMsg?.addEventListener("keydown", (e) => {
    if (!state.statusAction) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void runStatusAction();
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
    void refreshAccountStatus();
    if (data?.connected) void loadCompatibilitySetting();
    markViewDirty(views.friends, views.settings);
    if (state.currentView === "settings") api.renderSettingsView?.();
    if (state.currentView === "friends") api.renderFriendsView?.();
    if (state.currentView === "library" && /library|located|Locate/i.test(data?.message || "")) {
      markViewDirty(views.library);
      api.renderLibraryView?.();
    }
  });

  window.playbound.onNavigate?.((data) => {
    if (data?.view) void navigateTo(data.view);
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

  window.playbound.onProgress(({ phase, received, total, addon, message }) => {
    if (phase === "resolving") setStatus("Resolving download package...");
    else if (phase === "java") setStatus(message || "Installing Java…");
    else if (phase === "downloading") {
      const pct = total ? Math.round((received / total) * 100) : null;
      const prefix = addon ? `Downloading ${addon}...` : "Downloading...";
      setStatus(`${prefix} ${fmtBytes(received)}${total ? ` of ${fmtBytes(total)} (${pct}%)` : ""}`);
      setProgress(pct);
    } else if (phase === "extracting") {
      setStatus("Extracting game files...");
      setProgress(100);
    } else if (phase === "installer-ready") {
      setStatus("Installer opened — finish the setup wizard…");
      setProgress(null);
    } else if (phase === "installing-base") {
      setStatus("Installing required base game…");
      setProgress(null);
    } else if (phase === "done") {
      setStatus("Complete!");
      setProgress(null);
    }
  });

  window.playbound.onInstallDetected((data) => {
    setProgress(null);
    if (data?.slug) {
      setStatus("Install detected — added to library.");
    } else if (data?.scanned != null) {
      setStatus(`Library scan found ${data.scanned} install(s).`);
    } else {
      setStatus("Installs updated.");
    }
    markViewDirty(views.library, views.gameDetail, views.editionDetail);
    if (state.currentView === "library") api.renderLibraryView?.();
    else if (state.currentView === "home") api.paintHomeGrids?.(state.catalogCache, state.recentCache);
    else if (state.currentView === "gameDetail" && data?.slug && state.currentDetailSlug === data.slug) {
      api.renderGameDetailView?.(data.slug);
    } else if (
      // Installing an edition now leaves you on the edition page, so that page
      // has to pick the finished install up itself and swap Install for Play.
      state.currentView === "editionDetail" &&
      data?.slug &&
      state.currentEditionDetail?.gameSlug === data.slug
    ) {
      api.renderEditionDetailView?.(
        state.currentEditionDetail.gameSlug,
        state.currentEditionDetail.editionSlug
      );
    }
  });

  window.playbound.onInstallScan?.((data) => {
    const phase = data?.phase;
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
        data.slug
          ? `Couldn't find ${data.slug} automatically — ${selectExecutableLabel().toLowerCase()} in Library.`
          : `Couldn't find the install — ${selectExecutableLabel().toLowerCase()} in Library.`,
        true
      );
    } else if (phase === "dismissed") {
      setStatus("Removed from Library.");
    }
    markViewDirty(views.library, views.gameDetail);
    if (state.currentView === "library") api.renderLibraryView?.();
    else if (state.currentView === "home") api.paintHomeGrids?.(state.catalogCache, state.recentCache);
    else if (state.currentView === "gameDetail" && data?.slug && state.currentDetailSlug === data.slug) {
      api.renderGameDetailView?.(data.slug);
    }
  });

  window.playbound.onInstallDetectFailed?.((data) => {
    const name = data?.slug || "the game";
    setStatus(
      `Couldn't auto-detect ${name}. Open Library and click ${selectExecutableLabel()} to locate it.`,
      true
    );
    markViewDirty(views.library, views.gameDetail);
    if (state.currentView === "library") api.renderLibraryView?.();
    else if (state.currentView === "gameDetail" && data?.slug && state.currentDetailSlug === data.slug) {
      api.renderGameDetailView?.(data.slug);
    }
  });

  window.playbound.onContext((data) => {
    if (data) {
      state.deepLinkCtx = data;
      void navigateTo("deepLink", { ctx: data });
    } else if (state.currentView === "deepLink") {
      void navigateTo("home");
    }
  });

  window.playbound.onCatalogUpdated?.((list) => {
    setCatalogCache(list);
    if (state.currentView === "home") api.paintHomeGrids?.(state.catalogCache, state.recentCache);
    else if (state.currentView === "games") api.paintGamesGrid?.(state.catalogCache);
  });
}

async function boot() {
  document.querySelectorAll('link[href*="fonts.googleapis.com"]').forEach((el) => {
    el.media = "all";
  });
  wireShell();
  wireMainEvents();

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
