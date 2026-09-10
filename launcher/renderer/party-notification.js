/**
 * Logic for the small status-area party invite popup window.
 *
 * Appears directly above the system tray / notification status area when
 * a party invite arrives while the launcher is minimized.
 */

let currentInvite = null;
let isDismissing = false;

const card = document.getElementById("card");
const titleEl = document.getElementById("notif-title");
const detailEl = document.getElementById("notif-detail");
const badgeEl = document.getElementById("badge-text");
const avatarEl = document.getElementById("avatar-icon");
const btnJoin = document.getElementById("btn-join");
const btnDecline = document.getElementById("btn-decline");
const btnClose = document.getElementById("btn-close");
const timerFill = document.getElementById("timer-fill");

function resetTimerAnimation() {
  if (!timerFill) return;
  timerFill.classList.remove("paused");
  timerFill.style.animation = "none";
  // Trigger reflow to restart CSS animation
  void timerFill.offsetWidth;
  timerFill.style.animation = "timerCountdown 15s linear forwards";
}

function renderInvite(data) {
  if (!data) return;
  currentInvite = data;
  isDismissing = false;
  if (card) card.classList.remove("dismissing");

  const meta = data.meta || {};
  const isPlayInvite = data.type === "play_invite" || Boolean(meta.inviteId);
  const fromUser = meta.fromUsername || meta.senderUsername || "";
  const gameTitle = meta.gameTitle || meta.gameSlug || "";
  const partyName = meta.partyName || "";
  const count = meta.memberCount ? `${meta.memberCount} player${meta.memberCount === 1 ? "" : "s"} in lobby` : "";

  // Badge text
  if (badgeEl) {
    badgeEl.textContent = isPlayInvite ? "Game Invite" : "Party Invite";
  }

  // Icon
  if (avatarEl) {
    avatarEl.textContent = isPlayInvite ? "🎮" : "👥";
  }

  // Title
  if (titleEl) {
    if (fromUser) {
      titleEl.textContent = `${fromUser} invited you`;
    } else if (data.title) {
      titleEl.textContent = data.title;
    } else {
      titleEl.textContent = isPlayInvite ? "Game Invite" : "Party Invite";
    }
  }

  // Detail / sub-headline
  if (detailEl) {
    const parts = [gameTitle || partyName, count].filter(Boolean);
    if (parts.length > 0) {
      detailEl.textContent = parts.join(" · ");
    } else if (data.body) {
      detailEl.textContent = data.body;
    } else {
      detailEl.textContent = "Click to open and join";
    }
  }

  // Action button labels
  if (btnJoin) {
    btnJoin.textContent = isPlayInvite ? "Play Now" : "Join Party";
  }

  resetTimerAnimation();
}

function dismiss() {
  if (isDismissing) return;
  isDismissing = true;
  if (card) card.classList.add("dismissing");
  setTimeout(() => {
    void window.playbound?.hidePartyNotification?.();
  }, 220);
}

// Interactivity
btnJoin?.addEventListener("click", async (e) => {
  e.stopPropagation();
  const partyId = currentInvite?.meta?.partyId;
  const inviteId = currentInvite?.meta?.inviteId;
  const notifId = currentInvite?.id;

  if (partyId && window.playbound?.joinParty) {
    try {
      await window.playbound.joinParty(partyId);
    } catch (err) {
      console.warn("joinParty failed:", err);
    }
  } else if (inviteId && window.playbound?.playInviteAction) {
    try {
      await window.playbound.playInviteAction(inviteId, "accept");
    } catch (err) {
      console.warn("playInviteAction accept failed:", err);
    }
  }

  if (notifId && window.playbound?.markNotificationsRead) {
    void window.playbound.markNotificationsRead({ id: notifId });
  }

  if (window.playbound?.showMainWindow) {
    void window.playbound.showMainWindow({ navigate: "friends" });
  }

  dismiss();
});

btnDecline?.addEventListener("click", async (e) => {
  e.stopPropagation();
  const inviteId = currentInvite?.meta?.inviteId;
  const notifId = currentInvite?.id;

  if (inviteId && window.playbound?.playInviteAction) {
    try {
      await window.playbound.playInviteAction(inviteId, "decline");
    } catch (err) {
      console.warn("playInviteAction decline failed:", err);
    }
  }

  if (notifId && window.playbound?.markNotificationsRead) {
    void window.playbound.markNotificationsRead({ id: notifId });
  }

  dismiss();
});

btnClose?.addEventListener("click", (e) => {
  e.stopPropagation();
  dismiss();
});

card?.addEventListener("click", async () => {
  const notifId = currentInvite?.id;
  if (notifId && window.playbound?.markNotificationsRead) {
    void window.playbound.markNotificationsRead({ id: notifId });
  }

  if (window.playbound?.showMainWindow) {
    void window.playbound.showMainWindow({ navigate: "friends" });
  }

  dismiss();
});

// Pause / resume timer on hover
card?.addEventListener("mouseenter", () => {
  if (timerFill) timerFill.classList.add("paused");
  void window.playbound?.pausePartyNotificationTimer?.();
});

card?.addEventListener("mouseleave", () => {
  if (timerFill) timerFill.classList.remove("paused");
  void window.playbound?.resumePartyNotificationTimer?.();
});

// Register IPC listener from preload
if (window.playbound?.onPartyInvite) {
  window.playbound.onPartyInvite((inviteData) => {
    renderInvite(inviteData);
  });
}
