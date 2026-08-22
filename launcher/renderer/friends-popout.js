/**
 * Slim Steam-style friends list for the detached pop-out window.
 * Polls the same IPC as the full Friends view; actions that need the main
 * shell focus/recreate it.
 */

const POLL_MS = 3000;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function friendSubtitle(f) {
  const presence = f.presence || {};
  const isPlaying = presence.status === "playing";
  const isAway = presence.status === "away";
  const isLooking = Boolean(presence.lookingForPlayers);
  const inParty = Boolean(presence.currentPartyId);
  const gameLabel = presence.currentGameTitle || presence.currentGameId || "";
  if (inParty) return `In a party${gameLabel ? ` · ${gameLabel}` : ""}`;
  if (isPlaying) return `Playing ${gameLabel || "a game"}`;
  if (isLooking) {
    const lfg = presence.lookingForPlayersGameTitle || presence.lookingForPlayersGameId || "";
    return `Looking for players${lfg ? ` · ${lfg}` : ""}`;
  }
  if (isAway) return "Away";
  if (["online", "browsing", "viewing_game", "installing", "launching"].includes(presence.status)) {
    return "Online";
  }
  return "Offline";
}

function statusClass(f) {
  const presence = f.presence || {};
  if (presence.status === "playing") return "playing";
  if (presence.status === "away") return "away";
  if (
    presence.currentPartyId ||
    presence.lookingForPlayers ||
    ["online", "browsing", "viewing_game", "installing", "launching"].includes(presence.status)
  ) {
    return "online";
  }
  return "offline";
}

function isOnlineFriend(f) {
  return statusClass(f) !== "offline";
}

function rowAction(f) {
  const presence = f.presence || {};
  const gameSlug = presence.currentGameId || "";
  const join = f.join || {};
  const showJoin =
    presence.status === "playing" &&
    gameSlug &&
    join.href &&
    ["supported", "requiresManualJoin"].includes(join.capability);

  if (showJoin) {
    return `<button type="button" class="friends-popout-action" data-action="join-game" data-slug="${escapeHtml(
      gameSlug
    )}">${escapeHtml(join.label || "Join")}</button>`;
  }
  if (presence.status === "playing" && gameSlug) {
    return `<button type="button" class="friends-popout-action" data-action="view-game" data-slug="${escapeHtml(
      gameSlug
    )}">View</button>`;
  }
  if (presence.currentPartyId) {
    return `<button type="button" class="friends-popout-action" data-action="join-party" data-id="${escapeHtml(
      presence.currentPartyId
    )}">Join</button>`;
  }
  return "";
}

function friendRowHtml(f) {
  const cls = statusClass(f);
  return `
    <div class="friends-popout-row ${cls}">
      <div class="friends-popout-avatar">${escapeHtml((f.username || "?").charAt(0).toUpperCase())}
        ${cls !== "offline" ? `<span class="friends-popout-dot ${cls}"></span>` : ""}
      </div>
      <div class="friends-popout-meta">
        <div class="friends-popout-name">${escapeHtml(f.username)}</div>
        <div class="friends-popout-sub">${escapeHtml(friendSubtitle(f))}</div>
      </div>
      <div class="friends-popout-actions">${rowAction(f)}</div>
    </div>
  `;
}

function requestRowHtml(req, kind) {
  const name = req.user?.username || "Someone";
  const actions =
    kind === "incoming"
      ? `<button type="button" class="friends-popout-action primary" data-action="accept" data-id="${escapeHtml(
          req.id
        )}">Accept</button>
         <button type="button" class="friends-popout-action" data-action="decline" data-id="${escapeHtml(
           req.id
         )}">Decline</button>`
      : `<button type="button" class="friends-popout-action" data-action="cancel" data-id="${escapeHtml(
          req.id
        )}">Cancel</button>`;
  return `
    <div class="friends-popout-row">
      <div class="friends-popout-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</div>
      <div class="friends-popout-meta">
        <div class="friends-popout-name">${escapeHtml(name)}</div>
        <div class="friends-popout-sub">${kind === "incoming" ? "Wants to be friends" : "Pending"}</div>
      </div>
      <div class="friends-popout-actions">${actions}</div>
    </div>
  `;
}

function sectionHtml(title, body) {
  if (!body) return "";
  return `
    <section class="friends-popout-section">
      <h2 class="friends-popout-section-title">${escapeHtml(title)}</h2>
      ${body}
    </section>
  `;
}

async function openMain(opts = {}) {
  await window.playbound.showMainWindow?.(opts);
}

async function paint() {
  const root = document.getElementById("friends-popout-root");
  if (!root || !window.playbound?.getFriends) return;

  try {
    const account = await window.playbound.getAccount?.();
    if (!account?.connected) {
      root.innerHTML = `
        <p class="friends-popout-empty">Sign in from the main launcher to see friends.</p>
        <button type="button" class="friends-popout-open-main" id="btn-popout-open-main">Open PlayBound</button>
      `;
      document.getElementById("btn-popout-open-main")?.addEventListener("click", () => void openMain());
      return;
    }

    const [friendsData, requestsData] = await Promise.all([
      window.playbound.getFriends(),
      window.playbound.getFriendRequests(),
    ]);
    const friends = Array.isArray(friendsData?.friends) ? friendsData.friends : [];
    const incoming = Array.isArray(requestsData?.incoming) ? requestsData.incoming : [];
    const outgoing = Array.isArray(requestsData?.outgoing) ? requestsData.outgoing : [];

    const online = friends.filter(isOnlineFriend);
    const offline = friends.filter((f) => !isOnlineFriend(f));

    let html = "";
    if (incoming.length) {
      html += sectionHtml(
        `Requests · ${incoming.length}`,
        incoming.map((r) => requestRowHtml(r, "incoming")).join("")
      );
    }
    if (outgoing.length) {
      html += sectionHtml(
        `Outgoing · ${outgoing.length}`,
        outgoing.map((r) => requestRowHtml(r, "outgoing")).join("")
      );
    }
    html += sectionHtml(
      `Online · ${online.length}`,
      online.length ? online.map(friendRowHtml).join("") : `<p class="friends-popout-empty">Nobody online</p>`
    );
    html += sectionHtml(
      `Offline · ${offline.length}`,
      offline.length ? offline.map(friendRowHtml).join("") : ""
    );

    if (!friends.length && !incoming.length && !outgoing.length) {
      html = `<p class="friends-popout-empty">No friends yet — open PlayBound to add some.</p>
        <button type="button" class="friends-popout-open-main" id="btn-popout-open-main">Open PlayBound</button>`;
    }

    root.innerHTML = html;
    document.getElementById("btn-popout-open-main")?.addEventListener("click", () => void openMain());
    wireActions(root);
  } catch (err) {
    root.innerHTML = `<p class="friends-popout-empty">Couldn’t load friends.</p>`;
    console.warn("friends popout paint failed:", err);
  }
}

function wireActions(root) {
  root.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const slug = btn.dataset.slug;
      btn.disabled = true;
      try {
        if (action === "accept" && id) {
          await window.playbound.acceptFriendRequest(id);
          await paint();
        } else if (action === "decline" && id) {
          await window.playbound.declineFriendRequest(id);
          await paint();
        } else if (action === "cancel" && id) {
          await window.playbound.cancelFriendRequest(id);
          await paint();
        } else if (action === "join-party" && id) {
          await window.playbound.joinParty?.(id);
          await openMain({ navigate: { view: "friends" } });
        } else if ((action === "view-game" || action === "join-game") && slug) {
          await openMain({ navigate: { view: "gameDetail", slug } });
        }
      } catch (err) {
        console.warn("friends popout action failed:", err);
        btn.disabled = false;
      }
    });
  });
}

void paint();
setInterval(() => void paint(), POLL_MS);
