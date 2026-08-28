/**
 * Launcher notification bell & live toast popups — same Mongo notifications as the site, with
 * readAt synced through /api/notifications/read so web + launcher stay aligned.
 */
import { api, setStatus, state } from "./shared.js";

const POLL_MS = 6_000;
const TOAST_DURATION_MS = 15_000;

let pollTimer = null;
let items = [];
let unreadCount = 0;
let panelOpen = false;
let wired = false;
const seenNotificationIds = new Set();
let initialLoadDone = false;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function els() {
  return {
    btn: document.getElementById("notif-bell-btn"),
    badge: document.getElementById("notif-bell-badge"),
    panel: document.getElementById("notif-panel"),
    list: document.getElementById("notif-panel-list"),
    markAll: document.getElementById("notif-mark-all"),
    wrap: document.getElementById("notif-bell-wrap"),
    toastContainer: document.getElementById("pb-toast-container"),
  };
}

function setBadge(count) {
  unreadCount = Number(count) || 0;
  const { badge } = els();
  if (!badge) return;
  if (unreadCount <= 0) {
    badge.hidden = true;
    badge.textContent = "";
    return;
  }
  badge.hidden = false;
  badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
}

function setPanelOpen(open) {
  panelOpen = open;
  const { panel, btn } = els();
  if (panel) panel.hidden = !open;
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) void refresh();
}

export function closeNotificationsPanel() {
  if (!panelOpen) return;
  setPanelOpen(false);
}

function dismissToast(el) {
  if (!el || el.dataset.dismissed) return;
  el.dataset.dismissed = "1";
  el.classList.add("closing");
  setTimeout(() => el.remove(), 200);
}

/**
 * Show a floating in-app toast notification card when a new notification arrives.
 */
function showNotificationToast(n) {
  const container = els().toastContainer || document.getElementById("pb-toast-container");
  if (!container) return;

  const partyId = n.meta?.partyId || "";
  const inviteId = n.meta?.inviteId || "";
  const icon =
    n.type === "party_invite" || n.type === "party_joined"
      ? "👥"
      : n.type === "play_invite"
      ? "🎮"
      : n.type?.startsWith("friend")
      ? "👤"
      : "🔔";

  let actionsHtml = "";
  if (n.type === "party_invite" && partyId) {
    actionsHtml = `
      <button type="button" class="pb-toast-btn primary" data-action="toast-join-party" data-party="${escapeHtml(
        partyId
      )}" data-id="${escapeHtml(n.id)}">Join Party</button>
      <button type="button" class="pb-toast-btn" data-action="toast-decline" data-id="${escapeHtml(
        n.id
      )}">Decline</button>
    `;
  } else if (n.type === "play_invite" && inviteId) {
    actionsHtml = `
      <button type="button" class="pb-toast-btn primary" data-action="toast-accept-invite" data-invite="${escapeHtml(
        inviteId
      )}" data-id="${escapeHtml(n.id)}" data-href="${escapeHtml(n.href || "")}" data-slug="${escapeHtml(
      n.meta?.gameSlug || ""
    )}">Play</button>
      <button type="button" class="pb-toast-btn" data-action="toast-decline-invite" data-invite="${escapeHtml(
        inviteId
      )}" data-id="${escapeHtml(n.id)}">Decline</button>
    `;
  } else {
    actionsHtml = `
      <button type="button" class="pb-toast-btn primary" data-action="toast-open" data-id="${escapeHtml(
        n.id
      )}" data-href="${escapeHtml(n.href || "")}" data-slug="${escapeHtml(n.meta?.gameSlug || "")}">View</button>
    `;
  }

  const toast = document.createElement("div");
  toast.className = "pb-toast";
  toast.dataset.id = n.id;
  toast.innerHTML = `
    <div class="pb-toast-head">
      <div class="pb-toast-title-wrap">
        <span class="pb-toast-icon">${icon}</span>
        <span class="pb-toast-title">${escapeHtml(n.title)}</span>
      </div>
      <button type="button" class="pb-toast-close" aria-label="Dismiss">✕</button>
    </div>
    ${n.body ? `<p class="pb-toast-body">${escapeHtml(n.body)}</p>` : ""}
    <div class="pb-toast-actions">
      ${actionsHtml}
    </div>
  `;

  // Close button
  toast.querySelector(".pb-toast-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    dismissToast(toast);
  });

  // Action buttons
  toast.querySelector('[data-action="toast-join-party"]')?.addEventListener("click", async (e) => {
    e.stopPropagation();
    dismissToast(toast);
    if (partyId && window.playbound?.joinParty) {
      const res = await window.playbound.joinParty(partyId);
      if (res?.error) {
        setStatus(res.error, true);
      } else {
        setStatus("Joined party!");
      }
    }
    void markRead(n.id);
    await api.navigateTo?.("friends");
    if (api.refreshFriendsData) void api.refreshFriendsData();
  });

  toast.querySelector('[data-action="toast-decline"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    dismissToast(toast);
    void markRead(n.id);
  });

  toast.querySelector('[data-action="toast-accept-invite"]')?.addEventListener("click", async (e) => {
    e.stopPropagation();
    dismissToast(toast);
    await window.playbound.playInviteAction?.(inviteId, "accept");
    void markRead(n.id);
    await openHref(n.href || (n.meta?.gameSlug ? `/games/${n.meta.gameSlug}` : "/friends"), n.meta);
  });

  toast.querySelector('[data-action="toast-decline-invite"]')?.addEventListener("click", async (e) => {
    e.stopPropagation();
    dismissToast(toast);
    await window.playbound.playInviteAction?.(inviteId, "decline");
    void markRead(n.id);
    void refresh();
  });

  toast.querySelector('[data-action="toast-open"]')?.addEventListener("click", async (e) => {
    e.stopPropagation();
    dismissToast(toast);
    void markRead(n.id);
    await openHref(n.href || (n.meta?.gameSlug ? `/games/${n.meta.gameSlug}` : "/friends"), n.meta);
  });

  container.appendChild(toast);

  // Auto-dismiss after 15 seconds
  setTimeout(() => dismissToast(toast), TOAST_DURATION_MS);
}

async function refresh() {
  if (!window.playbound?.getNotifications) return;
  if (!state.accountState?.connected) {
    items = [];
    setBadge(0);
    paintList();
    return;
  }
  try {
    const data = await window.playbound.getNotifications();
    const prevItems = items;
    items = Array.isArray(data?.items) ? data.items : [];
    setBadge(data?.unreadCount ?? items.filter((n) => !n.readAt).length);
    paintList();

    // Check for newly arriving unread notifications to toast
    if (!initialLoadDone) {
      initialLoadDone = true;
      for (const item of items) {
        seenNotificationIds.add(item.id);
      }
    } else {
      for (const item of items) {
        if (!item.readAt && !seenNotificationIds.has(item.id)) {
          seenNotificationIds.add(item.id);
          showNotificationToast(item);
          void window.playbound.showDesktopNotification?.({
            title: item.title,
            body: item.body || "",
          });
        }
      }
    }
  } catch {
    /* ignore */
  }
}

async function markRead(id, all = false) {
  if (!window.playbound?.markNotificationsRead) return;
  const res = await window.playbound.markNotificationsRead(all ? { all: true } : { id });
  if (!res?.ok) return;
  if (typeof res.unreadCount === "number") setBadge(res.unreadCount);
  const now = new Date().toISOString();
  if (all) {
    items = items.map((n) => ({ ...n, readAt: n.readAt || now }));
  } else if (id) {
    items = items.map((n) => (n.id === id ? { ...n, readAt: n.readAt || now } : n));
  }
  paintList();
}

/**
 * Map a site notification href onto launcher navigation when we can.
 * Falls back to opening the site in the browser.
 */
async function openHref(href, meta = {}) {
  const path = String(href || "/friends").split("?")[0];
  const editionMatch = path.match(/^\/games\/([^/]+)\/editions\/([^/]+)/);
  if (editionMatch) {
    await api.openEditionDetail?.(decodeURIComponent(editionMatch[1]), decodeURIComponent(editionMatch[2]));
    return;
  }
  const gameMatch = path.match(/^\/games\/([^/]+)/);
  if (gameMatch) {
    await api.openGameDetail?.(decodeURIComponent(gameMatch[1]), "home");
    return;
  }
  const eventMatch = path.match(/^\/events\/([^/]+)/);
  if (eventMatch) {
    await api.openEventDetail?.(decodeURIComponent(eventMatch[1]), "events");
    return;
  }
  const partyMatch = href?.match(/[?&]party=([^&]+)/) || href?.match(/\/party\/([^/?]+)/);
  const partyId = meta?.partyId || (partyMatch ? decodeURIComponent(partyMatch[1]) : null);
  if (path.startsWith("/friends") || path.startsWith("/party") || partyId) {
    await api.navigateTo?.("friends");
    if (api.refreshFriendsData) void api.refreshFriendsData();
    return;
  }
  if (path.startsWith("/events")) {
    await api.navigateTo?.("events");
    return;
  }
  const base = (await window.playbound.getAccount?.())?.apiBase || "https://playbound.club";
  const url = path.startsWith("http") ? path : `${String(base).replace(/\/$/, "")}${path}`;
  void window.playbound.openExternal?.(url);
}

function paintList() {
  const { list, markAll } = els();
  if (!list) return;
  if (markAll) markAll.hidden = unreadCount <= 0;

  if (!state.accountState?.connected) {
    list.innerHTML = `<li class="notif-empty">Sign in to see notifications.</li>`;
    return;
  }
  if (!items.length) {
    list.innerHTML = `<li class="notif-empty">No notifications yet.</li>`;
    return;
  }

  list.innerHTML = items
    .map((n) => {
      const unread = !n.readAt;
      const inviteId = n.meta?.inviteId || "";
      const partyId = n.meta?.partyId || "";
      const actions = Array.isArray(n.meta?.actions) ? n.meta.actions : [];
      let actionHtml = "";
      if (n.type === "play_invite" && inviteId) {
        actionHtml = `<div class="notif-actions">
          <button type="button" class="notif-action primary" data-action="accept-invite" data-invite="${escapeHtml(
            inviteId
          )}" data-id="${escapeHtml(n.id)}" data-href="${escapeHtml(n.href || "")}" data-slug="${escapeHtml(
          n.meta?.gameSlug || ""
        )}">Play</button>
          <button type="button" class="notif-action" data-action="decline-invite" data-invite="${escapeHtml(
            inviteId
          )}" data-id="${escapeHtml(n.id)}">Decline</button>
        </div>`;
      } else if (n.type === "party_invite" && partyId) {
        actionHtml = `<div class="notif-actions">
          <button type="button" class="notif-action primary" data-action="join-party" data-party="${escapeHtml(
            partyId
          )}" data-id="${escapeHtml(n.id)}" data-href="${escapeHtml(n.href || "")}">Join Party</button>
          <button type="button" class="notif-action" data-action="decline-party" data-id="${escapeHtml(
            n.id
          )}">Decline</button>
        </div>`;
      } else if (actions.includes("join")) {
        actionHtml = `<div class="notif-actions">
          <button type="button" class="notif-action primary" data-action="${partyId ? "join-party" : "open"}" data-id="${escapeHtml(
            n.id
          )}" data-href="${escapeHtml(n.href || "")}" data-slug="${escapeHtml(
          n.meta?.gameSlug || ""
        )}" data-party="${escapeHtml(partyId)}">Join</button>
        </div>`;
      }
      return `<li class="notif-item${unread ? " unread" : ""}" data-id="${escapeHtml(n.id)}">
        <button type="button" class="notif-item-main" data-action="${n.type === "party_invite" && partyId ? "join-party" : "open"}" data-id="${escapeHtml(
          n.id
        )}" data-href="${escapeHtml(n.href || "/friends")}" data-slug="${escapeHtml(n.meta?.gameSlug || "")}" data-party="${escapeHtml(partyId)}">
          <span class="notif-title">${escapeHtml(n.title)}</span>
          ${n.body ? `<span class="notif-body">${escapeHtml(n.body)}</span>` : ""}
          <span class="notif-when">${escapeHtml(formatWhen(n.createdAt))}</span>
        </button>
        ${actionHtml}
      </li>`;
    })
    .join("");
}

async function onListClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const href = btn.dataset.href || "/friends";
  const inviteId = btn.dataset.invite;
  const slug = btn.dataset.slug;
  const item = items.find((n) => n.id === id);

  if (action === "join-party") {
    const partyId = btn.dataset.party || item?.meta?.partyId;
    if (partyId && window.playbound?.joinParty) {
      const res = await window.playbound.joinParty(partyId);
      if (res?.error) {
        setStatus(res.error, true);
      } else {
        setStatus("Joined party!");
      }
    }
    if (item && !item.readAt) await markRead(id);
    setPanelOpen(false);
    await api.navigateTo?.("friends");
    if (api.refreshFriendsData) void api.refreshFriendsData();
    return;
  }
  if (action === "decline-party") {
    if (item && !item.readAt) await markRead(id);
    await refresh();
    return;
  }
  if (action === "accept-invite" && inviteId) {
    await window.playbound.playInviteAction?.(inviteId, "accept");
    if (item && !item.readAt) await markRead(id);
    setPanelOpen(false);
    await openHref(href || (slug ? `/games/${slug}` : "/friends"), item?.meta);
    return;
  }
  if (action === "decline-invite" && inviteId) {
    await window.playbound.playInviteAction?.(inviteId, "decline");
    if (item && !item.readAt) await markRead(id);
    await refresh();
    return;
  }
  if (action === "open") {
    const partyId = btn.dataset.party || item?.meta?.partyId;
    if (item?.type === "party_invite" && partyId && window.playbound?.joinParty) {
      const res = await window.playbound.joinParty(partyId);
      if (res?.error) {
        setStatus(res.error, true);
      } else {
        setStatus("Joined party!");
      }
    }
    if (item && !item.readAt) await markRead(id);
    setPanelOpen(false);
    await openHref(href || (slug ? `/games/${slug}` : "/friends"), item?.meta);
  }
}

function syncPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!state.accountState?.connected) {
    items = [];
    setBadge(0);
    paintList();
    return;
  }
  void refresh();
  pollTimer = setInterval(() => void refresh(), POLL_MS);
}

export function wireNotifications() {
  if (wired) return;
  wired = true;
  const { btn, markAll, wrap, list } = els();
  if (!btn || !wrap) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setPanelOpen(!panelOpen);
  });
  markAll?.addEventListener("click", (e) => {
    e.stopPropagation();
    void markRead(undefined, true);
  });
  list?.addEventListener("click", (e) => void onListClick(e));

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!panelOpen) return;
      if (wrap.contains(e.target)) return;
      setPanelOpen(false);
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (!panelOpen || e.key !== "Escape") return;
    setPanelOpen(false);
  });

  document.getElementById("notif-panel-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    setPanelOpen(false);
  });

  document.getElementById("notif-open-friends")?.addEventListener("click", () => {
    setPanelOpen(false);
    void api.navigateTo?.("friends");
  });

  syncPoll();
}

export function onNotificationsAccountChanged() {
  syncPoll();
}

