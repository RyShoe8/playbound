import { createFreeOfferCard, createGameCard } from "../cards.js";
import {
  api,
  buildActivityPanelHtml,
  editionsContextSlug,
  enhanceSelect,
  escapeHtml,
  executableNoun,
  filterByCompatibility,
  gamePlayHintHtml,
  isGameDesktopCompatible,
  isMacOS,
  isModDesktopCompatible,
  selectExecutableLabel,
  markViewReady,
  setStatus,
  startGameSession,
  state,
  views,
} from "../shared.js";

let friendsPollInterval = null;

function wireFriendsAppearOfflineButton() {
  const btn = document.getElementById("btn-appear-offline");
  if (!btn || !window.playbound.getAppearOffline) {
    if (btn) btn.style.display = "none";
    return;
  }
  window.playbound.getAppearOffline().then((res) => {
    let on = Boolean(res?.appearOffline);
    btn.textContent = on ? "Go online" : "Appear offline";
    btn.title = "Appear offline so friends don’t see you as online or playing";
    btn.onclick = async () => {
      btn.disabled = true;
      const result = await window.playbound.setAppearOffline(!on);
      if (!result?.error) on = !on;
      btn.textContent = on ? "Go online" : "Appear offline";
      btn.disabled = false;
    };
  });
}

async function renderFriendsView() {
  const container = views.friends;
  
  if (!state.accountState.connected) {
    container.innerHTML = `
      <div class="section-header" style="margin-top: 0">
        <div>
          <h1 class="view-title" style="margin: 0">Friends</h1>
          <p class="view-sub" style="margin: 4px 0 0 0">See who's playing and manage friend requests.</p>
        </div>
      </div>
      <div style="text-align: center; padding: 40px 0; border: 1px dashed var(--border); border-radius: 8px; margin-top: 20px;">
        <p class="view-sub">Sign in to view and manage your friends.</p>
        <button class="btn-primary" style="margin-top: 12px" id="btn-friends-login">Sign In</button>
      </div>
    `;
    document.getElementById("btn-friends-login")?.addEventListener("click", () => {
      void window.playbound.signIn?.();
    });
    return;
  }

  // Initial skeleton
  if (!container.querySelector("#friends-content-area")) {
    container.innerHTML = `
      <div class="section-header" style="margin-top: 0">
        <div>
          <h1 class="view-title" style="margin: 0">Friends</h1>
          <p class="view-sub" style="margin: 4px 0 0 0">See who's playing and manage friend requests.</p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <button class="btn-primary btn-sm" id="btn-toggle-create-party">Create Party</button>
          <button class="btn-secondary btn-sm" id="btn-appear-offline">Loading…</button>
          <button class="btn-secondary btn-sm" id="btn-toggle-add-friend">Add Friend</button>
        </div>
      </div>
      
      <div id="add-friends-panel" style="display: none; margin-top: 16px; padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-secondary);">
        <div style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap;">
          <h2 style="margin: 0; font-size: 16px; font-weight: bold; margin-right: 8px;">Add friends</h2>
          <button class="btn-primary btn-sm" id="add-friends-tab-username" style="border-radius: 16px; padding: 4px 12px;">By username</button>
          <button class="btn-secondary btn-sm" id="add-friends-tab-players" style="border-radius: 16px; padding: 4px 12px; border: none; background: transparent; color: var(--text-muted);">Find players</button>
          <button class="btn-secondary btn-sm" id="add-friends-tab-email" style="border-radius: 16px; padding: 4px 12px; border: none; background: transparent; color: var(--text-muted);">Invite by email</button>
        </div>

        <form id="add-friends-form-username" style="display: flex; gap: 8px;">
          <input type="text" class="input-text" id="add-friends-username-input" placeholder="Username" style="flex: 1;" />
          <button type="submit" class="btn-primary" id="btn-search-username" style="border-radius: 16px; padding: 0 16px;">Search</button>
        </form>

        <form id="add-friends-form-players" style="display: none; flex-direction: column; gap: 8px;">
          <p class="view-sub" style="font-size: 12px; margin: 0;">Find people with a game in their library, or anyone playing a genre.</p>
          <div style="display: flex; gap: 8px;">
            <select class="input-text" id="add-friends-game-select" style="flex: 1;">
              <option value="">Any game...</option>
            </select>
            <select class="input-text" id="add-friends-genre-select" style="flex: 1;">
              <option value="">Any genre...</option>
            </select>
            <button type="submit" class="btn-primary" id="btn-search-players" style="border-radius: 16px; padding: 0 16px;">Find</button>
          </div>
        </form>

        <form id="add-friends-form-email" style="display: none; flex-direction: column; gap: 8px;">
          <p class="view-sub" style="font-size: 12px; margin: 0;">Invite someone to PlayBound by email. If they already have an account, we'll send a friend request.</p>
          <div style="display: flex; gap: 8px;">
            <input type="email" class="input-text" id="add-friends-email-input" placeholder="friend@example.com" style="flex: 1;" />
            <button type="submit" class="btn-primary" id="btn-invite-email" style="border-radius: 16px; padding: 0 16px;">Send invite</button>
          </div>
        </form>

        <div id="add-friends-message" style="margin-top: 12px; font-size: 14px; color: var(--text-muted); display: none;"></div>
        <div id="add-friends-results" style="margin-top: 12px;"></div>
      </div>

      <div id="create-party-panel" style="display: none; margin-top: 16px; padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-secondary);">
        <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: bold;">Create a Party</h2>
        <p class="view-sub" style="margin: 0 0 12px; font-size: 12px;">Host a lobby, invite friends, and launch together.</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <label class="view-sub" style="font-size: 12px;">
            Game
            <select class="input-text" id="create-party-game" style="display: block; width: 100%; margin-top: 4px;"></select>
          </label>
          <label class="view-sub" style="font-size: 12px;">
            Who can join
            <select class="input-text" id="create-party-visibility" style="display: block; width: 100%; margin-top: 4px;">
              <option value="public">Public (listed on Parties)</option>
              <option value="friends">Friends only</option>
              <option value="password">Password</option>
              <option value="invite_only">Invite only</option>
            </select>
          </label>
          <label class="view-sub" id="create-party-password-wrap" style="font-size: 12px; display: none;">
            Party password
            <input type="text" class="input-text" id="create-party-password" placeholder="At least 4 characters" autocomplete="off" style="display: block; width: 100%; margin-top: 4px;" />
          </label>
          <label class="filter-check" style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="create-party-voice" checked />
            Voice channel (Discord)
          </label>
          <div>
            <p class="view-sub" style="font-size: 12px; margin: 0 0 6px;">Invite friends (optional)</p>
            <div id="create-party-friends" style="max-height: 160px; overflow: auto; border: 1px solid var(--border); border-radius: 8px; padding: 8px;"></div>
          </div>
          <p id="create-party-message" class="view-sub" style="display: none; margin: 0; font-size: 13px;"></p>
          <button class="btn-primary" id="btn-create-party-submit">Create Party</button>
        </div>
      </div>

      <div id="friends-party-area" style="margin-top: 20px;"></div>
      <div id="friends-content-area" style="margin-top: 20px;">
        <p class="view-sub">Loading friends...</p>
      </div>
    `;

    document.getElementById("btn-toggle-add-friend").onclick = () => api.toggleAddFriendsPanel();
    document.getElementById("btn-toggle-create-party").onclick = () => toggleCreatePartyPanel();
    wireFriendsAppearOfflineButton();
  }

  await api.refreshFriendsData();

  if (!friendsPollInterval) {
    friendsPollInterval = setInterval(() => {
      if (state.currentView === "friends" && state.accountState.connected) {
        api.refreshFriendsData();
      } else {
        clearInterval(friendsPollInterval);
        friendsPollInterval = null;
      }
    }, 30000); // Poll every 30s
  }
  markViewReady(container);
}

async function refreshFriendsData() {
  const content = document.getElementById("friends-content-area");
  if (!content) return;

  try {
    const [friendsData, requestsData, partiesData] = await Promise.all([
      window.playbound.getFriends(),
      window.playbound.getFriendRequests(),
      window.playbound.getParties?.() ?? Promise.resolve(null),
    ]);
    paintPartyArea(partiesData, Array.isArray(friendsData?.friends) ? friendsData.friends : []);

    const friends = Array.isArray(friendsData?.friends) ? friendsData.friends : [];
    const incomingRequests = Array.isArray(requestsData?.incoming) ? requestsData.incoming : [];
    const outgoingRequests = Array.isArray(requestsData?.outgoing) ? requestsData.outgoing : [];

    const inParty = friends.filter((f) => f.presence?.currentPartyId);
    const playing = friends.filter(f => f.presence?.status === "playing");
    const looking = friends.filter(
      (f) => f.presence?.lookingForPlayers && f.presence?.status !== "playing"
    );
    const online = friends.filter(f =>
      ["online", "browsing", "away", "viewing_game", "installing", "launching"].includes(f.presence?.status) &&
      !looking.includes(f) &&
      !inParty.includes(f)
    );
    const offline = friends.filter(f =>
      !playing.includes(f) && !online.includes(f) && !looking.includes(f) && !inParty.includes(f)
    );

    let html = "";

    if (incomingRequests.length > 0) {
      html += `
        <div class="friends-section">
          <div class="section-header" style="margin-bottom: 12px">Incoming Requests</div>
          <div class="friends-list">
            ${incomingRequests.map(req => `
              <div class="friend-card">
                <div class="friend-card-main">
                  <div class="friend-avatar">${escapeHtml(req.user.username.charAt(0).toUpperCase())}</div>
                  <div class="friend-info">
                    <div class="friend-name">${escapeHtml(req.user.username)}</div>
                    <div class="friend-status" style="color: var(--text-muted)">Wants to be friends</div>
                  </div>
                </div>
                <div class="friend-actions">
                  <button class="btn-primary btn-sm btn-accept" data-id="${escapeHtml(req.id)}">Accept</button>
                  <button class="btn-danger btn-sm btn-decline" data-id="${escapeHtml(req.id)}">Decline</button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    if (outgoingRequests.length > 0) {
      html += `
        <div class="friends-section">
          <div class="section-header" style="margin-bottom: 12px">Outgoing Requests</div>
          <div class="friends-list">
            ${outgoingRequests.map(req => `
              <div class="friend-card">
                <div class="friend-card-main">
                  <div class="friend-avatar">${escapeHtml(req.user.username.charAt(0).toUpperCase())}</div>
                  <div class="friend-info">
                    <div class="friend-name">${escapeHtml(req.user.username)}</div>
                    <div class="friend-status" style="color: var(--text-muted)">Pending</div>
                  </div>
                </div>
                <div class="friend-actions">
                  <button class="btn-secondary btn-sm btn-cancel-request" data-id="${escapeHtml(req.id)}">Cancel</button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    if (inParty.length > 0) {
      html += buildFriendsSectionHtml("In a Party", inParty, "party");
    }
    if (playing.length > 0) {
      html += buildFriendsSectionHtml("Playing Now", playing, "playing");
    }
    if (looking.length > 0) {
      html += buildFriendsSectionHtml("Looking for Players", looking, "looking");
    }
    if (online.length > 0) {
      html += buildFriendsSectionHtml("Online", online, "online");
    }
    if (offline.length > 0) {
      html += buildFriendsSectionHtml("Offline", offline, "offline");
    }

    if (!friends.length && !incomingRequests.length && !outgoingRequests.length) {
      html = `
        <div style="text-align: center; padding: 40px 0; border: 1px dashed var(--border); border-radius: 8px;">
          <p class="view-sub">No friends yet. Find someone above — outgoing requests will show here until they accept.</p>
          <button class="btn-primary" style="margin-top: 12px" onclick="api.toggleAddFriendsPanel(true)">Find Friends</button>
        </div>
      `;
    }

    content.innerHTML = html;

    // Attach event listeners
    content.querySelectorAll(".btn-accept").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Accepting...";
        await window.playbound.acceptFriendRequest(btn.dataset.id);
        api.refreshFriendsData();
      });
    });

    content.querySelectorAll(".btn-decline").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Declining...";
        await window.playbound.declineFriendRequest(btn.dataset.id);
        api.refreshFriendsData();
      });
    });

    content.querySelectorAll(".btn-cancel-request").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Cancelling...";
        await window.playbound.cancelFriendRequest(btn.dataset.id);
        api.refreshFriendsData();
      });
    });

    content.querySelectorAll(".btn-remove-friend").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to remove this friend?")) return;
        btn.disabled = true;
        await window.playbound.removeFriend(btn.dataset.id);
        api.refreshFriendsData();
      });
    });

    content.querySelectorAll(".btn-view-game").forEach(btn => {
      btn.addEventListener("click", () => {
        const slug = btn.dataset.slug;
        if (slug) api.navigateTo("gameDetail", { slug });
      });
    });

    content.querySelectorAll(".btn-join-friend-party").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Joining…";
        const res = await window.playbound.joinParty(btn.dataset.id);
        if (res?.error) {
          btn.disabled = false;
          btn.textContent = "Join Party";
          setStatus(res.error, true);
          return;
        }
        handlePartyVoice(res);
        api.refreshFriendsData();
      });
    });

    const onlineCount = playing.length + online.length;
    const friendsNav = document.querySelector('.nav-btn[data-view="friends"]');
    if (friendsNav) {
      const label = friendsNav.querySelector(".nav-label") || friendsNav;
      // Keep icon; update trailing text node if present
      friendsNav.setAttribute("data-online-count", String(onlineCount));
      const badge = friendsNav.querySelector(".friends-online-badge") || document.createElement("span");
      badge.className = "friends-online-badge";
      badge.style.cssText = "margin-left:6px;font-size:11px;font-weight:700;opacity:0.75";
      badge.textContent = onlineCount > 0 ? String(onlineCount) : "";
      if (!badge.parentElement) friendsNav.appendChild(badge);
    }

  } catch (err) {
    content.innerHTML = `<p class="view-sub" style="color: var(--danger)">Failed to load friends: ${escapeHtml(err.message)}</p>`;
  }
}

function buildFriendsSectionHtml(title, list, type) {
  let listHtml = "";
  for (const f of list) {
    let statusText = "Offline";
    let statusDot = "";
    const gameLabel = f.presence?.currentGameTitle || f.presence?.currentGameId || "a game";
    const gameSlug = f.presence?.currentGameId || "";
    const joinSlug =
      type === "looking"
        ? f.presence?.lookingForPlayersGameId || gameSlug
        : gameSlug;
    
    if (type === "party") {
      const partyGame = f.presence?.currentGameTitle || f.presence?.currentGameId || "";
      statusText = `<span style="color: var(--primary)">In a party${
        partyGame ? ` · ${escapeHtml(partyGame)}` : ""
      }</span>`;
      statusDot = `<span class="status-dot dot-online"></span>`;
    } else if (type === "playing") {
      statusText = `<span style="color: var(--primary)">Playing ${escapeHtml(gameLabel)}</span>`;
      statusDot = `<span class="status-dot dot-playing"></span>`;
    } else if (type === "looking") {
      const lfgLabel =
        f.presence?.lookingForPlayersGameId ||
        f.presence?.currentGameTitle ||
        f.presence?.currentGameId ||
        "";
      statusText = `<span style="color: var(--primary)">Looking for players${
        lfgLabel ? ` · ${escapeHtml(lfgLabel)}` : ""
      }</span>`;
      statusDot = `<span class="status-dot dot-online"></span>`;
    } else if (type === "online") {
      statusText = "Online on PlayBound";
      statusDot = `<span class="status-dot dot-online"></span>`;
    }

    listHtml += `
      <div class="friend-card ${type === 'offline' ? 'friend-offline' : ''}">
        <div class="friend-card-main">
          <div class="friend-avatar-wrap">
            <div class="friend-avatar">${escapeHtml(f.username.charAt(0).toUpperCase())}</div>
            ${statusDot}
          </div>
          <div class="friend-info">
            <div class="friend-name">${escapeHtml(f.username)}${f.discordLinked ? ' <span class="discord-badge" title="Discord Linked"></span>' : ''}</div>
            <div class="friend-status">${statusText}</div>
          </div>
        </div>
        <div class="friend-actions">
          ${
            type === "party" && f.presence?.currentPartyId
              ? `<button class="btn-success btn-sm btn-join-friend-party" data-id="${escapeHtml(f.presence.currentPartyId)}">Join Party</button>`
              : (type === "playing" || type === "looking") && joinSlug
              ? `<button class="btn-success btn-sm btn-view-game" data-slug="${escapeHtml(joinSlug)}">Join Game</button>`
              : ""
          }
          <button class="btn-secondary btn-sm btn-remove-friend" data-id="${escapeHtml(f.id)}" title="Remove Friend">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div class="friends-section" style="margin-bottom: 24px">
      <div class="section-header" style="margin-bottom: 12px">${escapeHtml(title)} - ${list.length}</div>
      <div class="friends-list">
        ${listHtml}
      </div>
    </div>
  `;
}
// ─────────────────────────────────────────────────────────────────

// --- ADD FRIENDS LOGIC ---
state._addFriendsMode = "username";
state._addFriendsSent = state._addFriendsSent || {};
state._createPartyFriends = [];

async function toggleAddFriendsPanel(forceShow) {
  const panel = document.getElementById("add-friends-panel");
  if (!panel) return;
  const isHidden = panel.style.display === "none";
  if (isHidden || forceShow) {
    const createPanel = document.getElementById("create-party-panel");
    if (createPanel) createPanel.style.display = "none";
    panel.style.display = "block";
    if (!panel.dataset.initialized) {
      panel.dataset.initialized = "true";
      initAddFriendsPanel();
    }
  } else {
    panel.style.display = "none";
  }
}

async function initAddFriendsPanel() {
  const tabUser = document.getElementById("add-friends-tab-username");
  const tabPlayers = document.getElementById("add-friends-tab-players");
  const tabEmail = document.getElementById("add-friends-tab-email");
  const formUser = document.getElementById("add-friends-form-username");
  const formPlayers = document.getElementById("add-friends-form-players");
  const formEmail = document.getElementById("add-friends-form-email");
  const msg = document.getElementById("add-friends-message");
  const resultsDiv = document.getElementById("add-friends-results");

  const styleInactiveTab = (el) => {
    el.className = "btn-secondary btn-sm";
    el.style.background = "transparent";
    el.style.border = "none";
    el.style.color = "var(--text-muted)";
  };
  const styleActiveTab = (el) => {
    el.className = "btn-primary btn-sm";
    el.style.background = "";
    el.style.color = "";
    el.style.border = "";
  };

  const setMode = (mode) => {
    state._addFriendsMode = mode;
    msg.style.display = "none";
    resultsDiv.innerHTML = "";
    styleInactiveTab(tabUser);
    styleInactiveTab(tabPlayers);
    styleInactiveTab(tabEmail);
    formUser.style.display = "none";
    formPlayers.style.display = "none";
    formEmail.style.display = "none";
    if (mode === "username") {
      styleActiveTab(tabUser);
      formUser.style.display = "flex";
    } else if (mode === "players") {
      styleActiveTab(tabPlayers);
      formPlayers.style.display = "flex";
    } else {
      styleActiveTab(tabEmail);
      formEmail.style.display = "flex";
    }
  };

  tabUser.onclick = () => setMode("username");
  tabPlayers.onclick = () => setMode("players");
  tabEmail.onclick = () => setMode("email");

  const catalog = await window.playbound.getCatalog().catch(() => []);
  const gamesList = Array.isArray(catalog) ? catalog : catalog?.games || [];
  const gameSelect = document.getElementById("add-friends-game-select");
  const genreSelect = document.getElementById("add-friends-genre-select");
  
  gamesList.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.slug;
    opt.textContent = g.title;
    gameSelect.appendChild(opt);
  });
  
  const genres = Array.from(new Set(gamesList.flatMap(g => g.tags || []))).sort();
  genres.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    genreSelect.appendChild(opt);
  });
  
  gameSelect.onchange = () => { if (gameSelect.value) genreSelect.value = ""; };
  genreSelect.onchange = () => { if (genreSelect.value) gameSelect.value = ""; };

  const renderResults = (users) => {
    if (!users || users.length === 0) {
      msg.textContent = state._addFriendsMode === "username" ? "Nobody matched that." : "Nobody else has that in their library yet.";
      msg.style.display = "block";
      resultsDiv.innerHTML = "";
      return;
    }
    
    msg.style.display = "none";
    resultsDiv.innerHTML = users.map(u => {
      const isSent = state._addFriendsSent[u.id];
      let btnHtml = "";
      if (u.friendStatus === "friends") {
        btnHtml = `<span style="font-size: 12px; font-weight: bold; color: var(--text-muted);">✓ Friends</span>`;
      } else if (u.friendStatus === "incoming_request") {
        btnHtml = `<span style="font-size: 12px; font-weight: bold; color: var(--primary);">Wants to be friends</span>`;
      } else if (u.friendStatus === "outgoing_request" || isSent) {
        btnHtml = `<span style="font-size: 12px; font-weight: bold; color: var(--text-muted);">🕒 Requested</span>`;
      } else {
        btnHtml = `<button type="button" class="btn-primary btn-sm btn-send-request" data-id="${escapeHtml(u.id)}" style="border-radius: 16px; padding: 4px 12px; font-size: 12px;">+ Add</button>`;
      }
      
      const extra = u.sharedGames && u.sharedGames.length > 0 
        ? `<div style="font-size: 11px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
            ${escapeHtml(u.sharedGames.join(", "))}${(u.sharedCount || 0) > u.sharedGames.length ? ` +${(u.sharedCount || 0) - u.sharedGames.length} more` : ""}
           </div>`
        : "";

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px;">
          <div style="min-width: 0; padding-right: 12px;">
            <div style="font-weight: bold; font-size: 14px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(u.username)}</div>
            ${extra}
          </div>
          <div style="flex-shrink: 0;" id="request-btn-wrap-${escapeHtml(u.id)}">
            ${btnHtml}
          </div>
        </div>
      `;
    }).join("");
    
    resultsDiv.querySelectorAll(".btn-send-request").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        state._addFriendsSent[id] = true;
        const wrap = document.getElementById(`request-btn-wrap-${id}`);
        wrap.innerHTML = `<span style="font-size: 12px; font-weight: bold; color: var(--text-muted);">🕒 Requested</span>`;
        
        try {
          const res = await window.playbound.sendFriendRequest(id);
          if (res.error) throw new Error(res.error);
          void api.refreshFriendsData();
        } catch (err) {
          state._addFriendsSent[id] = false;
          wrap.innerHTML = `<button type="button" class="btn-primary btn-sm btn-send-request" data-id="${escapeHtml(id)}" style="border-radius: 16px; padding: 4px 12px; font-size: 12px;">+ Add</button>`;
          msg.textContent = err.message || "Couldn't send request.";
          msg.style.color = "var(--danger)";
          msg.style.display = "block";
          // Re-bind click on failure
          const newBtn = wrap.querySelector(".btn-send-request");
          if (newBtn) newBtn.onclick = btn.onclick;
        }
      };
    });
  };

  const doSearch = async (promise) => {
    msg.textContent = "Searching...";
    msg.style.color = "var(--text-muted)";
    msg.style.display = "block";
    resultsDiv.innerHTML = "";
    document.getElementById("btn-search-username").disabled = true;
    document.getElementById("btn-search-players").disabled = true;
    
    try {
      const res = await promise;
      if (res.error) throw new Error(res.error);
      renderResults(res.users || []);
    } catch (err) {
      msg.textContent = err.message || "Couldn't reach the server.";
      msg.style.color = "var(--danger)";
      msg.style.display = "block";
    } finally {
      document.getElementById("btn-search-username").disabled = false;
      document.getElementById("btn-search-players").disabled = false;
    }
  };

  formUser.onsubmit = (e) => {
    e.preventDefault();
    const q = document.getElementById("add-friends-username-input").value.trim();
    if (q.length < 3) {
      msg.textContent = "Enter at least 3 characters.";
      msg.style.color = "var(--danger)";
      msg.style.display = "block";
      resultsDiv.innerHTML = "";
      return;
    }
    doSearch(window.playbound.searchUsers(q));
  };

  formPlayers.onsubmit = (e) => {
    e.preventDefault();
    const g = gameSelect.value;
    const gn = genreSelect.value;
    if (!g && !gn) {
      msg.textContent = "Pick a game or a genre.";
      msg.style.color = "var(--danger)";
      msg.style.display = "block";
      resultsDiv.innerHTML = "";
      return;
    }
    const params = g ? { game: g } : { genre: gn };
    doSearch(window.playbound.discoverPlayers(params));
  };

  formEmail.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("add-friends-email-input").value.trim();
    if (!email.includes("@")) {
      msg.textContent = "Enter a valid email address.";
      msg.style.color = "var(--danger)";
      msg.style.display = "block";
      return;
    }
    const btn = document.getElementById("btn-invite-email");
    btn.disabled = true;
    msg.textContent = "Sending…";
    msg.style.color = "var(--text-muted)";
    msg.style.display = "block";
    resultsDiv.innerHTML = "";
    try {
      const res = await window.playbound.inviteFriendByEmail(email);
      if (res.error) throw new Error(res.error);
      msg.textContent = res.message || "Invite sent.";
      msg.style.color = "var(--primary)";
      document.getElementById("add-friends-email-input").value = "";
      if (res.mode === "existing") void api.refreshFriendsData();
    } catch (err) {
      msg.textContent = err.message || "Couldn't send invite.";
      msg.style.color = "var(--danger)";
    } finally {
      btn.disabled = false;
    }
  };
}

function paintPartyArea(partiesData, friends) {
  const slot = document.getElementById("friends-party-area");
  if (!slot) return;
  if (partiesData?.error) {
    slot.innerHTML = "";
    return;
  }
  const mine = Array.isArray(partiesData?.myParties) ? partiesData.myParties : [];
  const discoverable = Array.isArray(partiesData?.discoverable) ? partiesData.discoverable : [];
  const active = mine[0] || null;
  state._createPartyFriends = friends;

  if (!active && discoverable.length === 0) {
    slot.innerHTML = "";
    return;
  }

  const memberChips = (party) =>
    (party.members || [])
      .map((m) => escapeHtml(m.username))
      .join(", ");

  let html = "";
  if (active) {
    html += `
      <div class="friends-section" style="margin-bottom: 24px">
        <div class="section-header" style="margin-bottom: 12px">Your Party</div>
        <div class="friend-card">
          <div class="friend-card-main">
            <div class="friend-info">
              <div class="friend-name">${escapeHtml(active.gameTitle || active.gameSlug)} Party</div>
              <div class="friend-status">${escapeHtml(active.leaderUsername || "Leader")}'s party · ${active.members?.length || 0}/${active.maxSize || 8} · ${escapeHtml(memberChips(active) || "Just you")}${
                active.hosted?.status === "ready" && active.hosted.host
                  ? ` · ${escapeHtml(active.hosted.host)}:${Number(active.hosted.port) || ""}`
                  : ""
              }</div>
            </div>
          </div>
          <div class="friend-actions">
            ${
              active.discord?.inviteUrl
                ? `<button class="btn-primary btn-sm btn-party-voice" data-url="${escapeHtml(active.discord.inviteUrl)}">Voice</button>`
                : ""
            }
            ${
              active.hosted?.status === "ready" && active.hosted.host && active.hosted.port
                ? `<button class="btn-success btn-sm btn-party-join-host" data-slug="${escapeHtml(active.gameSlug)}" data-host="${escapeHtml(active.hosted.host)}" data-port="${Number(active.hosted.port) || 0}">Join Server</button>`
                : active.gameSlug
                ? `<button class="btn-success btn-sm btn-party-open-game" data-slug="${escapeHtml(active.gameSlug)}">Open Game</button>`
                : ""
            }
            <button class="btn-secondary btn-sm btn-leave-party" data-id="${escapeHtml(active.id)}">Leave</button>
          </div>
        </div>
      </div>
    `;
  }
  if (!active && discoverable.length > 0) {
    html += `
      <div class="friends-section" style="margin-bottom: 24px">
        <div class="section-header" style="margin-bottom: 12px">You Could Play Together</div>
        <div class="friends-list">
          ${discoverable
            .map(
              (p) => `
            <div class="friend-card">
              <div class="friend-card-main">
                <div class="friend-info">
                  <div class="friend-name">${escapeHtml(p.gameTitle || p.gameSlug)}</div>
                  <div class="friend-status">${escapeHtml(p.leaderUsername || "A friend")}'s party · ${p.members?.length || 0}/${p.maxSize || 8}</div>
                </div>
              </div>
              <div class="friend-actions">
                <button class="btn-primary btn-sm btn-join-party" data-id="${escapeHtml(p.id)}">Join Party</button>
              </div>
            </div>`
            )
            .join("")}
        </div>
      </div>
    `;
  }
  slot.innerHTML = html;

  slot.querySelectorAll(".btn-leave-party").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await window.playbound.leaveParty(btn.dataset.id);
      api.refreshFriendsData();
    });
  });
  slot.querySelectorAll(".btn-join-party").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Joining…";
      const res = await window.playbound.joinParty(btn.dataset.id);
      if (res?.error) {
        btn.disabled = false;
        btn.textContent = "Join Party";
        setStatus(res.error, true);
        return;
      }
      handlePartyVoice(res);
      api.refreshFriendsData();
    });
  });
  slot.querySelectorAll(".btn-party-voice").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.url) window.playbound.openExternal(btn.dataset.url);
    });
  });
  slot.querySelectorAll(".btn-party-open-game").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slug = btn.dataset.slug;
      if (slug) api.navigateTo("gameDetail", { slug });
    });
  });
  slot.querySelectorAll(".btn-party-join-host").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slug = btn.dataset.slug;
      const host = btn.dataset.host;
      const port = Number(btn.dataset.port) || 0;
      if (!slug || !host || !port) return;
      btn.disabled = true;
      try {
        setStatus(`Joining ${host}:${port}…`);
        await window.playbound.play(slug, { host, port });
      } catch (err) {
        setStatus(err.message || String(err), true);
        btn.disabled = false;
      }
    });
  });
}

async function toggleCreatePartyPanel(forceShow) {
  const panel = document.getElementById("create-party-panel");
  const addPanel = document.getElementById("add-friends-panel");
  if (!panel) return;
  const isHidden = panel.style.display === "none";
  if (isHidden || forceShow) {
    if (addPanel) addPanel.style.display = "none";
    panel.style.display = "block";
    await fillCreatePartyPanel();
  } else {
    panel.style.display = "none";
  }
}

async function fillCreatePartyPanel() {
  const gameSelect = document.getElementById("create-party-game");
  const friendsBox = document.getElementById("create-party-friends");
  const submit = document.getElementById("btn-create-party-submit");
  const msg = document.getElementById("create-party-message");
  if (!gameSelect || !friendsBox || !submit) return;

  const catalog = state.catalogCache?.length
    ? state.catalogCache
    : await window.playbound.getCatalog().catch(() => []);
  const games = (Array.isArray(catalog) ? catalog : catalog?.games || []).filter(
    (g) => g?.slug && (g.isMultiplayer !== false)
  );
  const preferred = games.filter((g) => g.isMultiplayer);
  const list = preferred.length ? preferred : games;
  const visSelect = document.getElementById("create-party-visibility");
  const passwordWrap = document.getElementById("create-party-password-wrap");
  const syncPasswordField = () => {
    if (passwordWrap) passwordWrap.style.display = visSelect?.value === "password" ? "block" : "none";
  };
  visSelect?.addEventListener("change", syncPasswordField);
  syncPasswordField();

  const previous = gameSelect.value;
  gameSelect.innerHTML = list
    .map((g) => `<option value="${escapeHtml(g.slug)}">${escapeHtml(g.title || g.slug)}</option>`)
    .join("");
  if (previous && [...gameSelect.options].some((o) => o.value === previous)) {
    gameSelect.value = previous;
  }

  const friends = state._createPartyFriends || [];
  friendsBox.innerHTML =
    friends.length === 0
      ? `<p class="view-sub" style="margin:0;font-size:12px;">Add friends to invite them.</p>`
      : friends
          .map(
            (f) => `
        <label class="filter-check" style="display:flex;align-items:center;gap:8px;margin:4px 0;">
          <input type="checkbox" class="create-party-friend" value="${escapeHtml(f.id)}" />
          ${escapeHtml(f.username)}
        </label>`
          )
          .join("");

  submit.onclick = async () => {
    const gameSlug = gameSelect.value;
    const visibility = document.getElementById("create-party-visibility")?.value || "friends";
    const password = document.getElementById("create-party-password")?.value?.trim() || "";
    const wantVoice = document.getElementById("create-party-voice")?.checked !== false;
    const friendIds = [...friendsBox.querySelectorAll(".create-party-friend:checked")].map((el) => el.value);
    if (!gameSlug) {
      if (msg) {
        msg.textContent = "Pick a game.";
        msg.style.color = "var(--danger)";
        msg.style.display = "block";
      }
      return;
    }
    if (visibility === "password" && password.length < 4) {
      if (msg) {
        msg.textContent = "Password must be at least 4 characters.";
        msg.style.color = "var(--danger)";
        msg.style.display = "block";
      }
      return;
    }
    submit.disabled = true;
    submit.textContent = "Creating…";
    if (msg) msg.style.display = "none";
    try {
      const res = await window.playbound.createParty({
        gameSlug,
        visibility,
        maxSize: 8,
        password: visibility === "password" ? password : null,
        wantVoice,
      });
      if (res?.error || !res?.party) throw new Error(res?.error || "Failed to create party.");
      if (friendIds.length && res.party.id) {
        await window.playbound.inviteToParty(res.party.id, friendIds);
      }
      document.getElementById("create-party-panel").style.display = "none";
      handlePartyVoice(res);
      api.refreshFriendsData();
    } catch (err) {
      if (msg) {
        msg.textContent = err.message || "Couldn't create party.";
        msg.style.color = "var(--danger)";
        msg.style.display = "block";
      }
    } finally {
      submit.disabled = false;
      submit.textContent = "Create Party";
    }
  };
}

function handlePartyVoice(res) {
  const inviteUrl = res?.inviteUrl || res?.party?.discord?.inviteUrl || null;
  if (res?.needsDiscordLink) {
    showDiscordLinkPrompt(inviteUrl);
    return;
  }
  if (inviteUrl) {
    window.playbound.openExternal(inviteUrl);
    setStatus("Opening party voice…");
  }
}

function showDiscordLinkPrompt(inviteUrl) {
  let overlay = document.getElementById("discord-link-prompt");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "discord-link-prompt";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div style="max-width:420px;width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;padding:20px">
      <h3 style="margin:0 0 8px;font-size:18px">Link Discord for party voice</h3>
      <p class="view-sub" style="margin:0 0 16px">Parties use a voice channel on the PlayBound Discord. Link your account so we can drop you in with your friends.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <button class="btn-primary" id="discord-link-go">Link Discord</button>
        ${inviteUrl ? `<button class="btn-secondary" id="discord-link-invite">Open voice invite</button>` : ""}
        <button class="btn-secondary" id="discord-link-close">Not now</button>
      </div>
    </div>
  `;
  overlay.style.display = "flex";
  document.getElementById("discord-link-go")?.addEventListener("click", () => {
    window.playbound.linkDiscord?.();
    overlay.style.display = "none";
  });
  document.getElementById("discord-link-invite")?.addEventListener("click", () => {
    if (inviteUrl) window.playbound.openExternal(inviteUrl);
    overlay.style.display = "none";
  });
  document.getElementById("discord-link-close")?.addEventListener("click", () => {
    overlay.style.display = "none";
  });
}

api.renderFriendsView = renderFriendsView;
api.refreshFriendsData = refreshFriendsData;
api.toggleAddFriendsPanel = toggleAddFriendsPanel;
window.toggleAddFriendsPanel = (...args) => api.toggleAddFriendsPanel?.(...args);

