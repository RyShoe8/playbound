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
let friendsPollMs = 30000;
let localPlaying = false;
let playPollWired = false;

const FRIENDS_POLL_MS = 30000;
const LIVE_PARTY_POLL_MS = 2000;

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
          <!-- Full-size buttons, not btn-sm: these are the page's primary actions. -->
          <button class="btn-primary friends-action-btn" id="btn-toggle-create-party">Start Party</button>
          <button class="btn-secondary friends-action-btn" id="btn-lfg">Look for party</button>
          <button class="btn-secondary friends-action-btn" id="btn-appear-offline">Loading…</button>
          <button class="btn-secondary friends-action-btn" id="btn-toggle-add-friend">Add Friend</button>
        </div>
      </div>

      <p class="view-sub" id="lfg-summary" style="display: none; margin: 8px 0 0; font-size: 13px;"></p>

      <div id="lfg-panel" class="party-panel" style="display: none; margin-top: 16px;">
        <div class="party-panel-body">
          <div>
            <h2 style="margin: 0; font-size: 16px; font-weight: bold;">What do you want to play?</h2>
            <p class="view-sub" style="margin: 4px 0 0; font-size: 13px;">
              Pick up to ${LFG_MAX_GAMES}, or skip it and you'll show as up for anything. Expires in 60 minutes.
            </p>
          </div>
          <div id="lfg-chosen" class="card-tags" style="margin: 0;"></div>
          <input type="text" class="input-text" id="lfg-search" placeholder="Search games…" autocomplete="off" style="width: 100%;" />
          <div id="lfg-options" class="card-tags" style="margin: 0; max-height: 180px; overflow: auto;"></div>
          <p class="view-sub" id="lfg-limit-note" style="display: none; margin: 0; font-size: 12px;"></p>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            <button class="btn-primary" id="btn-lfg-confirm">Look for a party</button>
            <button class="btn-secondary" id="btn-lfg-cancel">Cancel</button>
          </div>
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

      <div id="create-party-panel" class="create-party-card" style="display: none; margin-top: 16px;">
        <div class="create-party-header">
          <div>
            <h4 class="create-party-title">Create a Party</h4>
            <p class="create-party-subtitle">Host a lobby, invite friends, then pick a game in the party window.</p>
          </div>
          <button type="button" class="create-party-close" id="btn-create-party-close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="create-party-field">
          <label class="create-party-label" for="create-party-name">
            Party name <span class="create-party-label-opt">(optional)</span>
          </label>
          <input type="text" class="create-party-input" id="create-party-name" maxlength="${PARTY_NAME_MAX}" placeholder="Friday raid, OpenRA night…" autocomplete="off" />
        </div>

        <div class="create-party-field">
          <label class="create-party-label" for="create-party-visibility">Who can join</label>
          <select class="create-party-input" id="create-party-visibility">
            ${VISIBILITY_OPTIONS.map(
              (o) => `<option value="${o.value}">${escapeHtml(PARTY_VISIBILITY_LABELS[o.value])}</option>`
            ).join("")}
          </select>
          <p class="create-party-hint" id="create-party-visibility-hint"></p>
        </div>

        <div class="create-party-field" id="create-party-password-wrap" style="display: none;">
          <label class="create-party-label" for="create-party-password">Party password</label>
          <input type="text" class="create-party-input" id="create-party-password" placeholder="At least 4 characters" autocomplete="off" />
        </div>

        <label class="create-party-voice-box">
          <div style="min-width: 0; flex: 1;">
            <span class="create-party-voice-title">Voice channel</span>
            <span class="create-party-voice-desc">Open a Discord voice room for this party</span>
          </div>
          <input type="checkbox" class="create-party-checkbox" id="create-party-voice" checked />
        </label>

        <div class="create-party-field">
          <span class="create-party-label">Invite Friends <span class="create-party-label-opt">(Optional)</span></span>
          <div id="create-party-friends" class="create-party-friends-box"></div>
        </div>

        <div id="create-party-message" class="create-party-error" style="display: none;"></div>
        <button type="button" class="create-party-submit-btn" id="btn-create-party-submit">Create Party</button>
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
  }

  // Loaded before the first paint so the party window's game picker is
  // populated the moment an existing party renders.
  await ensurePartyGames();
  await api.refreshFriendsData();
  syncFriendsPoll();
  markViewReady(container);
}

function syncFriendsPoll() {
  const live = Boolean(state._activeParty && state._activeParty.status !== "ended");
  const next = live && !localPlaying ? LIVE_PARTY_POLL_MS : FRIENDS_POLL_MS;
  if (friendsPollInterval && friendsPollMs === next) return;
  if (friendsPollInterval) {
    clearInterval(friendsPollInterval);
    friendsPollInterval = null;
  }
  friendsPollMs = next;
  friendsPollInterval = setInterval(() => {
    if (state.currentView === "friends" && state.accountState.connected) {
      api.refreshFriendsData();
    } else {
      clearInterval(friendsPollInterval);
      friendsPollInterval = null;
    }
  }, friendsPollMs);
}

function setLocalPlaying(next) {
  const on = Boolean(next);
  if (localPlaying === on) return;
  localPlaying = on;
  syncFriendsPoll();
}

async function refreshLocalPlaying() {
  if (!window.playbound.getPlayingGame) {
    setLocalPlaying(false);
    return;
  }
  try {
    const slug = await window.playbound.getPlayingGame();
    setLocalPlaying(Boolean(slug));
  } catch {
    setLocalPlaying(false);
  }
}

if (!playPollWired) {
  playPollWired = true;
  void refreshLocalPlaying();
  window.playbound.onGameStarted?.(() => setLocalPlaying(true));
  window.playbound.onGameExited?.(() => {
    void refreshLocalPlaying();
  });
}

async function refreshFriendsData() {
  const content = document.getElementById("friends-content-area");
  if (!content) return;

  void window.playbound.syncLibraryNow?.({ quiet: true });

  try {
    const [friendsData, requestsData, partiesData, upcomingEventsData] = await Promise.all([
      window.playbound.getFriends(),
      window.playbound.getFriendRequests(),
      window.playbound.getParties?.() ?? Promise.resolve(null),
      window.playbound.getFriendsUpcomingEvents?.() ?? Promise.resolve({ events: [] }),
    ]);
    const friends = Array.isArray(friendsData?.friends) ? friendsData.friends : [];
    state._createPartyFriends = friends;
    paintPartyArea(partiesData);
    syncFriendsPoll();
    const activeParty = Array.isArray(partiesData?.myParties) ? partiesData.myParties[0] : null;
    if (activeParty?.id) void refreshPartyChat(activeParty);

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
        <div style="text-align: center; padding: 40px 0; border: 1px dashed var(--border); border-radius: 12px;">
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
        <section class="friends-section" style="margin-bottom: 24px">
          <h3 class="friends-section-title">Incoming Requests - ${incomingRequests.length}</h3>
          <div class="friends-card-grid">
            ${incomingRequests
              .map(
                (req) => `
              <div class="pb-request-card">
                <div class="pb-friend-user-group">
                  <div class="pb-friend-avatar-wrap">
                    <div class="pb-friend-avatar">${escapeHtml(req.user.username.charAt(0).toUpperCase())}</div>
                  </div>
                  <div class="pb-friend-info">
                    <div class="pb-friend-name">${escapeHtml(req.user.username)}</div>
                    <div class="pb-friend-subtitle">Wants to be friends</div>
                  </div>
                </div>
                <div class="pb-friend-actions">
                  <button class="btn-primary btn-sm btn-accept" data-id="${escapeHtml(req.id)}">Accept</button>
                  <button class="btn-danger btn-sm btn-decline" data-id="${escapeHtml(req.id)}">Decline</button>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </section>
      `;
    }

    if (outgoingRequests.length > 0) {
      html += `
        <section class="friends-section" style="margin-bottom: 24px">
          <h3 class="friends-section-title">Outgoing Requests - ${outgoingRequests.length}</h3>
          <div class="friends-card-grid">
            ${outgoingRequests
              .map(
                (req) => `
              <div class="pb-request-card">
                <div class="pb-friend-user-group">
                  <div class="pb-friend-avatar-wrap">
                    <div class="pb-friend-avatar">${escapeHtml(req.user.username.charAt(0).toUpperCase())}</div>
                  </div>
                  <div class="pb-friend-info">
                    <div class="pb-friend-name">${escapeHtml(req.user.username)}</div>
                    <div class="pb-friend-subtitle">Pending</div>
                  </div>
                </div>
                <div class="pb-friend-actions">
                  <button class="btn-secondary btn-sm btn-cancel-request" data-id="${escapeHtml(req.id)}">Cancel</button>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </section>
      `;
    }

    const upcomingEvents = Array.isArray(upcomingEventsData?.events) ? upcomingEventsData.events : [];
    if (upcomingEvents.length > 0) {
      html += `
        <section class="pb-friends-upcoming" style="margin-top: 16px;">
          <h2 class="pb-friends-upcoming-title">Upcoming with friends</h2>
          <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 4px;">
            ${upcomingEvents
              .map(
                (e) => `
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <a class="btn-event-link" data-id="${escapeHtml(e.id)}" style="font-weight: 700; color: var(--text-main); cursor: pointer; text-decoration: none; font-size: 14px;">
                  ${escapeHtml(e.title)}
                </a>
                <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim);">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span>${escapeHtml(e.startsAt ? new Date(e.startsAt).toLocaleString() : "")}</span>
                </div>
                <div style="font-size: 12px; color: var(--text-dim);">
                  ${escapeHtml(e.friendNames[0] || "Friend")}${
                  e.friendCount > 1
                    ? ` and ${e.friendCount - 1} other friend${e.friendCount - 1 === 1 ? "" : "s"}`
                    : ""
                } going
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </section>
      `;
    }

    content.innerHTML = html;

    document.getElementById("btn-find-friends")?.addEventListener("click", () => {
      void api.toggleAddFriendsPanel(true);
    });

    // Attach event listeners
    content.querySelectorAll(".btn-accept").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Accepting...";
        await window.playbound.acceptFriendRequest(btn.dataset.id);
        api.refreshFriendsData();
      });
    });

    content.querySelectorAll(".btn-decline").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Declining...";
        await window.playbound.declineFriendRequest(btn.dataset.id);
        api.refreshFriendsData();
      });
    });

    content.querySelectorAll(".btn-cancel-request").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Cancelling...";
        await window.playbound.cancelFriendRequest(btn.dataset.id);
        api.refreshFriendsData();
      });
    });

    content.querySelectorAll(".btn-remove-friend").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to remove this friend?")) return;
        btn.disabled = true;
        await window.playbound.removeFriend(btn.dataset.id);
        api.refreshFriendsData();
      });
    });

    content.querySelectorAll(".btn-view-game").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const slug = btn.dataset.slug;
        if (slug) api.openGameDetail(slug, "friends");
      });
    });

    content.querySelectorAll(".btn-event-link").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (id) api.openEventDetail(id, "friends");
      });
    });

    content.querySelectorAll(".btn-friend-discord").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Prefers the desktop app when it is installed.
        void (window.playbound.openDiscordInvite?.("https://discord.com/app") ??
          window.playbound.openExternal("https://discord.com/app"));
      });
    });

    content.querySelectorAll(".btn-join-friend-party").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
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
      friendsNav.setAttribute("data-online-count", String(onlineCount));
      const badge = friendsNav.querySelector(".friends-online-badge") || document.createElement("span");
      badge.className = "friends-online-badge";
      badge.style.cssText = "margin-left:6px;font-size:11px;font-weight:700;opacity:0.75";
      badge.textContent = onlineCount > 0 ? String(onlineCount) : "";
      if (!badge.parentElement) friendsNav.appendChild(badge);
    }
  } catch (err) {
    content.innerHTML = `<p class="view-sub" style="color: var(--danger)">Failed to load friends: ${escapeHtml(
      err.message
    )}</p>`;
  }
}

/**
 * One friend, laid out like the site's FriendCard: presence-tinted avatar dot,
 * name + Discord pip, a subtitle that states what they are doing, the single
 * most useful action, and the shared-library chips pinned to the bottom.
 */
function buildFriendCardHtml(f) {
  const presence = f.presence || {};
  const isPlaying = presence.status === "playing";
  const isAway = presence.status === "away";
  const isLooking = Boolean(presence.lookingForPlayers);
  const inParty = Boolean(presence.currentPartyId);
  const offline =
    !isPlaying &&
    !isAway &&
    !isLooking &&
    !inParty &&
    !["online", "browsing", "viewing_game", "installing", "launching"].includes(presence.status);

  const gameSlug = presence.currentGameId || "";
  const gameLabel = presence.currentGameTitle || presence.currentGameId || "";
  const lfgSlug = !isPlaying && isLooking ? presence.lookingForPlayersGameId || "" : "";

  let subtitle;
  if (inParty) {
    subtitle = `<span style="color: var(--primary); font-weight: 600;">In a party${
      gameLabel ? ` · ${escapeHtml(gameLabel)}` : ""
    }</span>`;
  } else if (isPlaying) {
    subtitle = `<span style="color: var(--primary); font-weight: 600;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:-2px; margin-right:3px;"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>
      Playing ${escapeHtml(gameLabel || "a game")}${
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

  const dotClass = isPlaying ? "playing" : isAway ? "away" : "online";
  const statusDot = offline ? "" : `<span class="pb-friend-status-dot ${dotClass}"></span>`;

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
    action = `<button type="button" class="pb-friend-btn-play btn-view-game" data-slug="${escapeHtml(
      gameSlug
    )}">${escapeHtml(join.label || "Join Game")}</button>`;
  } else if (isPlaying && gameSlug) {
    action = `<button type="button" class="pb-friend-btn-view btn-view-game" data-slug="${escapeHtml(
      gameSlug
    )}">View Game</button>`;
  } else if (inParty) {
    action = `<button type="button" class="pb-friend-btn-play btn-join-friend-party" data-id="${escapeHtml(
      presence.currentPartyId
    )}">Join Party</button>`;
  } else if (lfgSlug) {
    action = `<button type="button" class="pb-friend-btn-play btn-view-game" data-slug="${escapeHtml(
      lfgSlug
    )}">Join</button>`;
  }

  const shared = Array.isArray(f.sharedGames) ? f.sharedGames : [];
  const shownShared = shared.slice(0, 8);
  const extraShared = shared.length - shownShared.length;
  const sharedHtml = shownShared.length
    ? `<div class="pb-friend-chips-wrap">
        ${shownShared
          .map(
            (g) =>
              `<button type="button" class="pb-friend-game-chip btn-view-game" data-slug="${escapeHtml(
                g.slug
              )}">${escapeHtml(g.title || g.slug)}</button>`
          )
          .join("")}
        ${
          extraShared > 0
            ? `<span class="pb-friend-game-chip" style="cursor:default; opacity:0.7;">+${extraShared} more</span>`
            : ""
        }
      </div>`
    : `<p class="view-sub" style="font-size: 12px; margin: 0;">No shared installs yet</p>`;

  return `
    <div class="pb-friend-card ${offline ? "offline" : ""}">
      <div class="pb-friend-card-top">
        <div class="pb-friend-user-group">
          <div class="pb-friend-avatar-wrap">
            <div class="pb-friend-avatar">${escapeHtml(f.username.charAt(0).toUpperCase())}</div>
            ${statusDot}
          </div>
          <div class="pb-friend-info">
            <div class="pb-friend-name">
              <span>${escapeHtml(f.username)}</span>
              ${f.discordLinked ? '<span class="pb-friend-discord-pip" title="Discord linked"></span>' : ""}
            </div>
            <div class="pb-friend-subtitle">${subtitle}</div>
          </div>
        </div>
        <div class="pb-friend-actions">
          ${action}
          ${
            f.discordLinked && isPlaying
              ? `<button type="button" class="pb-friend-btn-discord btn-friend-discord">Discord</button>`
              : ""
          }
          <button type="button" class="pb-friend-btn-remove btn-remove-friend" data-id="${escapeHtml(
            f.id
          )}" title="Remove friend">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
          </button>
        </div>
      </div>
      <div class="pb-friend-card-bottom">${sharedHtml}</div>
    </div>
  `;
}

function buildFriendsSectionHtml(title, list) {
  return `
    <section class="friends-section" style="margin-bottom: 24px">
      <h3 class="friends-section-title">${escapeHtml(title)} - ${list.length}</h3>
      <div class="friends-card-grid">
        ${list.map((f) => buildFriendCardHtml(f)).join("")}
      </div>
    </section>
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
  download: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  send: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
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
           hosted.roomCode
             ? `<p class="party-host-line party-room-code">Room Code: ${escapeHtml(String(hosted.roomCode))}</p>`
             : hostedReady
             ? `<p class="party-host-line">${escapeHtml(hosted.host)}:${Number(hosted.port) || ""}</p>`
             : ""
         }
       </div>`
    : "";

  const hostedNoteHtml =
    hosted.enabled && hosted.status === "pending"
      ? `<p class="view-sub party-inline-note">Starting public server…</p>`
      : hosted.enabled && hosted.status === "failed"
      ? `<p class="party-inline-note party-hosted-error">${escapeHtml(
          hosted.error || "Could not start the PlayBound server."
        )}</p>`
      : "";

  const lan = party.lan || {};
  const lanNoteHtml =
    lan.enabled && lan.status === "pending"
      ? `<p class="view-sub party-inline-note">Setting up the party network…</p>`
      : lan.enabled && lan.status === "failed"
      ? `<p class="party-inline-note party-hosted-error">${escapeHtml(
          lan.error ||
            "Could not set up the party network. The discovery reflector may not be running on the NetBird VPS."
        )}</p>`
      : "";
  const lanStepsHtml =
    lan.enabled && Array.isArray(lan.steps) && lan.steps.length
      ? `<ol class="party-lan-steps">${lan.steps
          .map((s) => `<li>${escapeHtml(String(s))}</li>`)
          .join("")}</ol>`
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
            ${lanNoteHtml}
            ${playingPillHtml}
          </div>
          <div class="party-actions-group">
            ${voiceHtml}
            <button type="button" id="btn-party-leave" class="party-btn party-leave-btn" data-id="${escapeHtml(
              party.id
            )}">${ICON.logout} ${leaveLabel}</button>
          </div>
          ${lanStepsHtml}
          <p class="party-voice-error" id="party-voice-error" style="display: none;"></p>
        </div>

        ${buildPartyChatHtml(party)}
      </div>
      ${buildPartyConfigSyncHtml(party, userId)}
    </div>
  `;
}

function installHref(gameSlug, editionSlug, mods) {
  const q = new URLSearchParams();
  if (editionSlug && editionSlug !== "__base__") q.set("edition", editionSlug);
  for (const mod of mods || []) q.append("mod", mod);
  const qs = q.toString();
  return `playbound://install/${gameSlug}${qs ? `?${qs}` : ""}`;
}

function missingSummary(m, editionSlug) {
  const out = [];
  if (!m.hasGame) out.push("the game");
  else if (editionSlug && !m.hasEdition) out.push("a different edition");
  if ((m.missingMods || []).length) {
    out.push(`${m.missingMods.length} mod${m.missingMods.length === 1 ? "" : "s"}`);
  }
  return out;
}

function buildPartyConfigSyncHtml(party, userId) {
  const sync = party.configSync;
  if (!party.gameSlug) return "";
  if (!sync) {
    return `<div class="party-sync-card party-sync-pending"><p class="party-member-sub">Checking who has the game…</p></div>`;
  }
  if (sync.allReady) {
    const matchLine =
      sync.referenceSource === "host" && sync.hostUsername
        ? `Every member matches ${sync.hostUsername}'s setup.`
        : "All members have the required game and editions installed.";
    return `<div class="party-sync-card party-sync-ready">
      <div>
        <h4 class="party-sync-title">Everyone is ready to play</h4>
        <p class="party-member-sub">${escapeHtml(matchLine)}</p>
      </div>
    </div>`;
  }

  const out = (sync.members || []).filter((m) => missingSummary(m, sync.editionSlug).length > 0);
  if (out.length === 0) return "";

  const hostMember = (sync.members || []).find((m) => m.isHost);
  const hostHasGame = Boolean(hostMember?.hasGame) || sync.referenceSource === "host";
  const installEdition =
    (sync.editionSlug && sync.editionSlug !== "__base__" ? sync.editionSlug : null) ||
    (hostMember?.installedEditionSlug && hostMember.installedEditionSlug !== "__base__"
      ? hostMember.installedEditionSlug
      : null);
  const href = installHref(party.gameSlug, installEdition, sync.modSlugs || []);

  const rows = out
    .map((m) => {
      const missing = missingSummary(m, sync.editionSlug);
      const isYou = String(m.userId) === String(userId);
      const showInstall = isYou;
      return `<li class="party-sync-row">
        <div class="party-sync-row-main">
          <div class="party-member-avatar">${escapeHtml((m.username || "?").charAt(0).toUpperCase())}</div>
          <span class="party-sync-who">${escapeHtml(isYou ? "You" : m.username)}</span>
          <span class="party-member-sub">${escapeHtml(
            isYou ? `need ${missing.join(" and ")}` : `needs ${missing.join(" and ")} — they can install it from their party panel`
          )}</span>
        </div>
        ${
          showInstall
            ? `<button type="button" class="party-sync-install btn-party-install" data-href="${escapeHtml(
                href
              )}">${ICON.download} Install the right version</button>`
            : ""
        }
      </li>`;
    })
    .join("");

  const intro =
    hostHasGame && sync.hostUsername
      ? `This party is playing ${sync.hostUsername}'s setup. Anyone who doesn't have it yet can install it from their own party panel.`
      : "Some members are missing files this party needs. They won't be able to launch with the party until they install them.";

  return `<div class="party-sync-card party-sync-blocked">
    <div class="party-sync-blocked-head">Not everyone can play yet</div>
    <p class="party-member-sub">${escapeHtml(intro)}</p>
    <ul class="party-sync-list">${rows}</ul>
  </div>`;
}

function buildPartyChatHtml(party) {
  const ready = Boolean(party.discord?.textChannelId);
  return `
    <div class="party-chat" id="party-chat">
      <div class="party-chat-header">
        <h4 class="party-chat-title">Party chat</h4>
        <span class="party-chat-discord">Opens in Discord too</span>
      </div>
      <div class="party-chat-list" id="party-chat-list" data-party="${escapeHtml(party.id || "")}">
        <p class="view-sub">${ready ? "No messages yet. Say something." : "Chat starts when the host launches voice. Messages here are the same Discord channel."}</p>
      </div>
      <form class="party-chat-form" id="party-chat-form">
        <input type="text" class="input-text party-chat-input" id="party-chat-input" maxlength="500" placeholder="${
          ready ? "Message the party…" : "Voice first, then chat"
        }" ${ready ? "" : "disabled"} />
        <button type="submit" class="party-chat-send" id="party-chat-send" aria-label="Send" ${
          ready ? "" : "disabled"
        }>${ICON.send}</button>
      </form>
    </div>
  `;
}

async function refreshPartyChat(party) {
  const list = document.getElementById("party-chat-list");
  if (!list || !party?.id || !party.discord?.textChannelId) return;
  if (!window.playbound.getPartyChat) return;
  try {
    const data = await window.playbound.getPartyChat(party.id);
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    if (!messages.length) return;
    list.innerHTML = messages
      .map(
        (m) =>
          `<div class="party-member-sub"><strong>${escapeHtml(m.username || "Player")}</strong> ${escapeHtml(
            m.content || ""
          )}</div>`
      )
      .join("");
    list.scrollTop = list.scrollHeight;
  } catch {
    /* ignore */
  }
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
      configSync: active.configSync
        ? [
            active.configSync.allReady,
            (active.configSync.members || []).map((m) => [
              m.userId,
              m.hasGame,
              m.hasEdition,
              (m.missingMods || []).length,
            ]),
          ]
        : null,
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
  state._activeParty = active;

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
      void window.playbound.syncLibraryNow?.({ quiet: true });
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

  slot.querySelectorAll(".btn-party-install").forEach((btn) => {
    btn.addEventListener("click", () => {
      const href = btn.dataset.href;
      if (!href || !window.playbound.openDeepLink) return;
      void window.playbound.openDeepLink(href);
      void window.playbound.syncLibraryNow?.({ quiet: true });
    });
  });

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
    voiceBtn.addEventListener("click", () => openPartyVoice(voiceBtn.dataset.url));
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

  const chatForm = slot.querySelector("#party-chat-form");
  if (chatForm) {
    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = slot.querySelector("#party-chat-input");
      const content = String(input?.value || "").trim();
      if (!content || !window.playbound.sendPartyChat) return;
      input.value = "";
      const res = await window.playbound.sendPartyChat(partyId, content);
      if (res?.error) {
        setStatus(res.error, true);
        return;
      }
      void refreshPartyChat(party);
    });
  }
}

/**
 * Put this machine on the party's overlay segment before launching.
 *
 * Returns false when the launch should not proceed — the player has something
 * to fix first, and starting the game would only strand them on a title
 * screen with no one to find.
 */
async function prepareVirtualLan(party, lan) {
  if (lan.status === "failed") {
    setStatus(lan.error || "Could not set up the party network. Try Join Game again.", true);
    return false;
  }
  if (lan.status !== "ready") {
    setStatus("Setting up the party network — try Join Game again in a moment.");
    return false;
  }
  if (!window.playbound.prepareVirtualLan) {
    setStatus("Update PlayBound to join this party's network.", true);
    return false;
  }

  setStatus("Connecting to the party network…");
  const res = await window.playbound.prepareVirtualLan({
    partyId: party.id,
    slug: party.gameSlug,
    editionSlug: party.editionSlug || null,
    adapterFile: lan.adapterFile || null,
  });

  if (res?.needsInstall) {
    setStatus(res.error, true);
    if (res.downloadUrl) window.playbound.openExternal(res.downloadUrl);
    return false;
  }
  if (res?.error) {
    setStatus(res.error, true);
    return false;
  }
  if (lan.adapterFile && !res?.pointed) {
    setStatus(
      "Could not point the game at the party network. Launching would open a LAN menu nobody else is on.",
      true
    );
    return false;
  }

  const steps = Array.isArray(lan.steps) && lan.steps.length ? ` Then: ${lan.steps.join(" → ")}.` : "";
  setStatus(
    res?.pointed
      ? `On the party network as "${res.adapterName}".${steps}`
      : `On the party network as "${res.adapterName}". Pick that adapter in-game.${steps}`
  );
  return true;
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
      }, party.editionSlug || null);
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

  /*
   * Virtual-LAN games have no address to join — the party shares an overlay
   * segment and the game finds its own peers over it. Get on the segment
   * before launching, then tell the player the handful of in-game clicks that
   * are still theirs to make, because the game opens on its title screen
   * either way and silence would read as a dead button.
   */
  const lan = party.lan || {};
  if (lan.enabled) {
    const ready = await prepareVirtualLan(party, lan);
    if (!ready) return;
  }

  const games = partyGamesCache || [];
  const catalogGame = games.find((g) => g.slug === slug);
  if (catalogGame?.kind === "external" && catalogGame.url) {
    window.playbound.openExternal(catalogGame.url);
    return;
  }

  try {
    setStatus("Checking Java / launching…");
    await window.playbound.play(slug, null, party.editionSlug || null);
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
  const friendsBox = document.getElementById("create-party-friends");
  const submit = document.getElementById("btn-create-party-submit");
  const msg = document.getElementById("create-party-message");
  const nameInput = document.getElementById("create-party-name");
  const closeBtn = document.getElementById("btn-create-party-close");
  if (!friendsBox || !submit) return;

  if (closeBtn) {
    closeBtn.onclick = () => {
      document.getElementById("create-party-panel").style.display = "none";
    };
  }

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

  if (visSelect) enhanceSelect(visSelect);
  visSelect?._syncCustomSelect?.();

  const friends = state._createPartyFriends || [];
  friendsBox.innerHTML =
    friends.length === 0
      ? `<p class="create-party-empty-friends">Add friends to invite them.</p>`
      : friends
          .map(
            (f) => `
        <label class="create-party-friend-row">
          <input type="checkbox" class="create-party-friend create-party-checkbox" value="${escapeHtml(f.id)}" />
          <span class="create-party-friend-name">${escapeHtml(f.username)}</span>
        </label>`
          )
          .join("");

  submit.onclick = async () => {
    const name = nameInput?.value?.trim() || "";
    const visibility = document.getElementById("create-party-visibility")?.value || "friends";
    const password = document.getElementById("create-party-password")?.value?.trim() || "";
    const wantVoice = document.getElementById("create-party-voice")?.checked !== false;
    const friendIds = [...friendsBox.querySelectorAll(".create-party-friend:checked")].map((el) => el.value);
    if (visibility === "password" && password.length < 4) {
      if (msg) {
        msg.textContent = "Password must be at least 4 characters.";
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
        gameSlug: null,
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
      if (nameInput) nameInput.value = "";

      /*
       * Provision the voice channel when it was asked for, but do not open
       * Discord. Creating a party threw the player straight into a chat app
       * before they had done anything with the party, which is not what
       * ticking "voice channel" asked for — it asked for the channel to exist.
       * Launch Voice in the party window is the deliberate act of joining it.
       */
      if (wantVoice) {
        submit.textContent = "Starting voice…";
        const voice = await window.playbound.provisionPartyDiscord(res.party.id);
        if (voice?.error && !voice?.inviteUrl) setStatus(voice.error, true);
        else setStatus("Party created — voice channel ready. Use Launch Voice to join it.");
      }
      const slot = document.getElementById("friends-party-area");
      if (slot) slot.dataset.sig = "";
      api.refreshFriendsData();
    } catch (err) {
      if (msg) {
        msg.textContent = err.message || "Couldn't create party.";
        msg.style.display = "block";
      }
    } finally {
      submit.disabled = false;
      submit.textContent = "Create Party";
    }
  };
}

function openPartyVoice(inviteUrl) {
  if (!inviteUrl) return;
  // Desktop Discord first — openExternal would always land in web Discord.
  void (window.playbound.openDiscordInvite?.(inviteUrl) ??
    window.playbound.openExternal(inviteUrl));
  setStatus("Opening party voice…");
}

function handlePartyVoice(res) {
  const inviteUrl = res?.inviteUrl || res?.party?.discord?.inviteUrl || null;
  if (res?.needsDiscordLink) {
    showDiscordLinkPrompt(inviteUrl);
    return;
  }
  openPartyVoice(inviteUrl);
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
    openPartyVoice(inviteUrl);
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

