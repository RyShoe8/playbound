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

/*
 * Party constants, copied from platform/src/lib/playTogether/types.ts so the
 * launcher offers exactly the same choices and wording as the website. "event"
 * is deliberately absent — the site filters it out of the picker because event
 * parties are created by the events flow, not by a person.
 */
const PARTY_NAME_MAX = 60;
const PARTY_VISIBILITY_LABELS = {
  public: "Public",
  friends: "Friends only",
  password: "Password",
  invite_only: "Invite only",
};
const VISIBILITY_OPTIONS = [
  { value: "public", hint: "Anyone signed in can join. Listed on Events." },
  { value: "friends", hint: "Only your friends can join." },
  { value: "password", hint: "Anyone with the password can join. Not listed publicly." },
  { value: "invite_only", hint: "People you invite can join." },
];

function partyDisplayName(party) {
  return party?.name?.trim() || `${party?.leaderUsername || "Someone"}'s party`;
}

/**
 * Who "I" am inside a party payload. The token validation now returns the
 * account id, but a launcher that has not re-validated since updating will not
 * have one yet, so fall back to matching the signed-in username against the
 * member list rather than showing every member's kick button.
 */
function currentUserId(party) {
  const id = state.accountState?.userId;
  if (id) return String(id);
  const username = state.accountState?.username;
  if (!username) return null;
  const match = (party?.members || []).find((m) => m.username === username);
  return match ? String(match.userId) : null;
}

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
      syncPrivacyToggles({ appearOffline: on });
      btn.disabled = false;
    };
  });
}

/** Cap matches MAX_LFG_GAMES on /api/presence/lfg. */
const LFG_MAX_GAMES = 6;

let lfgActive = false;
let lfgGames = [];
let lfgSelection = [];

function paintLfgSummary() {
  const summary = document.getElementById("lfg-summary");
  if (!summary) return;
  if (!lfgActive) {
    summary.style.display = "none";
    return;
  }
  const titles = lfgGames.map((slug) => {
    const match = (partyGamesCache || []).find((g) => g.slug === slug);
    return match?.title || slug;
  });
  summary.style.display = "block";
  summary.textContent = `You're looking to party${
    titles.length ? ` · ${titles.join(", ")}` : " · up for anything"
  }`;
}

/**
 * "Look for party", with the preferred-game picker the site uses: turning it
 * off is one click, turning it on opens the picker first so the games can be
 * chosen up front rather than edited afterwards.
 */
function wireLfgButton() {
  const btn = document.getElementById("btn-lfg");
  const panel = document.getElementById("lfg-panel");
  if (!btn || !window.playbound.getLfg) {
    if (btn) btn.style.display = "none";
    return;
  }
  btn.title = "Let people know you want a game (expires in 60 minutes)";

  const paint = () => {
    const open = panel && panel.style.display !== "none";
    btn.textContent = lfgActive ? "Stop looking" : open ? "Close" : "Look for party";
    paintLfgSummary();
  };
  paint();

  void window.playbound
    .getLfg()
    .then((data) => {
      if (data?.myLfg) {
        lfgActive = Boolean(data.myLfg.active);
        lfgGames = Array.isArray(data.myLfg.gameSlugs)
          ? data.myLfg.gameSlugs
          : data.myLfg.gameSlug
          ? [data.myLfg.gameSlug]
          : [];
      }
      paint();
    })
    .catch(() => {});

  btn.onclick = async () => {
    if (!lfgActive) {
      if (!panel) return;
      const open = panel.style.display !== "none";
      panel.style.display = open ? "none" : "block";
      if (!open) {
        lfgSelection = [];
        await ensurePartyGames();
        renderLfgPicker();
      }
      paint();
      return;
    }
    btn.disabled = true;
    btn.textContent = "Saving…";
    const res = await window.playbound.setLfg(false, null);
    if (res?.error) setStatus(res.error, true);
    else {
      lfgActive = false;
      lfgGames = [];
    }
    btn.disabled = false;
    paint();
  };

  document.getElementById("btn-lfg-cancel")?.addEventListener("click", () => {
    if (panel) panel.style.display = "none";
    paint();
  });

  document.getElementById("lfg-search")?.addEventListener("input", () => renderLfgPicker());

  document.getElementById("btn-lfg-confirm")?.addEventListener("click", async () => {
    const confirmBtn = document.getElementById("btn-lfg-confirm");
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Saving…";
    const res = await window.playbound.setLfg(true, lfgSelection);
    if (res?.error) {
      setStatus(res.error, true);
    } else {
      lfgActive = true;
      lfgGames = [...lfgSelection];
      if (panel) panel.style.display = "none";
    }
    confirmBtn.disabled = false;
    paint();
    renderLfgPicker();
  });
}

/** Selected picks pinned above a type-to-filter list of the catalog. */
function renderLfgPicker() {
  const chosenBox = document.getElementById("lfg-chosen");
  const optionsBox = document.getElementById("lfg-options");
  const confirmBtn = document.getElementById("btn-lfg-confirm");
  const limitNote = document.getElementById("lfg-limit-note");
  if (!chosenBox || !optionsBox) return;

  const games = partyGamesCache || [];
  const titleOf = (slug) => games.find((g) => g.slug === slug)?.title || slug;
  const atLimit = lfgSelection.length >= LFG_MAX_GAMES;

  chosenBox.innerHTML = lfgSelection
    .map(
      (slug) =>
        `<button type="button" class="chip lfg-chip-selected" data-remove="${escapeHtml(
          slug
        )}" title="Remove">${escapeHtml(titleOf(slug))} ✕</button>`
    )
    .join("");

  const needle = (document.getElementById("lfg-search")?.value || "").trim().toLowerCase();
  const matches = games
    .filter((g) => !lfgSelection.includes(g.slug))
    .filter((g) => (needle ? g.title.toLowerCase().includes(needle) : true))
    .slice(0, needle ? 24 : 12);

  optionsBox.innerHTML = matches.length
    ? matches
        .map(
          (g) =>
            `<button type="button" class="chip lfg-chip" data-add="${escapeHtml(g.slug)}"${
              atLimit ? " disabled" : ""
            }>${escapeHtml(g.title)}</button>`
        )
        .join("")
    : `<p class="view-sub" style="margin:0;font-size:12px;">No games match that.</p>`;

  if (limitNote) {
    limitNote.style.display = atLimit ? "block" : "none";
    limitNote.textContent = `That's ${LFG_MAX_GAMES} — remove one to swap it out.`;
  }
  if (confirmBtn) {
    confirmBtn.textContent = lfgSelection.length
      ? `Look for a party (${lfgSelection.length})`
      : "Look for a party";
  }

  chosenBox.querySelectorAll("[data-remove]").forEach((el) => {
    el.addEventListener("click", () => {
      lfgSelection = lfgSelection.filter((s) => s !== el.dataset.remove);
      renderLfgPicker();
    });
  });
  optionsBox.querySelectorAll("[data-add]").forEach((el) => {
    el.addEventListener("click", () => {
      if (lfgSelection.length >= LFG_MAX_GAMES) return;
      lfgSelection = [...lfgSelection, el.dataset.add];
      renderLfgPicker();
    });
  });
}

function syncPrivacyToggles(values) {
  for (const [key, value] of Object.entries(values || {})) {
    const box = document.querySelector(`.privacy-toggle[data-key="${key}"]`);
    if (box) box.checked = Boolean(value);
  }
}

/** The site's collapsible "Activity privacy" block, same four switches. */
function wirePrivacyPanel() {
  const header = document.getElementById("privacy-toggle-header");
  const body = document.getElementById("privacy-panel-body");
  const hint = document.getElementById("privacy-toggle-hint");
  if (!header || !body) return;
  header.onclick = () => {
    const open = body.style.display !== "none";
    body.style.display = open ? "none" : "block";
    if (hint) hint.textContent = open ? "Show" : "Hide";
  };

  void window.playbound
    .getAppearOffline()
    .then((data) => {
      if (!data || data.error) return;
      syncPrivacyToggles({
        appearOffline: data.appearOffline,
        hideActivityFromFriends: data.hideActivityFromFriends,
        allowPlayInvites: data.allowPlayInvites !== false,
        notifyFriendActivity: data.notifyFriendActivity !== false,
      });
    })
    .catch(() => {});

  body.querySelectorAll(".privacy-toggle").forEach((box) => {
    box.addEventListener("change", async () => {
      const key = box.dataset.key;
      const next = box.checked;
      box.disabled = true;
      const res = await window.playbound.setPresenceVisibility({ [key]: next });
      if (res?.error) {
        box.checked = !next;
        setStatus(res.error, true);
      } else if (key === "appearOffline") {
        const btn = document.getElementById("btn-appear-offline");
        if (btn) btn.textContent = next ? "Go online" : "Appear offline";
      }
      box.disabled = false;
    });
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
          <p class="view-sub" style="margin: 4px 0 0 0">See who's playing and jump in together.</p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <button class="btn-primary btn-sm" id="btn-toggle-create-party">Start Party</button>
          <button class="btn-secondary btn-sm" id="btn-lfg">Looking for players</button>
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

      <div id="create-party-panel" class="party-panel" style="display: none; margin-top: 16px;">
        <div class="party-panel-body">
          <div>
            <h2 style="margin: 0; font-size: 16px; font-weight: bold;">Create a Party</h2>
            <p class="view-sub" style="margin: 4px 0 0; font-size: 13px;">Host a lobby, invite friends, then pick a game in the party window.</p>
          </div>

          <div class="party-field">
            <label class="party-field-label" for="create-party-name">
              Party name <span style="font-weight: 400; text-transform: none;">(optional)</span>
            </label>
            <input type="text" class="input-text" id="create-party-name" maxlength="${PARTY_NAME_MAX}" placeholder="Friday raid, OpenRA night…" autocomplete="off" style="width: 100%;" />
          </div>

          <div class="party-field">
            <label class="party-field-label" for="create-party-game">
              Game <span style="font-weight: 400; text-transform: none;">(optional)</span>
            </label>
            <select class="input-text" id="create-party-game" style="width: 100%;"></select>
          </div>

          <div class="party-field">
            <label class="party-field-label" for="create-party-visibility">Who can join</label>
            <select class="input-text" id="create-party-visibility" style="width: 100%;">
              ${VISIBILITY_OPTIONS.map(
                (o) => `<option value="${o.value}">${escapeHtml(PARTY_VISIBILITY_LABELS[o.value])}</option>`
              ).join("")}
            </select>
            <p class="view-sub" id="create-party-visibility-hint" style="margin: 0; font-size: 12px;"></p>
          </div>

          <div class="party-field" id="create-party-password-wrap" style="display: none;">
            <label class="party-field-label" for="create-party-password">Party password</label>
            <input type="text" class="input-text" id="create-party-password" placeholder="At least 4 characters" autocomplete="off" style="width: 100%;" />
          </div>

          <label class="party-switch">
            <span style="min-width: 0;">
              <span style="display: block; font-size: 14px; font-weight: 600;">Voice channel</span>
              <span class="view-sub" style="display: block; font-size: 12px;">Open a Discord voice room for this party</span>
            </span>
            <input type="checkbox" id="create-party-voice" checked />
          </label>

          <div class="party-field">
            <span class="party-field-label">Invite Friends (Optional)</span>
            <div id="create-party-friends" style="max-height: 160px; overflow: auto; border: 1px solid var(--border); border-radius: 8px; padding: 8px;"></div>
          </div>

          <p id="create-party-message" class="view-sub" style="display: none; margin: 0; font-size: 13px;"></p>
          <button class="btn-primary" id="btn-create-party-submit">Create Party</button>
        </div>
      </div>

      <div class="privacy-panel" id="privacy-panel">
        <button type="button" class="privacy-panel-header" id="privacy-toggle-header">
          <span>Activity privacy</span>
          <span class="view-sub" style="font-size: 12px;" id="privacy-toggle-hint">Show</span>
        </button>
        <div id="privacy-panel-body" style="display: none;">
          ${[
            ["appearOffline", "Appear offline", "Friends see you as offline"],
            ["hideActivityFromFriends", "Hide what I'm playing", "Stay online without sharing game activity"],
            ["allowPlayInvites", "Allow play invites", "Friends can invite you to play"],
            ["notifyFriendActivity", "Friend activity notifications", "Get notified when friends start playing or LFG"],
          ]
            .map(
              ([key, label, description]) => `
            <label class="party-switch privacy-row">
              <span style="min-width: 0;">
                <span style="display: block; font-size: 14px; font-weight: 600;">${escapeHtml(label)}</span>
                <span class="view-sub" style="display: block; font-size: 12px;">${escapeHtml(description)}</span>
              </span>
              <input type="checkbox" class="privacy-toggle" data-key="${key}" />
            </label>`
            )
            .join("")}
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
    wireLfgButton();
    wirePrivacyPanel();
  }

  // Loaded before the first paint so the party window's game picker is
  // populated the moment an existing party renders.
  await ensurePartyGames();
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
    const friends = Array.isArray(friendsData?.friends) ? friendsData.friends : [];
    state._createPartyFriends = friends;
    paintPartyArea(partiesData);

    const incomingRequests = Array.isArray(requestsData?.incoming) ? requestsData.incoming : [];
    const outgoingRequests = Array.isArray(requestsData?.outgoing) ? requestsData.outgoing : [];

    /*
     * The site collapses every non-offline state into one "Online" section
     * rather than a section per status, ordering in-party first so the people
     * you can act on lead. Anyone the server considers offline is excluded even
     * if a stale presence flag would otherwise place them above.
     */
    const inParty = friends.filter((f) => f.presence?.currentPartyId);
    const playing = friends.filter((f) => f.presence?.status === "playing");
    const looking = friends.filter(
      (f) => f.presence?.lookingForPlayers && f.presence?.status !== "playing"
    );
    const away = friends.filter((f) => f.presence?.status === "away");
    const online = friends.filter((f) =>
      ["online", "browsing", "viewing_game", "installing", "launching"].includes(f.presence?.status)
    );
    const offline = friends.filter(
      (f) =>
        !["playing", "online", "browsing", "away", "viewing_game", "installing", "launching"].includes(
          f.presence?.status
        )
    );

    const offlineIds = new Set(offline.map((f) => f.id));
    const seenOnline = new Set();
    const onlineAll = [];
    for (const f of [...inParty, ...playing, ...looking, ...online, ...away]) {
      if (offlineIds.has(f.id) || seenOnline.has(f.id)) continue;
      seenOnline.add(f.id);
      onlineAll.push(f);
    }

    let html = "";

    if (!friends.length && !incomingRequests.length && !outgoingRequests.length) {
      html += `
        <div style="text-align: center; padding: 40px 0; border: 1px dashed var(--border); border-radius: 8px;">
          <p class="view-sub">No friends yet. Find someone above — outgoing requests will show here until they accept.</p>
          <button class="btn-primary" style="margin-top: 12px" id="btn-find-friends">Find Friends</button>
        </div>
      `;
    }

    if (onlineAll.length > 0) {
      html += buildFriendsSectionHtml("Online", onlineAll);
    }
    if (offline.length > 0) {
      html += buildFriendsSectionHtml("Offline", offline);
    }

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

    content.innerHTML = html;

    document.getElementById("btn-find-friends")?.addEventListener("click", () => {
      void api.toggleAddFriendsPanel(true);
    });

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

    content.querySelectorAll(".btn-friend-discord").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.playbound.openExternal("https://discord.com/app");
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

    const onlineCount = onlineAll.length;
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

/**
 * One friend, laid out like the site's FriendCard: presence-tinted avatar dot,
 * name + Discord pip, a subtitle that states what they are doing, the single
 * most useful action, and the shared-library chips pinned to the bottom.
 *
 * The site derives everything from the friend's own presence rather than from
 * which bucket it happened to land in, so a person who is both in a party and
 * playing reads correctly either way — hence no `type` argument here.
 */
function buildFriendCardHtml(f) {
  const presence = f.presence || {};
  const isPlaying = presence.status === "playing";
  const isAway = presence.status === "away";
  const isLooking = Boolean(presence.lookingForPlayers);
  const inParty = Boolean(presence.currentPartyId);
  const offline = !isPlaying && !isAway && !isLooking && !inParty &&
    !["online", "browsing", "viewing_game", "installing", "launching"].includes(presence.status);

  const gameSlug = presence.currentGameId || "";
  const gameLabel = presence.currentGameTitle || presence.currentGameId || "";
  const lfgSlug = !isPlaying && isLooking ? presence.lookingForPlayersGameId || "" : "";

  let subtitle;
  if (inParty) {
    subtitle = `<span style="color: var(--accent)">In a party${
      gameLabel ? ` · ${escapeHtml(gameLabel)}` : ""
    }</span>`;
  } else if (isPlaying) {
    subtitle = `<span style="color: var(--accent)">Playing ${escapeHtml(gameLabel || "a game")}${
      isLooking ? " · Looking for players" : ""
    }</span>`;
  } else if (isLooking) {
    const lfgLabel = presence.lookingForPlayersGameTitle || presence.lookingForPlayersGameId || "";
    subtitle = `Looking for players${lfgLabel ? ` · ${escapeHtml(lfgLabel)}` : ""}`;
  } else if (isAway) {
    subtitle = "Away";
  } else if (offline) {
    subtitle = "Offline";
  } else {
    subtitle = "Online on PlayBound";
  }

  const statusDot = offline
    ? ""
    : `<span class="status-dot ${isPlaying ? "dot-playing" : isAway ? "dot-away" : "dot-online"}"></span>`;

  /*
   * Same precedence the site uses: a real join beats "View Game", which beats
   * a party invite, which beats a bare LFG signal. `join` comes straight from
   * the API's capability resolver, so the label matches the website's.
   */
  const join = f.join || {};
  const showJoin =
    isPlaying && gameSlug && join.href && ["supported", "requiresManualJoin"].includes(join.capability);

  let action = "";
  if (showJoin) {
    action = `<button class="btn-success btn-sm btn-view-game" data-slug="${escapeHtml(gameSlug)}">${escapeHtml(
      join.label || "Join Game"
    )}</button>`;
  } else if (isPlaying && gameSlug) {
    action = `<button class="btn-primary btn-sm btn-view-game" data-slug="${escapeHtml(gameSlug)}">View Game</button>`;
  } else if (inParty) {
    action = `<button class="btn-success btn-sm btn-join-friend-party" data-id="${escapeHtml(
      presence.currentPartyId
    )}">Join Party</button>`;
  } else if (lfgSlug) {
    action = `<button class="btn-success btn-sm btn-view-game" data-slug="${escapeHtml(lfgSlug)}">Join</button>`;
  }

  const shared = Array.isArray(f.sharedGames) ? f.sharedGames : [];
  const shownShared = shared.slice(0, 8);
  const extraShared = shared.length - shownShared.length;
  const sharedHtml = shownShared.length
    ? `<div class="friend-shared">
        ${shownShared
          .map(
            (g) =>
              `<button type="button" class="friend-shared-chip btn-view-game" data-slug="${escapeHtml(
                g.slug
              )}">${escapeHtml(g.title || g.slug)}</button>`
          )
          .join("")}
        ${extraShared > 0 ? `<span class="friend-shared-chip friend-shared-more">+${extraShared} more</span>` : ""}
      </div>`
    : `<p class="view-sub" style="font-size: 12px; margin: 0;">No shared installs yet</p>`;

  return `
    <div class="friend-card ${offline ? "friend-offline" : ""}">
      <div class="friend-card-top">
        <div class="friend-card-main">
          <div class="friend-avatar-wrap">
            <div class="friend-avatar">${escapeHtml(f.username.charAt(0).toUpperCase())}</div>
            ${statusDot}
          </div>
          <div class="friend-info">
            <div class="friend-name">${escapeHtml(f.username)}${
              f.discordLinked ? ' <span class="discord-badge" title="Discord linked"></span>' : ""
            }</div>
            <div class="friend-status">${subtitle}</div>
          </div>
        </div>
        <div class="friend-actions">
          ${action}
          ${
            f.discordLinked && isPlaying
              ? `<button class="btn-secondary btn-sm btn-friend-discord">Discord</button>`
              : ""
          }
          <button class="btn-secondary btn-sm btn-remove-friend" data-id="${escapeHtml(f.id)}" title="Remove friend">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
          </button>
        </div>
      </div>
      <div class="friend-card-bottom">${sharedHtml}</div>
    </div>
  `;
}

function buildFriendsSectionHtml(title, list) {
  return `
    <div class="friends-section" style="margin-bottom: 24px">
      <div class="section-header" style="margin-bottom: 12px">${escapeHtml(title)} - ${list.length}</div>
      <div class="friends-grid">
        ${list.map((f) => buildFriendCardHtml(f)).join("")}
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

/* Icons matching the lucide set the website's PartyView uses. */
const ICON = {
  users: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  crown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>`,
  x: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  phone: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  logout: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
};

/**
 * Catalog used to populate the party game picker. The website's friends page
 * lists the entire catalog (see app/friends/page.tsx), so this does too rather
 * than pre-filtering to multiplayer titles.
 */
let partyGamesCache = null;

async function ensurePartyGames() {
  if (partyGamesCache) return partyGamesCache;
  const catalog = state.catalogCache?.length
    ? state.catalogCache
    : await window.playbound.getCatalog().catch(() => []);
  const games = (Array.isArray(catalog) ? catalog : catalog?.games || []).filter((g) => g?.slug);
  partyGamesCache = games
    .map((g) => ({ slug: g.slug, title: g.title || g.slug, kind: g.kind, url: g.url }))
    .sort((a, b) => a.title.localeCompare(b.title));
  return partyGamesCache;
}

function partyGameOptionsHtml(selectedSlug, party) {
  const games = partyGamesCache || [];
  const options = [`<option value="">Select a game</option>`];
  for (const g of games) {
    options.push(
      `<option value="${escapeHtml(g.slug)}"${g.slug === selectedSlug ? " selected" : ""}>${escapeHtml(
        g.title
      )}</option>`
    );
  }
  // A party can point at something the launcher catalog does not carry (a
  // testing entry, say). The site keeps that selectable rather than silently
  // resetting the party's game the next time the leader touches the picker.
  if (selectedSlug && !games.some((g) => g.slug === selectedSlug)) {
    options.push(
      `<option value="${escapeHtml(selectedSlug)}" selected>${escapeHtml(
        party?.gameTitle || selectedSlug
      )}</option>`
    );
  }
  return options.join("");
}

function partyStatusLabel(status) {
  const text = String(status || "").replace("_", " ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

/** The site's PartyView: header, member roster, action bar. */
function buildPartyViewHtml(party) {
  const userId = currentUserId(party);
  const isLeader = String(party.leaderId) === String(userId);
  const me = (party.members || []).find((m) => String(m.userId) === String(userId));
  const isReady = Boolean(me?.ready);
  const hasGame = Boolean(party.gameSlug);
  const ended = party.status === "ended";
  const inFlight = party.status === "launching" || party.status === "playing";
  const canJoinGame = hasGame && !ended && (isReady || inFlight);
  const hosted = party.hosted || {};
  const hostedReady = hosted.status === "ready" && hosted.host && hosted.port;
  const hasVoice = Boolean(party.discord?.inviteUrl || party.discord?.voiceChannelId);

  const titleHtml =
    isLeader && !ended
      ? `<input type="text" class="input-text party-name-input" id="party-name-input" maxlength="${PARTY_NAME_MAX}"
           placeholder="${escapeHtml(partyDisplayName(party))}" value="${escapeHtml(party.name || "")}" autocomplete="off" />`
      : `<h3 class="party-title">${escapeHtml(partyDisplayName(party))}</h3>`;

  /*
   * The leader can re-pick at any time short of the party ending. Locking this
   * once play started meant a party that finished a game had no way to move on
   * to another one without disbanding.
   */
  const gameHtml = isLeader && !ended
    ? `<select class="input-text party-game-select" id="party-game-select" aria-label="Party game" style="max-width: 380px;">
         ${partyGameOptionsHtml(party.gameSlug || "", party)}
       </select>`
    : hasGame
    ? `<p class="party-game-label">${escapeHtml(party.gameTitle || party.gameSlug)}</p>`
    : "";

  const visibilityHtml =
    isLeader && !ended
      ? `<div class="party-header-side">
           <select class="input-text" id="party-visibility-select" aria-label="Who can join">
             ${VISIBILITY_OPTIONS.map(
               (o) =>
                 `<option value="${o.value}"${party.visibility === o.value ? " selected" : ""}>${escapeHtml(
                   PARTY_VISIBILITY_LABELS[o.value]
                 )}</option>`
             ).join("")}
           </select>
         </div>`
      : "";

  const membersHtml = (party.members || [])
    .map((m) => {
      const isMe = String(m.userId) === String(userId);
      return `
        <li class="party-member">
          <div class="party-member-main">
            <div class="party-member-avatar${m.ready ? " is-ready" : ""}">${escapeHtml(
              m.username.charAt(0).toUpperCase()
            )}</div>
            <div>
              <p class="party-member-name">
                ${escapeHtml(m.username)}
                ${m.role === "leader" ? `<span class="party-crown">${ICON.crown}</span>` : ""}
                ${isMe ? `<span class="party-member-you">(You)</span>` : ""}
              </p>
              <p class="party-member-sub">${m.ready ? "Ready" : "Not ready"}</p>
            </div>
          </div>
          ${
            isLeader && !isMe
              ? `<div class="party-member-actions">
                   <button type="button" class="party-icon-btn btn-party-promote" data-user="${escapeHtml(
                     m.userId
                   )}" title="Make Leader">${ICON.crown}</button>
                   <button type="button" class="party-icon-btn party-icon-danger btn-party-kick" data-user="${escapeHtml(
                     m.userId
                   )}" title="Kick">${ICON.x}</button>
                 </div>`
              : ""
          }
        </li>`;
    })
    .join("");

  const readyHtml =
    !ended && !inFlight
      ? `<button type="button" id="btn-party-ready" class="party-btn ${
          isReady ? "btn-secondary" : "btn-success"
        }"${hasGame ? "" : " disabled title=\"Pick a game first\""}>
           ${isReady ? ICON.x : ICON.check} ${isReady ? "Cancel Ready" : "Ready Up"}
         </button>`
      : "";

  const joinGameHtml = canJoinGame
    ? `<div class="party-join-wrap">
         <button type="button" id="btn-party-join-game" class="party-btn btn-primary">${ICON.play} Join Game</button>
         ${
           hostedReady
             ? `<p class="party-host-line">${escapeHtml(hosted.host)}:${Number(hosted.port) || ""}</p>`
             : ""
         }
       </div>`
    : "";

  const hostedNoteHtml =
    hosted.enabled && hosted.status === "pending"
      ? `<p class="view-sub party-inline-note">Starting public server…</p>`
      : hosted.enabled && hosted.status === "failed"
      ? `<p class="party-inline-note" style="color: var(--danger)">${escapeHtml(
          hosted.error || "Could not start the PlayBound server."
        )}</p>`
      : "";

  const playingPillHtml =
    party.status === "playing" && !canJoinGame
      ? `<div class="party-playing-pill">${ICON.play} Playing</div>`
      : "";

  const voiceHtml = hasVoice
    ? `<button type="button" id="btn-party-voice" class="party-btn party-voice-btn" data-url="${escapeHtml(
        party.discord?.inviteUrl || ""
      )}">${ICON.phone} Launch Voice</button>`
    : isLeader
    ? `<button type="button" id="btn-party-enable-voice" class="party-btn btn-secondary">${ICON.phone} Enable Voice</button>`
    : "";

  const leaveLabel = isLeader && (party.members || []).length === 1 ? "End Party" : "Leave";

  return `
    <div class="friends-section" style="margin-bottom: 24px">
      <div class="party-panel">
        <div class="party-header">
          <div class="party-header-main">
            ${titleHtml}
            ${gameHtml}
            <p class="party-meta">
              <span>${escapeHtml(partyStatusLabel(party.status))}</span>
              <span>·</span>
              <span class="party-meta-count">${ICON.users} ${(party.members || []).length} / ${
                party.maxSize || 8
              }</span>
            </p>
          </div>
          ${visibilityHtml}
        </div>

        <div class="party-members">
          <h4 class="party-section-label">Members</h4>
          <ul class="party-member-list">${membersHtml}</ul>
        </div>

        <div class="party-actions">
          <div class="party-actions-group">
            ${readyHtml}
            ${joinGameHtml}
            ${hostedNoteHtml}
            ${playingPillHtml}
          </div>
          <div class="party-actions-group">
            ${voiceHtml}
            <button type="button" id="btn-party-leave" class="party-btn party-leave-btn" data-id="${escapeHtml(
              party.id
            )}">${ICON.logout} ${leaveLabel}</button>
          </div>
          <p class="party-voice-error" id="party-voice-error" style="display: none;"></p>
        </div>
      </div>
    </div>
  `;
}

/** The site's PartyCard, used by PartyDiscovery. */
function buildPartyCardHtml(party) {
  const members = party.members || [];
  const shown = members.slice(0, 5);
  const extra = members.length - shown.length;
  const isPlaying = party.status === "playing" || party.status === "launching";
  return `
    <div class="party-card">
      <div class="party-card-top">
        <div>
          <h4 class="party-card-title">${escapeHtml(partyDisplayName(party))}</h4>
          ${
            party.hosted?.status === "ready"
              ? `<p class="party-card-server">PlayBound server ready</p>`
              : ""
          }
          <p class="party-card-sub">${ICON.crown} ${escapeHtml(
            party.gameTitle || party.gameSlug || party.leaderUsername || ""
          )}</p>
        </div>
        <div class="party-card-count">${ICON.users} <span>${members.length} / ${party.maxSize || 8}</span></div>
      </div>
      <div class="party-card-bottom">
        <div class="party-card-avatars">
          ${shown
            .map(
              (m) =>
                `<div class="party-card-avatar" title="${escapeHtml(m.username)}">${escapeHtml(
                  m.username.charAt(0).toUpperCase()
                )}</div>`
            )
            .join("")}
          ${extra > 0 ? `<div class="party-card-avatar party-card-avatar-more">+${extra}</div>` : ""}
        </div>
        <button type="button" class="party-card-join btn-join-party" data-id="${escapeHtml(party.id)}">${
          isPlaying ? "View Party" : "Join Party"
        }</button>
      </div>
    </div>
  `;
}

function buildPartyDiscoveryHtml(parties) {
  return `
    <div class="friends-section" style="margin-bottom: 24px">
      <div class="party-discovery-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>
        <h3>You Could Play Together</h3>
      </div>
      <div class="party-card-grid">${parties.map((p) => buildPartyCardHtml(p)).join("")}</div>
    </div>
  `;
}

function partyAreaSignature(active, discoverable) {
  return JSON.stringify([
    active && {
      id: active.id,
      name: active.name,
      status: active.status,
      visibility: active.visibility,
      gameSlug: active.gameSlug,
      gameTitle: active.gameTitle,
      leaderId: active.leaderId,
      maxSize: active.maxSize,
      members: (active.members || []).map((m) => [m.userId, m.username, m.role, m.ready]),
      hosted: active.hosted || null,
      discord: active.discord || null,
    },
    discoverable.map((p) => [p.id, p.status, p.members?.length, p.name, p.gameSlug]),
  ]);
}

function paintPartyArea(partiesData) {
  const slot = document.getElementById("friends-party-area");
  if (!slot) return;
  if (partiesData?.error) {
    slot.innerHTML = "";
    return;
  }
  const mine = Array.isArray(partiesData?.myParties) ? partiesData.myParties : [];
  const discoverable = Array.isArray(partiesData?.discoverable) ? partiesData.discoverable : [];
  const active = mine[0] || null;

  // The site hides "Start Party" while you are already in one.
  const startBtn = document.getElementById("btn-toggle-create-party");
  if (startBtn) startBtn.style.display = active ? "none" : "";
  if (active) {
    const createPanel = document.getElementById("create-party-panel");
    if (createPanel) createPanel.style.display = "none";
  }

  if (!active && discoverable.length === 0) {
    slot.innerHTML = "";
    slot.dataset.sig = "";
    return;
  }

  /*
   * The 30-second poll would otherwise wipe out a half-typed party name or a
   * select the user has open. Repaint only when the payload actually changed,
   * and never while the focus is inside this area — the signature is left
   * stale in that case so the next tick picks the change up.
   */
  const sig = partyAreaSignature(active, discoverable);
  if (slot.dataset.sig === sig) return;
  if (slot.contains(document.activeElement)) return;
  slot.dataset.sig = sig;

  slot.innerHTML = active ? buildPartyViewHtml(active) : buildPartyDiscoveryHtml(discoverable);
  if (active) wirePartyView(slot, active);
  else wirePartyDiscovery(slot);
}

/** Applies a party mutation response: surface the error or repaint. */
function applyPartyResult(res, fallbackMessage) {
  if (!res || res.error) {
    setStatus(res?.error || fallbackMessage, true);
    return false;
  }
  const slot = document.getElementById("friends-party-area");
  if (slot) slot.dataset.sig = "";
  void api.refreshFriendsData();
  return true;
}

function wirePartyView(slot, party) {
  const partyId = party.id;

  const nameInput = slot.querySelector("#party-name-input");
  if (nameInput) {
    nameInput.addEventListener("blur", async () => {
      const next = nameInput.value.trim();
      if (next === (party.name || "")) return;
      applyPartyResult(
        await window.playbound.setPartyName(partyId, next || null),
        "Couldn't rename the party."
      );
    });
  }

  const gameSelect = slot.querySelector("#party-game-select");
  if (gameSelect) {
    gameSelect.addEventListener("change", async () => {
      if (!gameSelect.value) return;
      applyPartyResult(
        await window.playbound.setPartyGame(partyId, gameSelect.value),
        "Couldn't set the party game."
      );
    });
    enhanceSelect(gameSelect);
  }

  const visibilitySelect = slot.querySelector("#party-visibility-select");
  if (visibilitySelect) {
    visibilitySelect.addEventListener("change", async () => {
      applyPartyResult(
        await window.playbound.setPartyVisibility(partyId, visibilitySelect.value),
        "Couldn't change who can join."
      );
    });
    enhanceSelect(visibilitySelect);
  }

  slot.querySelectorAll(".btn-party-promote").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      applyPartyResult(
        await window.playbound.transferPartyLeadership(partyId, btn.dataset.user),
        "Couldn't transfer leadership."
      );
    });
  });

  slot.querySelectorAll(".btn-party-kick").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      applyPartyResult(
        await window.playbound.removePartyMember(partyId, btn.dataset.user),
        "Couldn't remove that member."
      );
    });
  });

  const readyBtn = slot.querySelector("#btn-party-ready");
  if (readyBtn) {
    const me = (party.members || []).find(
      (m) => String(m.userId) === String(currentUserId(party))
    );
    readyBtn.addEventListener("click", async () => {
      readyBtn.disabled = true;
      applyPartyResult(
        await window.playbound.setPartyReady(partyId, !me?.ready),
        "Couldn't update your ready state."
      );
    });
  }

  const joinGameBtn = slot.querySelector("#btn-party-join-game");
  if (joinGameBtn) {
    joinGameBtn.addEventListener("click", async () => {
      joinGameBtn.disabled = true;
      const res = await window.playbound.partyJoinGame(partyId);
      if (res?.error) setStatus(res.error, true);
      /*
       * Join-game is what provisions the dedicated server on first launch, so
       * the response carries the host and port. Launching from the party we
       * rendered from would use a payload captured before that happened and
       * start the game unconnected.
       */
      await launchPartyGame(res?.party || party);
      joinGameBtn.disabled = false;
      const areaSlot = document.getElementById("friends-party-area");
      if (areaSlot) areaSlot.dataset.sig = "";
      void api.refreshFriendsData();
    });
  }

  const voiceBtn = slot.querySelector("#btn-party-voice");
  if (voiceBtn) {
    voiceBtn.addEventListener("click", () => {
      if (voiceBtn.dataset.url) {
        window.playbound.openExternal(voiceBtn.dataset.url);
        setStatus("Opening party voice…");
      }
    });
  }

  const enableVoiceBtn = slot.querySelector("#btn-party-enable-voice");
  if (enableVoiceBtn) {
    enableVoiceBtn.addEventListener("click", async () => {
      const errorEl = slot.querySelector("#party-voice-error");
      enableVoiceBtn.disabled = true;
      enableVoiceBtn.textContent = "Enabling…";
      const res = await window.playbound.provisionPartyDiscord(partyId);
      const inviteUrl = res?.inviteUrl || res?.party?.discord?.inviteUrl || null;
      if (res?.error && !inviteUrl) {
        if (errorEl) {
          errorEl.textContent = res.error;
          errorEl.style.display = "block";
        }
        enableVoiceBtn.disabled = false;
        enableVoiceBtn.innerHTML = `${ICON.phone} Enable Voice`;
        return;
      }
      handlePartyVoice(res);
      const areaSlot = document.getElementById("friends-party-area");
      if (areaSlot) areaSlot.dataset.sig = "";
      void api.refreshFriendsData();
    });
  }

  const leaveBtn = slot.querySelector("#btn-party-leave");
  if (leaveBtn) {
    leaveBtn.addEventListener("click", async () => {
      leaveBtn.disabled = true;
      const isLeader = String(party.leaderId) === String(currentUserId(party));
      const alone = (party.members || []).length === 1;
      const res =
        isLeader && alone
          ? await window.playbound.endParty(partyId)
          : await window.playbound.leaveParty(partyId);
      if (res?.error) {
        leaveBtn.disabled = false;
        setStatus(res.error, true);
        return;
      }
      const areaSlot = document.getElementById("friends-party-area");
      if (areaSlot) areaSlot.dataset.sig = "";
      void api.refreshFriendsData();
    });
  }
}

/**
 * The launcher's equivalent of the site's launchLocalGame(): a hosted party
 * server joins directly, a browser title opens externally, and anything else
 * launches locally — falling back to the game page when it is not installed.
 */
async function launchPartyGame(party) {
  const slug = party.gameSlug;
  if (!slug) return;
  const hosted = party.hosted || {};
  if (hosted.status === "ready" && hosted.host && hosted.port) {
    const address = `${hosted.host}:${hosted.port}`;
    try {
      setStatus(`Joining ${address}…`);
      const res = await window.playbound.play(slug, {
        host: hosted.host,
        port: Number(hosted.port),
        name: hosted.name || party.gameTitle || "",
      });
      startGameSession(slug, party.gameTitle || slug);
      /*
       * A few clients have no command-line join and only take an address from
       * their own menu. Launching and saying nothing looks identical to a
       * failed auto-connect, so hand the player the address instead.
       */
      if (res?.manualConnect) {
        void window.playbound.clipboardWrite?.(address);
        setStatus(`Copied ${address} — join it from the game's multiplayer menu.`);
      } else {
        setStatus(`Joining ${party.gameTitle || slug} at ${address}…`);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
    return;
  }

  /*
   * PlayBound hosts this game but the room is not up yet. Launching now would
   * drop the player on the main menu with no server to join, which reads as a
   * broken button — better to say what is happening and let them retry.
   */
  if (hosted.enabled && hosted.status !== "ready") {
    setStatus(
      hosted.status === "failed"
        ? hosted.error || "Could not start the PlayBound server. Try Join Game again."
        : "Starting the PlayBound server — try Join Game again in a moment.",
      hosted.status === "failed"
    );
    return;
  }

  const games = partyGamesCache || [];
  const catalogGame = games.find((g) => g.slug === slug);
  if (catalogGame?.kind === "external" && catalogGame.url) {
    window.playbound.openExternal(catalogGame.url);
    return;
  }

  try {
    setStatus("Checking Java / launching…");
    await window.playbound.play(slug);
    startGameSession(slug, party.gameTitle || slug);
    setStatus(`Launched ${party.gameTitle || slug}`);
  } catch {
    // Not installed yet — the game page is where installing happens.
    api.navigateTo("gameDetail", { slug });
  }
}

function wirePartyDiscovery(slot) {
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
      slot.dataset.sig = "";
      void api.refreshFriendsData();
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
  const nameInput = document.getElementById("create-party-name");
  if (!gameSelect || !friendsBox || !submit) return;

  await ensurePartyGames();
  const visSelect = document.getElementById("create-party-visibility");
  const passwordWrap = document.getElementById("create-party-password-wrap");
  const visHint = document.getElementById("create-party-visibility-hint");
  const syncVisibility = () => {
    const value = visSelect?.value || "friends";
    if (passwordWrap) passwordWrap.style.display = value === "password" ? "flex" : "none";
    if (visHint) {
      visHint.textContent = VISIBILITY_OPTIONS.find((o) => o.value === value)?.hint || "";
    }
  };
  if (visSelect && !visSelect.dataset.wired) {
    visSelect.dataset.wired = "true";
    visSelect.value = "friends";
    visSelect.addEventListener("change", syncVisibility);
  }
  syncVisibility();

  /*
   * The game is optional here, exactly as on the site: its create panel has no
   * picker at all and the leader chooses in the party window. The launcher
   * keeps the picker for people starting a party around something already
   * installed, but an empty selection is a valid submission.
   */
  const previous = gameSelect.value;
  gameSelect.innerHTML = partyGameOptionsHtml("", null).replace(
    ">Select a game<",
    ">No game yet — pick one later<"
  );
  if (previous && [...gameSelect.options].some((o) => o.value === previous)) {
    gameSelect.value = previous;
  }
  enhanceSelect(gameSelect);
  if (visSelect) enhanceSelect(visSelect);
  // innerHTML bypasses the appendChild hook the custom select patches in, so
  // the rendered list has to be refreshed by hand after a rebuild.
  gameSelect._syncCustomSelect?.();
  visSelect?._syncCustomSelect?.();

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
    const gameSlug = gameSelect.value || null;
    const name = nameInput?.value?.trim() || "";
    const visibility = document.getElementById("create-party-visibility")?.value || "friends";
    const password = document.getElementById("create-party-password")?.value?.trim() || "";
    const wantVoice = document.getElementById("create-party-voice")?.checked !== false;
    const friendIds = [...friendsBox.querySelectorAll(".create-party-friend:checked")].map((el) => el.value);
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
        name: name || null,
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
      if (wantVoice) submit.textContent = "Starting voice…";
      document.getElementById("create-party-panel").style.display = "none";
      if (nameInput) nameInput.value = "";
      handlePartyVoice(res);
      const slot = document.getElementById("friends-party-area");
      if (slot) slot.dataset.sig = "";
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

