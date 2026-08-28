import { createFreeOfferCard, createGameCard } from "../cards.js";
import { maybeOfferPhoneControllerThenPlay } from "../phoneController.js";
import {
  api,
  buildActivityPanelHtml,
  editionsContextSlug,
  enhanceSelect,
  escapeHtml,
  executableNoun,
  filterByDiscovery,
  filterByCompatibility,
  filterCatalogGames,
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
let friendsPollMs = 5000;
let localPlaying = false;
let playPollWired = false;

const FRIENDS_POLL_MS = 5000;
const LIVE_PARTY_POLL_MS = 3000;

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
          <button class="btn-secondary friends-action-btn" id="btn-friends-popout" title="Open friends list in a separate window">Pop out</button>
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
    document.getElementById("btn-friends-popout")?.addEventListener("click", () => {
      void window.playbound.openFriendsPopout?.();
    });
    // One library sync when the Friends shell first mounts — not on every remount/poll.
    if (window.playbound.syncLibraryNow) void window.playbound.syncLibraryNow({ quiet: true });
  }

  await ensurePartyGames();
  // Opening the view is a deliberate look at it, so the events strip re-reads.
  upcomingEventsCache = { at: 0, data: upcomingEventsCache.data };
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
    const inLiveParty = Boolean(state._activeParty && state._activeParty.status !== "ended");
    if ((state.currentView === "friends" || inLiveParty) && state.accountState.connected) {
      void pollFriendsData();
    } else {
      clearInterval(friendsPollInterval);
      friendsPollInterval = null;
    }
  }, friendsPollMs);
}

/*
 * A tick that lands while the previous one is still open is dropped.
 *
 * A live party polls every 3s and each pass is several requests; on a slow
 * connection they overlapped and queued, so the panel fell further behind the
 * longer it stayed open. Only the poll goes through here — the mutation paths
 * call refreshFriendsData directly because they have to see their own write.
 */
let friendsPollInFlight = null;

function pollFriendsData() {
  if (friendsPollInFlight) return friendsPollInFlight;
  friendsPollInFlight = Promise.resolve(api.refreshFriendsData()).finally(() => {
    friendsPollInFlight = null;
  });
  return friendsPollInFlight;
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
  window.playbound.onGameExited?.((data) => {
    void refreshLocalPlaying();
    if (data?.slug) void notifyPartyGameClosed(data.slug);
  });
}

/** Tell the server the local game closed; retry until presence catches up. */
async function notifyPartyGameClosed(slug) {
  const party = state._activeParty;
  if (!party?.id || party.gameSlug !== slug) return;
  if (party.status !== "playing" && party.status !== "launching") return;
  if (!window.playbound.exitPartyGame) return;

  for (const delay of [0, 2500, 6000]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const res = await window.playbound.exitPartyGame(party.id);
    const status = res?.party?.status;
    if (status && status !== "playing" && status !== "launching") break;
  }
  const areaSlot = document.getElementById("friends-party-area");
  if (areaSlot) areaSlot.dataset.sig = "";
  void api.refreshFriendsData();
}

/** Ensure myParties matches viewer membership; one refetch on transient drift. */
async function reconcilePartiesPayload(partiesData, retried = false) {
  if (!partiesData || partiesData.error) return partiesData;

  if (!state.accountState?.userId && window.playbound.getAccount) {
    try {
      const acc = await window.playbound.getAccount();
      if (acc) state.accountState = { ...state.accountState, ...acc };
    } catch {
      /* ignore */
    }
  }

  const userId = state.accountState?.userId;
  const mine = Array.isArray(partiesData.myParties) ? partiesData.myParties : [];
  const active = mine[0] || null;

  if (userId && active) {
    const inRoster = (active.members || []).some((m) => String(m.userId) === String(userId));
    if (!inRoster && !retried && window.playbound.getParties) {
      console.warn("[friends] myParties roster missing viewer — refetching parties");
      const retry = await window.playbound.getParties();
      return reconcilePartiesPayload(retry, true);
    }
  }

  if (!active && userId) {
    const discoverable = Array.isArray(partiesData.discoverable) ? partiesData.discoverable : [];
    const joined = discoverable.find((p) =>
      (p.members || []).some((m) => String(m.userId) === String(userId))
    );
    if (joined) {
      return { ...partiesData, myParties: [joined] };
    }
  }

  return partiesData;
}

/*
 * Friends' joinable parties, on their own cadence.
 *
 * The party payload has to stay current to the second while a lobby is live;
 * the discoverable list beside it costs more to compute than the party itself
 * and nobody minds it being a few seconds behind. Asking for it less often is
 * the difference, and the last one stays on screen in between.
 */
const DISCOVERABLE_MIN_MS = 8000;
let lastDiscoverableAt = 0;
let lastDiscoverable = [];

async function loadParties() {
  if (!window.playbound.getParties) return null;
  const includeDiscoverable = Date.now() - lastDiscoverableAt >= DISCOVERABLE_MIN_MS;
  if (includeDiscoverable) lastDiscoverableAt = Date.now();
  const data = await window.playbound.getParties(
    includeDiscoverable ? undefined : { includeDiscoverable: false }
  );
  if (!data || data.error) return data;
  if (Array.isArray(data.discoverable)) {
    lastDiscoverable = data.discoverable;
    return data;
  }
  return { ...data, discoverable: lastDiscoverable };
}

/*
 * Scheduled events do not change on a party's cadence.
 *
 * A live party polls this view every 3s, and the events feed was one of the
 * four requests each pass — for a list of things happening hours from now. It
 * gets its own interval, and the party payload keeps the fast lane.
 */
const UPCOMING_EVENTS_TTL_MS = 60_000;
let upcomingEventsCache = { at: 0, data: { events: [] } };

async function loadUpcomingEvents() {
  if (!window.playbound.getFriendsUpcomingEvents) return { events: [] };
  if (Date.now() - upcomingEventsCache.at < UPCOMING_EVENTS_TTL_MS) {
    return upcomingEventsCache.data;
  }
  // Stamped before the await so a slow request cannot stack up behind itself.
  upcomingEventsCache = { at: Date.now(), data: upcomingEventsCache.data };
  const data = await window.playbound
    .getFriendsUpcomingEvents()
    .catch(() => upcomingEventsCache.data);
  upcomingEventsCache = { at: Date.now(), data: data || { events: [] } };
  return upcomingEventsCache.data;
}

async function refreshFriendsData() {
  const content = document.getElementById("friends-content-area");
  if (!content) return;

  try {
    await ensurePartyGames();
    const [friendsData, requestsData, partiesRaw, upcomingEventsData] = await Promise.all([
      window.playbound.getFriends(),
      window.playbound.getFriendRequests(),
      loadParties(),
      loadUpcomingEvents(),
    ]);
    const partiesData = await reconcilePartiesPayload(partiesRaw);
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

    const contentSig = JSON.stringify([
      onlineAll.map((f) => [
        f.id,
        f.username,
        f.presence?.status,
        f.presence?.currentGameId,
        f.presence?.currentPartyId,
        f.presence?.lookingForPlayers,
        f.join?.capability,
        f.discordLinked,
      ]),
      offline.map((f) => [f.id, f.username]),
      incomingRequests.map((r) => [r.id, r.user?.username]),
      outgoingRequests.map((r) => [r.id, r.user?.username]),
      upcomingEvents.map((e) => [e.id, e.title, e.friendCount]),
    ]);

    if (content.dataset.sig !== contentSig) {
      content.dataset.sig = contentSig;
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
          api.refreshFriendsData();
        });
      });
    }

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
let createPartyInFlight = false;

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
  const gamesList = filterCatalogGames(Array.isArray(catalog) ? catalog : catalog?.games || []);
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
  lock: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  refresh: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
};

/**
 * Catalog used to populate the party game picker. The website's friends page
 * lists the entire catalog (see app/friends/page.tsx), so this does too rather
 * than pre-filtering to multiplayer titles.
 */
let partyGamesCache = null;
let partyGamesCacheKey = null;
/** Blocks poll repaints from undoing an in-flight party game pick. */
let partyMutationInFlight = 0;

async function ensurePartyGames() {
  const cacheKey = `${state.compatibilityFilter || "compatible"}:${state.discoveryMode || "all"}`;
  if (partyGamesCache && partyGamesCacheKey === cacheKey) return partyGamesCache;
  const catalog = state.catalogCache?.length
    ? state.catalogCache
    : await window.playbound.getCatalog().catch(() => []);
  const games = (Array.isArray(catalog) ? catalog : catalog?.games || []).filter((g) => g?.slug);
  partyGamesCache = games
    /*
     * Multiplayer only. The picker listed the whole catalog, so a leader could
     * set a party to a singleplayer game — which then could never launch as a
     * party. Uses the catalog's own flag, the same one the Games view filters
     * on, rather than a second opinion about what counts as multiplayer.
     *
     * A party already pointing at something excluded here stays selectable:
     * partyGameOptionsHtml appends the current slug when the list lacks it.
     */
    .filter((g) => g.isMultiplayer ?? g.multiplayer ?? false)
    .filter((g) => g.kind !== "external")
    .filter((g) => filterByCompatibility([g]).length > 0)
    .map((g) => ({ slug: g.slug, title: g.title || g.slug, kind: g.kind, url: g.url }))
    .sort((a, b) => a.title.localeCompare(b.title));
  partyGamesCacheKey = cacheKey;
  return partyGamesCache;
}

/**
 * Does every member's platform support this game?
 *
 * requiredPlatforms comes from the server, derived from each member's
 * presence, so the site and the launcher cannot disagree about what a mixed
 * party can play. Empty means nobody's OS is known and nothing is constrained.
 *
 * Browser games and games with no platforms listed both pass. The second is
 * missing data rather than a statement of incompatibility, and hiding a game
 * because its catalog entry is thin looks to the leader like it left the
 * catalog entirely.
 */
function partyCanAllPlay(game, requiredPlatforms) {
  if (!requiredPlatforms?.length) return true;
  if (game.browserPlayable) return true;
  const supported = new Set(
    (game.platforms || []).map((p) => String(p || "").trim().toLowerCase())
  );
  if (supported.size === 0 || supported.has("web")) return true;
  return requiredPlatforms.every((p) => supported.has(p));
}

function partyGameOptionsHtml(selectedSlug, party) {
  const required = Array.isArray(party?.requiredPlatforms) ? party.requiredPlatforms : [];
  const games = filterByDiscovery(partyGamesCache || []).filter((g) =>
    partyCanAllPlay(g, required)
  );
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
  const isLeader = String(party.leaderId) === String(userId);
  const hosted = party.hosted || {};
  const hostedReady = hosted.status === "ready" && hosted.host && hosted.port;
  const lan = party.lan || {};
  const isPeerOrLan = !hosted.enabled || lan.enabled;
  const waitingForLeader = !isLeader && !inFlight && isPeerOrLan;
  const canJoinGame = hasGame && !ended && (isReady || inFlight);
  /*
   * Join stays clickable once you're ready — join-game provisions the server
   * and returns a clear wait/error if connect isn't up yet. Disabling while
   * status is none/pending left the button dead after ready-up when the UI
   * didn't repaint or provisioning hadn't finished.
   */
  const joinConnectFailed =
    !inFlight &&
    ((hosted.enabled && hosted.status === "failed") || (lan.enabled && lan.status === "failed"));
  const joinDisabled = joinConnectFailed || waitingForLeader;
  const voiceEnabled = party.voiceEnabled !== false;
  const hasDiscordVoice = Boolean(party.discord?.inviteUrl || party.discord?.voiceChannelId);
  const showLaunchVoice = voiceEnabled || hasDiscordVoice;

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
  /*
   * Say why the list is shorter than the catalog. A mixed-platform party
   * silently dropping games reads as games having disappeared, and the leader
   * has no way to guess that a member's OS is the reason.
   */
  const requiredPlatformLabels = (party.requiredPlatforms || []).map(
    (p) => ({ windows: "Windows", macos: "macOS", linux: "Linux" })[p] || p
  );
  const platformNoteHtml =
    isLeader && !ended && requiredPlatformLabels.length > 1
      ? `<p class="party-game-platform-note">Showing games that run on ${escapeHtml(
          requiredPlatformLabels.join(" and ")
        )} — everyone in this party has to be able to play.</p>`
      : "";

  const openRaModHtml =
    party.gameSlug === "openra"
      ? isLeader && !ended
        ? `<div class="party-field-group" style="margin-top: 8px;">
             <label class="party-field-label" for="party-openra-mod-select">OpenRA Mod / Game</label>
             <select class="input-text party-openra-mod-select" id="party-openra-mod-select" aria-label="OpenRA Mod">
               <option value=""${!party.openRaMod || party.openRaMod === "ra" ? " selected" : ""}>Red Alert (default)</option>
               <option value="cnc"${party.openRaMod === "cnc" ? " selected" : ""}>Tiberian Dawn</option>
               <option value="d2k"${party.openRaMod === "d2k" ? " selected" : ""}>Dune 2000</option>
               <option value="ts"${party.openRaMod === "ts" ? " selected" : ""}>Tiberian Sun</option>
             </select>
           </div>`
        : `<p class="party-game-platform-note" style="margin-top: 4px;">Game: ${escapeHtml(
            party.openRaMod === "cnc"
              ? "Tiberian Dawn"
              : party.openRaMod === "d2k"
              ? "Dune 2000"
              : party.openRaMod === "ts"
              ? "Tiberian Sun"
              : "Red Alert (default)"
          )}</p>`
      : "";

  const gameHtml = isLeader && !ended
    ? `<label class="party-field-label" for="party-game-select">Game</label>
       <select class="input-text party-game-select" id="party-game-select" aria-label="Party game">
         ${partyGameOptionsHtml(party.gameSlug || "", party)}
       </select>${openRaModHtml}${platformNoteHtml}`
    : hasGame
    ? `<p class="party-field-label">Game</p>
       <p class="party-game-label">${escapeHtml(party.gameTitle || party.gameSlug)}</p>${openRaModHtml}${
        Array.isArray(party.hostModes) && party.hostModes.length > 1
          ? `<p class="party-game-platform-note">Host: ${escapeHtml(
              party.hostModes.find((o) => o.mode === party.hostMode)?.label ||
                (party.hostMode === "self"
                  ? "Host PC"
                  : party.hostMode === "public"
                    ? "Public server"
                    : "PlayBound server")
            )}</p>`
          : ""
      }`
    : `<p class="party-member-sub">The leader hasn't picked a game yet.</p>`;

  const onlineCountHtml = hasGame
    ? `<p class="party-online-count" data-slug="${escapeHtml(party.gameSlug)}"${
        party.hostMode === "public" ? " hidden" : ""
      }></p>`
    : "";
  /*
   * Ready-up comes first, and the picker says which step it is waiting on.
   * The server is the last thing settled before Join Game, so an inert list
   * with the reason beside it reads as an order to follow; a live one beside
   * the game select read as an optional detail.
   */
  const publicGate = !isLeader
    ? "leader"
    : ended || inFlight
    ? "locked"
    : !isReady
    ? "ready"
    : "";
  const publicPicked = party.publicServer || null;
  const publicServerHtml =
    party.hostMode === "public" && hasGame
      ? `<div class="party-public-server" id="party-public-server"
           data-party-id="${escapeHtml(party.id)}"
           data-slug="${escapeHtml(party.gameSlug)}"
           data-can-pick="${publicGate ? "0" : "1"}"
           data-gate="${publicGate}"
           data-selected-id="${escapeHtml(publicPicked?.id || "")}"
           data-selected-host="${escapeHtml(publicPicked?.host || hosted.host || "")}"
           data-selected-port="${escapeHtml(String(publicPicked?.port || hosted.port || ""))}"
           data-selected-name="${escapeHtml(publicPicked?.name || hosted.name || "")}"></div>`
      : "";

  const hostModes = Array.isArray(party.hostModes) ? party.hostModes : [];
  const canPickHost = isLeader && !ended && hostModes.length > 1 && !party.hosted?.roomCode;
  const hostModeHtml = canPickHost
    ? `<div class="party-field-group">
         <label class="party-field-label" for="party-hostmode-select">Server Hosting</label>
         <select class="input-text party-hostmode-select" id="party-hostmode-select" aria-label="Server Hosting">
           ${hostModes
             .map(
               (o) =>
                 `<option value="${escapeHtml(o.mode)}"${party.hostMode === o.mode ? " selected" : ""}>${escapeHtml(
                   o.label
                 )}</option>`
             )
             .join("")}
         </select>
       </div>`
    : "";

  const visibilityHtml =
    isLeader && !ended
      ? `<div class="party-field-group">
           <label class="party-field-label" for="party-visibility-select">Who Can Play</label>
           <select class="input-text party-visibility-select" id="party-visibility-select" aria-label="Who Can Play">
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

  const joinButtonText = isLeader && !inFlight ? "Start Game" : waitingForLeader ? "Waiting for Host…" : "Join Game";
  const joinButtonIcon = waitingForLeader ? ICON.loader : ICON.play;
  const joinTitle = waitingForLeader
    ? "The party host must start the game first"
    : hosted.status === "failed" || lan.status === "failed"
    ? hosted.error || lan.error || "Could not start the party connection"
    : hosted.status === "pending" || lan.status === "pending"
    ? "Server is starting — click to join when ready"
    : "";

  const joinGameHtml = canJoinGame
    ? `<div class="party-join-wrap">
         <button type="button" id="btn-party-join-game" class="party-btn btn-primary"${
           joinDisabled ? ` disabled` : ""
         }${joinTitle ? ` title="${escapeHtml(joinTitle)}"` : ""}>${joinButtonIcon} ${escapeHtml(joinButtonText)}</button>
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
    party.hostMode === "public" && hosted.enabled && hosted.status !== "ready"
      ? `<p class="view-sub party-inline-note">Now pick a server under <strong>Public server</strong> above.</p>`
      : hosted.enabled && hosted.status === "pending"
      ? `<p class="view-sub party-inline-note">Starting PlayBound server…</p>`
      : hosted.enabled && hosted.status === "failed"
      ? `<p class="party-inline-note party-hosted-error">${escapeHtml(
          hosted.error || "Could not start the PlayBound server."
        )}</p>`
      : "";

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
  const hostedStepsHtml =
    hosted.enabled && Array.isArray(hosted.steps) && hosted.steps.length
      ? `<ol class="party-lan-steps party-hosted-steps">${hosted.steps
          .map((s) => `<li>${escapeHtml(String(s))}</li>`)
          .join("")}</ol>`
      : "";

  const playingPillHtml =
    party.status === "playing" && !canJoinGame
      ? `<div class="party-playing-pill">${ICON.play} Playing</div>`
      : "";

  const voiceHtml = showLaunchVoice
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
          <div class="party-header-top">
            <div class="party-header-main">
              ${titleHtml}
              <p class="party-meta">
                <span>${escapeHtml(partyStatusLabel(party.status))}</span>
                <span>·</span>
                <span class="party-meta-count">${ICON.users} ${(party.members || []).length} / ${
                  party.maxSize || 8
                }</span>
              </p>
            </div>
            <div class="party-header-controls">
              ${hostModeHtml}
              ${visibilityHtml}
            </div>
          </div>
          <div class="party-header-grid">
            <div class="party-header-game">
              ${gameHtml}
              ${onlineCountHtml}
            </div>
            <div class="party-header-status">
              ${buildPartyConfigSyncHtml(party, userId)}
            </div>
          </div>
          ${publicServerHtml ? `<div class="party-header-public">${publicServerHtml}</div>` : ""}
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
          ${hostedStepsHtml}
          <p class="party-voice-error" id="party-voice-error" style="display: none;"></p>
        </div>

        ${buildPartyChatHtml(party)}
      </div>
    </div>
  `;
}

function installHref(gameSlug, editionSlug, mods) {
  const q = new URLSearchParams();
  if (editionSlug && editionSlug !== "__base__") q.set("edition", editionSlug);
  for (const mod of mods || []) q.append("mod", mod);
  q.set("return", "friends");
  return `playbound://install/${gameSlug}?${q.toString()}`;
}

function markPartyInstallReturn(gameSlug) {
  state.returnToFriendsParty = true;
  state.partyInstallReturnSlug = gameSlug || null;
}

function missingSummary(m, editionSlug) {
  const out = [];
  if (!m.hasGame) out.push("the game");
  else if (editionSlug && !m.hasEdition) out.push("a different edition");
  if ((m.missingMods || []).length) {
    const labels = m.missingMods.slice(0, 3).join(", ");
    const extra = m.missingMods.length > 3 ? ` +${m.missingMods.length - 3} more` : "";
    out.push(`${m.missingMods.length} mod${m.missingMods.length === 1 ? "" : "s"} (${labels}${extra})`);
  }
  return out;
}

function buildPartyConfigSyncHtml(party, userId) {
  const sync = party.configSync;
  if (!party.gameSlug) return "";
  if (!sync) {
    return `<div class="party-sync-card party-sync-pending"><p class="party-member-sub">Checking who has the game…</p></div>`;
  }
  const isYouHost = Boolean(userId) && String(sync.hostUserId) === String(userId);
  const readiness = party.readiness || null;
  // `allInSync` is the current name; `allReady` is the wire-compatible alias a
  // server older than this build still sends.
  const inSync = sync.allInSync !== undefined ? sync.allInSync : sync.allReady;
  if (inSync) {
    /*
     * Headline is the server's, so this card and the website's cannot disagree
     * — the two panels are separately written and had already drifted. It also
     * keeps "everyone has the files" distinct from "everyone pressed Ready Up",
     * which is what made this card contradict the member list above it.
     */
    const headline = readiness?.headline || "Everyone has the right version";
    const matchLine =
      sync.referenceSource === "host"
        ? isYouHost
          ? "Every member matches your setup."
          : sync.hostUsername
          ? `Every member matches ${sync.hostUsername}'s setup.`
          : "All members have the required game and editions installed."
        : "All members have the required game and editions installed.";
    const waiting =
      readiness && readiness.phase === "waiting_ready"
        ? `<p class="party-member-sub">${escapeHtml(readiness.detail)}</p>`
        : "";
    return `<div class="party-sync-card party-sync-ready">
      <span class="party-sync-icon">${ICON.check}</span>
      <div>
        <h4 class="party-sync-title">${escapeHtml(headline)}</h4>
        <p class="party-member-sub">${escapeHtml(matchLine)}</p>
        ${waiting}
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
      : null) ||
    (party.editionSlug && party.editionSlug !== "__base__" ? party.editionSlug : null);
  const href = installHref(party.gameSlug, installEdition, sync.modSlugs || []);
  const installLabel = sync.editionName
    ? `Install ${sync.editionName}`
    : installEdition
    ? "Install required edition"
    : "Install the game";

  const rows = out
    .map((m) => {
      const missing = missingSummary(m, sync.editionSlug);
      const isYou = String(m.userId) === String(userId);
      const showInstall = isYou;
      const showEditionPicker =
        showInstall && !m.hasGame && sync.referenceSource === "party" && !installEdition;
      return `<li class="party-sync-row">
        <div class="party-sync-row-main">
          <div class="party-member-avatar">${escapeHtml((m.username || "?").charAt(0).toUpperCase())}</div>
          <span class="party-sync-who">${escapeHtml(isYou ? "You" : m.username)}</span>
          <span class="party-member-sub">${escapeHtml(
            isYou ? `need ${missing.join(" and ")}` : `needs ${missing.join(" and ")} — they can install it from their party panel`
          )}</span>
        </div>
        ${
          showEditionPicker
            ? `<div class="party-edition-picker" data-party-id="${escapeHtml(party.id)}" data-game-slug="${escapeHtml(
                party.gameSlug
              )}" data-can-set="${isYouHost ? "1" : "0"}"><span class="party-member-sub">Loading editions…</span></div>`
            : showInstall
            ? `<button type="button" class="party-sync-install btn-party-install" data-href="${escapeHtml(
                href
              )}">${ICON.download} ${escapeHtml(installLabel)}</button>`
            : ""
        }
      </li>`;
    })
    .join("");

  const intro = hostHasGame
    ? isYouHost
      ? "This party is playing your setup. Anyone who doesn't have it yet can install it from their own party panel."
      : sync.hostUsername
      ? `This party is playing ${sync.hostUsername}'s setup. Anyone who doesn't have it yet can install it from their own party panel.`
      : "Some members are missing files this party needs. They won't be able to launch with the party until they install them."
    : "Some members are missing files this party needs. They won't be able to launch with the party until they install them.";

  return `<div class="party-sync-card party-sync-blocked">
    <div class="party-sync-blocked-head">Not everyone can play yet</div>
    <p class="party-member-sub">${escapeHtml(intro)}</p>
    <ul class="party-sync-list">${rows}</ul>
  </div>`;
}

let partyChatTimer = null;

function buildPartyChatHtml(party) {
  const hasDiscord = Boolean(party.discord?.textChannelId);
  return `
    <div class="party-chat" id="party-chat">
      <div class="party-chat-header">
        <h4 class="party-chat-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Party Chat
        </h4>
        <span class="party-chat-badge">${hasDiscord ? "Synced with Discord" : "In-App Chat"}</span>
      </div>
      <div class="party-chat-list" id="party-chat-list" data-party="${escapeHtml(party.id || "")}">
        <p class="view-sub party-chat-empty">Loading chat…</p>
      </div>
      <form class="party-chat-form" id="party-chat-form">
        <input type="text" class="party-chat-input" id="party-chat-input" maxlength="500" placeholder="Message the party…" autocomplete="off" />
        <button type="submit" class="party-chat-send" id="party-chat-send" aria-label="Send">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>
    </div>
  `;
}

async function refreshPartyChat(party) {
  const list = document.getElementById("party-chat-list");
  if (!list || !party?.id) return;
  if (!window.playbound.getPartyChat) return;
  try {
    const data = await window.playbound.getPartyChat(party.id);
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    if (!messages.length) {
      if (!list.querySelector(".party-chat-empty")) {
        list.innerHTML = `<p class="view-sub party-chat-empty">No messages yet. Say something to the party.</p>`;
      }
      return;
    }
    const html = messages
      .map((m) => {
        const time = m.createdAt
          ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "";
        return `
          <div class="party-chat-msg">
            <div class="party-chat-meta">
              <span class="party-chat-author">${escapeHtml(m.username || "Player")}</span>
              <span class="party-chat-time">${escapeHtml(time)}</span>
            </div>
            <div class="party-chat-content">${escapeHtml(m.content || "")}</div>
          </div>
        `;
      })
      .join("");
    
    if (list.dataset.msgCount !== String(messages.length)) {
      list.dataset.msgCount = String(messages.length);
      list.innerHTML = html;
      list.scrollTop = list.scrollHeight;
    }
  } catch (err) {
    console.warn("refreshPartyChat error:", err);
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

function editionSupportsPartyPlay(ed) {
  const feat = (ed.features || ed.editionFeatures || []).map((f) => String(f).toLowerCase());
  return feat.some((f) => /multi[-\s]?player/.test(f));
}

async function fillPartyEditionPickers(slot, party) {
  const pickers = slot.querySelectorAll(".party-edition-picker");
  if (!pickers.length || !window.playbound.getEditions) return;

  for (const el of pickers) {
    const gameSlug = el.dataset.gameSlug;
    const partyId = el.dataset.partyId;
    const canSet = el.dataset.canSet === "1";
    if (!gameSlug) continue;
    try {
      const res = await window.playbound.getEditions(gameSlug);
      const all = Array.isArray(res?.editions) ? res.editions : [];
      const partyPlay = all.filter(editionSupportsPartyPlay);
      const list = partyPlay.length > 0 ? partyPlay : all;
      if (!list.length) {
        el.innerHTML = `<span class="party-member-sub">No installable editions found.</span>`;
        continue;
      }
      el.innerHTML = `
        <p class="party-member-sub" style="margin:0 0 6px">Pick a multiplayer version:</p>
        <div class="party-edition-picker-list">
          ${list
            .map((ed) => {
              const slug = ed.editionSlug || ed.slug;
              const name = ed.editionName || ed.name || slug;
              const href = installHref(gameSlug, slug, []);
              return `<button type="button" class="party-sync-install btn-party-install party-edition-pick-btn" data-href="${escapeHtml(
                href
              )}" data-edition="${escapeHtml(slug)}" data-party-id="${escapeHtml(
                partyId
              )}" data-can-set="${canSet ? "1" : "0"}">${ICON.download} ${escapeHtml(name)}</button>`;
            })
            .join("")}
        </div>
      `;
      el.querySelectorAll(".party-edition-pick-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const edition = btn.dataset.edition;
          if (btn.dataset.canSet === "1" && edition && window.playbound.setPartyEdition) {
            await window.playbound.setPartyEdition(partyId, edition);
          }
          const href = btn.dataset.href;
          if (href && window.playbound.openDeepLink) {
            markPartyInstallReturn(gameSlug);
            void window.playbound.openDeepLink(href);
          }
          void api.refreshFriendsData();
        });
      });
    } catch (err) {
      console.warn("fillPartyEditionPickers:", err);
      el.innerHTML = `<span class="party-member-sub">Couldn't load editions.</span>`;
    }
  }
}

/*
 * One server list per game, shared by the count and the picker.
 *
 * The site's servers endpoint is CDN-cached for 30s, so asking more often than
 * that cannot return anything new. `inFlight` matters because the count and
 * the picker fill in the same tick after a repaint — without it, one repaint
 * meant two identical requests.
 */
const partyServersCache = new Map();
const partyServersInFlight = new Map();
const PARTY_SERVERS_TTL_MS = 30_000;

async function loadPartyServers(slug, force) {
  if (!slug) return { servers: [] };
  const cached = partyServersCache.get(slug);
  if (!force && cached && Date.now() - cached.at < PARTY_SERVERS_TTL_MS) return cached.data;
  const pending = partyServersInFlight.get(slug);
  if (pending) return pending;

  const run = window.playbound
    .getServers(slug)
    // Keep the last good list rather than blanking a picker mid-scroll.
    .catch(() => cached?.data ?? { servers: [] })
    .then((data) => {
      partyServersCache.set(slug, { at: Date.now(), data });
      return data;
    })
    .finally(() => partyServersInFlight.delete(slug));
  partyServersInFlight.set(slug, run);
  return run;
}

function formatPartyPlayerCount(n) {
  try {
    return Number(n).toLocaleString();
  } catch {
    return String(n);
  }
}

function partyServerLocation(server) {
  const loc = server?.location;
  if (!loc) return "";
  if (loc.region && loc.region.length > 2) return loc.region;
  const code = String(loc.countryCode || "").toUpperCase();
  if (code && code !== "ZZ" && code !== "XX") return code;
  return "";
}

async function fillPartyOnlineCount(slot, force = false) {
  const el = slot.querySelector(".party-online-count");
  if (!el || el.hidden) return;
  const slug = el.dataset.slug;
  if (!slug) return;
  try {
    const data = await loadPartyServers(slug, force);
    const servers = Array.isArray(data?.servers) ? data.servers : [];
    const players = servers.reduce((n, s) => n + (Number(s.players) || 0), 0);
    const text =
      !players && servers.every((s) => s.players == null)
        ? ""
        : `${formatPartyPlayerCount(players)} playing online`;
    if (el.textContent !== text) el.textContent = text;
  } catch {
    el.textContent = "";
  }
}

const partyServerPings = new Map();

function partyServerPingBadge(ping) {
  if (ping == null) return `<span class="party-server-ping ping-unknown" title="Ping probing…">⚡ —</span>`;
  const pingNum = Number(ping);
  const cls = pingNum < 65 ? "ping-fast" : pingNum < 140 ? "ping-medium" : "ping-slow";
  const icon = pingNum < 65 ? "🟢" : pingNum < 140 ? "🟡" : "🔴";
  return `<span class="party-server-ping ${cls}" title="${pingNum}ms latency">${icon} ${pingNum}ms</span>`;
}

function partyServerRowHtml(server, { canPick, selectedId, selectedHost, selectedPort }) {
  const id = server.id || `${server.host}:${server.port}`;
  const selected =
    (selectedId && selectedId === id) ||
    (selectedHost === server.host && String(selectedPort) === String(server.port));
  const label = server.name || `${server.host}:${server.port}`;
  const loc = partyServerLocation(server);
  const count =
    server.players == null
      ? "—"
      : `${server.players}${server.maxPlayers ? `/${server.maxPlayers}` : ""}`;
  const ping = partyServerPings.get(id) ?? server.ping ?? null;

  return `<button type="button" class="party-public-server-row${selected ? " is-selected" : ""}"${
    canPick ? "" : " disabled"
  } data-id="${escapeHtml(id)}" data-host="${escapeHtml(server.host)}" data-port="${
    Number(server.port) || 0
  }" data-name="${escapeHtml(label)}" data-mod="${escapeHtml(
    server.mod || ""
  )}" data-protected="${server.protected ? "1" : "0"}">
    <div class="party-server-card-top">
      <div class="party-server-name-wrap">
        ${server.protected ? `<span class="party-server-lock" title="Password Protected">${ICON.lock}</span>` : ""}
        <span class="party-server-name">${escapeHtml(label)}</span>
      </div>
      <div class="party-server-metrics">
        ${partyServerPingBadge(ping)}
        <span class="party-server-players-pill" title="Active Players / Max">${ICON.users} <strong>${escapeHtml(count)}</strong></span>
      </div>
    </div>
    <div class="party-server-chips">
      ${server.map ? `<span class="party-server-chip chip-map" title="Map">🗺️ <span>${escapeHtml(server.map)}</span></span>` : ""}
      ${server.gameType ? `<span class="party-server-chip chip-mode" title="Game Mode">⚔️ <span>${escapeHtml(server.gameType)}</span></span>` : ""}
      ${loc ? `<span class="party-server-chip chip-loc" title="Server Region">📍 <span>${escapeHtml(loc)}</span></span>` : ""}
      <span class="party-server-chip chip-addr" title="Server Host:Port">🌐 <code>${escapeHtml(server.host)}:${escapeHtml(String(server.port))}</code></span>
    </div>
  </button>`;
}

/**
 * Fill (or update) the public-server picker.
 *
 * The party card repaints for reasons that have nothing to do with servers, so
 * rewriting the list every time would throw away the user's scroll position
 * mid-pick. Rows are written only when they actually differ, and clicks are
 * handled by one delegated listener on the container instead of one per row.
 * Counts change only when the refresh button beside the list is pressed.
 *
 * The list itself is only built for someone who could act on it: a member, or
 * a party mid-game, sees the pick and the reason it is theirs to make or not.
 */
async function fillPartyPublicServerPicker(slot, force = false) {
  const el = slot.querySelector("#party-public-server");
  if (!el) return;
  const slug = el.dataset.slug;
  const canPick = el.dataset.canPick === "1";
  const gate = el.dataset.gate || "";
  const selectedId = el.dataset.selectedId || "";
  const selectedHost = el.dataset.selectedHost || "";
  const selectedPort = el.dataset.selectedPort || "";
  const selectedName = el.dataset.selectedName || "";
  /*
   * A member, or a party already in a game, gets the pick and nothing else —
   * a list of servers they cannot choose from is noise, and skipping it skips
   * the request behind it.
   */
  const showList = gate === "" || gate === "ready";
  const picked =
    selectedName || (selectedHost && selectedPort ? `${selectedHost}:${selectedPort}` : "");
  const gateNote =
    gate === "leader"
      ? picked
        ? ""
        : "Your party leader picks the server — you'll join whatever they choose."
      : gate === "locked"
      ? "Locked while the party is in a game."
      : gate === "ready"
      ? "Ready up first. Choosing the server is the last step before Join Game."
      : "";
  if (!el.dataset.shell) {
    el.innerHTML = `
      <div class="party-public-server-head">
        <div>
          <p class="party-field-label">Public server</p>
          ${
            picked
              ? `<p class="party-public-server-picked">${escapeHtml(picked)}${
                  selectedHost && selectedPort
                    ? ` <span class="party-public-server-addr">${escapeHtml(
                        selectedHost
                      )}:${escapeHtml(String(selectedPort))}</span>`
                    : ""
                }</p>`
              : `<p class="party-member-sub">${
                  canPick
                    ? "Choose where the party plays, then hit Join Game."
                    : "No server chosen yet."
                }</p>`
          }
        </div>
        ${
          showList
            ? `<div class="party-public-server-head-actions">
                 <span class="party-member-sub party-public-server-summary">Loading servers…</span>
                 <button type="button" class="party-icon-btn party-public-server-refresh" title="Refresh">${ICON.refresh}</button>
               </div>`
            : ""
        }
      </div>
      ${
        gateNote
          ? `<div class="party-public-server-gate${gate === "ready" ? " is-next" : ""}">
               <p class="party-public-server-gate-text">${escapeHtml(gateNote)}</p>
               ${
                 gate === "ready"
                   ? `<button type="button" class="party-btn btn-success party-public-server-ready">${ICON.check} Ready Up</button>`
                   : ""
               }
             </div>`
          : ""
      }
      ${showList ? `<div class="party-public-server-list"></div>` : ""}
    `;
    el.dataset.shell = "1";
    wirePartyPublicServerPicker(el, slot);
  }

  if (!showList) return;

  const summaryEl = el.querySelector(".party-public-server-summary");
  const listEl = el.querySelector(".party-public-server-list");
  try {
    const data = await loadPartyServers(slug, force);
    const servers = Array.isArray(data?.servers) ? data.servers : [];
    const players = servers.reduce((n, s) => n + (Number(s.players) || 0), 0);
    const sorted = [...servers].sort((a, b) => (b.players || 0) - (a.players || 0));

    const summary = servers.length
      ? `${formatPartyPlayerCount(players)} playing across ${servers.length} server${
          servers.length === 1 ? "" : "s"
        }`
      : "No public servers listed right now.";
    if (summaryEl && summaryEl.textContent !== summary) summaryEl.textContent = summary;

    if (listEl) {
      const rows = sorted
        .map((s) => partyServerRowHtml(s, { canPick, selectedId, selectedHost, selectedPort }))
        .join("");
      if (listEl.dataset.rowSig !== rows) {
        const scroll = listEl.scrollTop;
        listEl.innerHTML = rows;
        listEl.dataset.rowSig = rows;
        listEl.scrollTop = scroll;
      }
    }

    if (window.playbound?.pingServers && sorted.length > 0) {
      void window.playbound.pingServers(sorted.slice(0, 25)).then((pings) => {
        if (pings && typeof pings === "object") {
          let changed = false;
          for (const [sId, p] of Object.entries(pings)) {
            if (partyServerPings.get(sId) !== p) {
              partyServerPings.set(sId, p);
              changed = true;
            }
          }
          if (changed && listEl) {
            const rowsWithPings = sorted
              .map((s) => partyServerRowHtml(s, { canPick, selectedId, selectedHost, selectedPort }))
              .join("");
            const scroll = listEl.scrollTop;
            listEl.innerHTML = rowsWithPings;
            listEl.dataset.rowSig = rowsWithPings;
            listEl.scrollTop = scroll;
          }
        }
      });
    }
  } catch (err) {
    console.warn("fillPartyPublicServerPicker:", err);
    if (summaryEl) summaryEl.textContent = "Couldn't load servers.";
  }
}

function wirePartyPublicServerPicker(el, slot) {
  const partyId = el.dataset.partyId;

  el.querySelector(".party-public-server-refresh")?.addEventListener("click", () => {
    void fillPartyPublicServerPicker(slot, true);
    void fillPartyOnlineCount(slot, true);
  });

  /*
   * Ready-up from where the order is explained, rather than sending the leader
   * back down to the actions row and up again to pick.
   */
  el.querySelector(".party-public-server-ready")?.addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    const ok = applyPartyResult(
      await window.playbound.setPartyReady(partyId, true),
      "Couldn't update your ready state."
    );
    if (!ok) btn.disabled = false;
  });

  el.querySelector(".party-public-server-list")?.addEventListener("click", async (event) => {
    const btn = event.target.closest(".party-public-server-row");
    if (!btn || btn.disabled) return;
    if (el.dataset.canPick !== "1" || !window.playbound.setPartyPublicServer) return;
    btn.disabled = true;
    try {
      const ok = applyPartyResult(
        await window.playbound.setPartyPublicServer(partyId, {
          id: btn.dataset.id,
          name: btn.dataset.name,
          host: btn.dataset.host,
          port: Number(btn.dataset.port),
          mod: btn.dataset.mod || null,
          protected: btn.dataset.protected === "1",
        }),
        "Couldn't pick that server."
      );
      /*
       * A successful pick changes the payload and the card repaints over this
       * row. A rejected one does not, and the rows are only rewritten when
       * they differ — so nothing else would ever re-enable this button.
       */
      if (!ok) btn.disabled = false;
    } catch (err) {
      btn.disabled = false;
      setStatus(err.message || "Couldn't pick that server.", true);
    }
  });
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
      editionSlug: active.editionSlug || null,
      openRaMod: active.openRaMod || null,
      leaderId: active.leaderId,
      maxSize: active.maxSize,
      // Both, not just the pick: switching games changes which modes exist, and
      // the picker has to appear or disappear with them.
      hostMode: active.hostMode || null,
      hostModes: (active.hostModes || []).map((m) => m.mode),
      publicServer: active.publicServer
        ? [active.publicServer.id, active.publicServer.host, active.publicServer.port]
        : null,
      // Someone joining on another OS changes which games are offered, so the
      // picker has to repaint when this does.
      requiredPlatforms: (active.requiredPlatforms || []).join(","),
      members: (active.members || []).map((m) => [m.userId, m.username, m.role, m.ready]),
      hosted: active.hosted || null,
      lan: active.lan || null,
      discord: active.discord || null,
      voiceEnabled: active.voiceEnabled !== false,
      configSync: active.configSync
        ? [
            active.configSync.allInSync !== undefined
              ? active.configSync.allInSync
              : active.configSync.allReady,
            active.configSync.editionSlug || null,
            active.configSync.editionName || null,
            (active.configSync.members || []).map((m) => [
              m.userId,
              m.hasGame,
              m.hasEdition,
              (m.missingMods || []).length,
            ]),
          ]
        : null,
      // The card renders the server's headline, so a phase change has to repaint
      // it even when the member and sync fields above are unchanged.
      readiness: active.readiness ? [active.readiness.phase, active.readiness.headline] : null,
    },
    discoverable.map((p) => [p.id, p.status, p.members?.length, p.name, p.gameSlug]),
  ]);
}

function blurPartyFocus() {
  const slot = document.getElementById("friends-party-area");
  const active = document.activeElement;
  if (slot && active && slot.contains(active) && typeof active.blur === "function") {
    active.blur();
  }
}

function clearPartyAreaOptimistic() {
  const slot = document.getElementById("friends-party-area");
  if (slot) {
    slot.innerHTML = "";
    slot.dataset.sig = "";
  }
  state._activeParty = null;
  const startBtn = document.getElementById("btn-toggle-create-party");
  if (startBtn) startBtn.style.display = "";
  syncFriendsPoll();
}

function paintPartyArea(partiesData, { force = false } = {}) {
  const slot = document.getElementById("friends-party-area");
  if (!slot) return;
  if (partiesData?.error) {
    // Clearing the DOM without also clearing the signature leaves this
    // blank forever: the next successful poll can return the exact same
    // (unchanged) party data, compute the same signature, and the
    // unchanged-signature guard below would skip repainting — even though
    // there is nothing on screen to skip repainting over.
    slot.innerHTML = "";
    slot.dataset.sig = "";
    return;
  }
  const mine = Array.isArray(partiesData?.myParties) ? partiesData.myParties : [];
  const discoverable = Array.isArray(partiesData?.discoverable) ? partiesData.discoverable : [];
  const active = mine[0] || null;

  if (!force && partyMutationInFlight > 0) return;

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
  if (!force && slot.contains(document.activeElement)) return;
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
  blurPartyFocus();
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
      const slug = gameSelect.value;
      if (!slug) return;
      const pickedTitle =
        partyGamesCache?.find((g) => g.slug === slug)?.title || slug;
      partyMutationInFlight += 1;
      if (state._activeParty?.id === partyId) {
        state._activeParty = {
          ...state._activeParty,
          gameSlug: slug,
          gameTitle: pickedTitle,
          editionSlug: null,
          modSlugs: [],
        };
        slot.dataset.sig = "";
        paintPartyArea({ myParties: [state._activeParty], discoverable: [] }, { force: true });
      }
      try {
        const res = await window.playbound.setPartyGame(partyId, slug);
        partyMutationInFlight = Math.max(0, partyMutationInFlight - 1);
        applyPartyResult(res, "Couldn't set the party game.");
        void window.playbound.syncLibraryNow?.({ quiet: true });
      } catch (err) {
        partyMutationInFlight = Math.max(0, partyMutationInFlight - 1);
        setStatus(err.message || "Couldn't set the party game.", true);
        void api.refreshFriendsData();
      }
    });
    enhanceSelect(gameSelect);
  }

  const openRaModSelect = slot.querySelector("#party-openra-mod-select");
  if (openRaModSelect) {
    openRaModSelect.addEventListener("change", async () => {
      const val = openRaModSelect.value || null;
      partyMutationInFlight += 1;
      try {
        const res = await (window.playbound.setPartyOpenRaMod?.(partyId, val) ??
          window.playbound.setPartyEdition?.(partyId, val));
        partyMutationInFlight = Math.max(0, partyMutationInFlight - 1);
        applyPartyResult(res, "Couldn't change OpenRA game mode.");
        void api.refreshFriendsData();
      } catch (err) {
        partyMutationInFlight = Math.max(0, partyMutationInFlight - 1);
        setStatus(err.message || "Couldn't change OpenRA game mode.", true);
        void api.refreshFriendsData();
      }
    });
    enhanceSelect(openRaModSelect);
  }

  const hostModeSelect = slot.querySelector("#party-hostmode-select");
  if (hostModeSelect) {
    hostModeSelect.addEventListener("change", async () => {
      const mode = hostModeSelect.value;
      if (!mode) return;
      partyMutationInFlight += 1;
      try {
        const res = await window.playbound.setPartyHostMode(partyId, mode);
        partyMutationInFlight = Math.max(0, partyMutationInFlight - 1);
        applyPartyResult(res, "Couldn't change where the game is hosted.");
      } catch (err) {
        partyMutationInFlight = Math.max(0, partyMutationInFlight - 1);
        setStatus(err.message || "Couldn't change where the game is hosted.", true);
        void api.refreshFriendsData();
      }
    });
    enhanceSelect(hostModeSelect);
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
      const ok = applyPartyResult(
        await window.playbound.setPartyReady(partyId, !me?.ready),
        "Couldn't update your ready state."
      );
      if (!ok) readyBtn.disabled = false;
      else blurPartyFocus();
    });
  }

  slot.querySelectorAll(".btn-party-install").forEach((btn) => {
    btn.addEventListener("click", () => {
      const href = btn.dataset.href;
      if (!href || !window.playbound.openDeepLink) return;
      markPartyInstallReturn(party.gameSlug);
      void window.playbound.openDeepLink(href);
    });
  });

  void fillPartyEditionPickers(slot, party);
  void fillPartyOnlineCount(slot);
  void fillPartyPublicServerPicker(slot);

  const joinGameBtn = slot.querySelector("#btn-party-join-game");
  if (joinGameBtn) {
    joinGameBtn.addEventListener("click", async () => {
      if (joinGameBtn.disabled) return;
      joinGameBtn.disabled = true;
      const res = await window.playbound.partyJoinGame(partyId);
      if (res?.error) {
        setStatus(res.error, true);
        joinGameBtn.disabled = false;
        void api.refreshFriendsData();
        return;
      }
      const updated = res?.party || party;
      const hosted = updated.hosted || {};
      const lan = updated.lan || {};
      if (
        (hosted.enabled && hosted.status !== "ready") ||
        (lan.enabled && lan.status !== "ready")
      ) {
        setStatus(
          hosted.error || lan.error || "Server not ready yet — wait a moment.",
          true
        );
        joinGameBtn.disabled = false;
        const areaSlot = document.getElementById("friends-party-area");
        if (areaSlot) areaSlot.dataset.sig = "";
        void api.refreshFriendsData();
        return;
      }
      await launchPartyGame(updated);
      joinGameBtn.disabled = false;
      const areaSlot = document.getElementById("friends-party-area");
      if (areaSlot) areaSlot.dataset.sig = "";
      void api.refreshFriendsData();
    });
  }

  const voiceBtn = slot.querySelector("#btn-party-voice");
  if (voiceBtn) {
    voiceBtn.addEventListener("click", () => {
      void handleLaunchPartyVoice(partyId, party, voiceBtn, slot.querySelector("#party-voice-error"));
    });
  }

  const enableVoiceBtn = slot.querySelector("#btn-party-enable-voice");
  if (enableVoiceBtn) {
    enableVoiceBtn.addEventListener("click", () => {
      void handleLaunchPartyVoice(
        partyId,
        party,
        enableVoiceBtn,
        slot.querySelector("#party-voice-error")
      );
    });
  }

  const leaveBtn = slot.querySelector("#btn-party-leave");
  if (leaveBtn) {
    leaveBtn.addEventListener("click", async () => {
      if (partyChatTimer) {
        clearInterval(partyChatTimer);
        partyChatTimer = null;
      }
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
      clearPartyAreaOptimistic();
      setStatus(isLeader && alone ? "Party ended" : "Left party");
      void api.refreshFriendsData();
    });
  }

  // Active polling timer for party chat
  if (partyChatTimer) {
    clearInterval(partyChatTimer);
    partyChatTimer = null;
  }
  if (party?.id) {
    void refreshPartyChat(party);
    partyChatTimer = setInterval(() => {
      const list = document.getElementById("party-chat-list");
      if (!list || list.dataset.party !== String(party.id)) {
        if (partyChatTimer) clearInterval(partyChatTimer);
        partyChatTimer = null;
        return;
      }
      void refreshPartyChat(party);
    }, 2500);
  }

  const chatForm = slot.querySelector("#party-chat-form");
  if (chatForm) {
    const input = slot.querySelector("#party-chat-input");
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          chatForm.requestSubmit();
        }
      });
    }

    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const content = String(input?.value || "").trim();
      if (!content || !window.playbound.sendPartyChat) return;
      if (input) input.value = "";

      const list = slot.querySelector("#party-chat-list");
      if (list) {
        const empty = list.querySelector(".party-chat-empty");
        if (empty) empty.remove();
        const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const div = document.createElement("div");
        div.className = "party-chat-msg";
        div.innerHTML = `
          <div class="party-chat-meta">
            <span class="party-chat-author">You</span>
            <span class="party-chat-time">${escapeHtml(time)}</span>
          </div>
          <div class="party-chat-content">${escapeHtml(content)}</div>
        `;
        list.appendChild(div);
        list.scrollTop = list.scrollHeight;
      }

      const activeId = String(party?.id || party?._id || partyId || "");
      const res = await window.playbound.sendPartyChat(activeId, content);
      if (res?.error) {
        console.warn("sendPartyChat error:", res.error);
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
  /*
   * No overlay on this deployment. Launch anyway.
   *
   * `configured` false means the server has no NetBird credentials, so the
   * status will never leave "none" — and blocking on it told the player to try
   * again in a moment for something that could not happen, on repeat, while
   * the party sat at "session in progress" because the server had already
   * marked it playing. Starting the game and saying discovery is unavailable is
   * both true and playable; refusing to start it is neither.
   */
  if (lan.configured === false) {
    setStatus(
      "Party network is unavailable — launching anyway. You may need to connect in-game yourself."
    );
    return true;
  }
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

  const unlistenProgress = window.playbound.onVirtualLanProgress?.((msg) => {
    if (msg) setStatus(msg);
  });

  try {
    setStatus("Connecting to the party network…");
    const res = await window.playbound.prepareVirtualLan({
      partyId: party.id,
      slug: party.gameSlug,
      editionSlug: party.editionSlug || null,
      adapterFile: lan.adapterFile || null,
      isLeader: String(party.leaderId) === String(currentUserId(party)),
    });

    if (res?.needsInstall) {
      setStatus(res.error, true);
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
  } finally {
    unlistenProgress?.();
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

  /*
   * A public self-hosted room is the only case that needs a router mapping:
   * party members reach the host over the overlay, but someone joining from
   * the public list does not. The server sends selfHostPort only when that
   * applies, and only the leader is actually hosting. Awaited so the port is
   * open before the game binds it, but never fatal — plenty of routers refuse,
   * and the room still works for the party itself.
   */
  const selfHostPort = party.selfHostPort;
  const isLeader = party.leaderId === state.accountState?.userId;
  if (isLeader && party.hostMode === "self" && selfHostPort?.port) {
    try {
      const mapped = await window.playbound.prepareSelfHost?.({
        slug,
        port: selfHostPort.port,
        protocol: selfHostPort.protocol,
      });
      if (mapped && !mapped.ok) {
        setStatus(
          "Couldn't open your router's port — friends in the party can still join, but players outside it may not.",
          true
        );
      }
    } catch {
      /* Hosting proceeds regardless; see above. */
    }
  }

  const games = partyGamesCache || [];
  const catalogGame = games.find((g) => g.slug === slug);
  const detail = {
    title: party.gameTitle || catalogGame?.title || slug,
    slug,
    gameSlug: slug,
    controllerSupport: catalogGame?.controllerSupport,
    hasControllerSupport: catalogGame?.hasControllerSupport,
    features: catalogGame?.features,
    tags: catalogGame?.tags,
  };

  const hosted = party.hosted || {};
  if (hosted.status === "ready" && hosted.host && hosted.port) {
    const address = `${hosted.host}:${hosted.port}`;
    try {
      const launched = await maybeOfferPhoneControllerThenPlay(
        detail,
        async () => {
          setStatus(`Joining ${address}…`);
          const res = await window.playbound.play(
            slug,
            {
              host: hosted.host,
              port: Number(hosted.port),
              name: state.accountState?.username || hosted.name || party.gameTitle || "",
              // Explicit override for OpenRA's "official" edition, which is one
              // client covering Red Alert/Tiberian Dawn/Dune 2000 — editionSlug
              // alone can't say which one the party actually started.
              mod: party.openRaMod || undefined,
            },
            party.editionSlug || null
          );
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
            const steps =
              Array.isArray(hosted.steps) && hosted.steps.length
                ? ` Then: ${hosted.steps.join(" → ")}.`
                : "";
            setStatus(`Joining ${party.gameTitle || slug} at ${address}…${steps}`);
          }
        },
        slug
      );
      if (!launched) return;
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
  /*
   * `configured` false means this deployment has no game host, so the room will
   * never come up and retrying cannot help. Fall through and launch rather than
   * parking the player on a message that promises otherwise — the party is
   * already marked playing by then, so blocking here produced "session in
   * progress" beside a game that never started.
   */
  if (hosted.enabled && hosted.configured === false) {
    setStatus(
      "PlayBound server is unavailable — this game needs a hosted server to play together.",
      true
    );
    return;
  } else if (hosted.enabled && hosted.status !== "ready") {
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

  if (catalogGame?.kind === "external" && catalogGame.url) {
    window.playbound.openExternal(catalogGame.url);
    return;
  }

  if (hosted.enabled) {
    setStatus("Waiting for the PlayBound server — try Join Game again in a moment.");
    return;
  }

  const isLeader = String(party.leaderId) === String(currentUserId(party));
  let peerConnect = null;
  if (!isLeader && lan.enabled) {
    const leaderMember = (party.members || []).find(
      (m) => String(m.userId) === String(party.leaderId)
    );
    const leaderAddress = leaderMember?.lanAddress || lan.leaderAddress || null;
    if (leaderAddress) {
      const defaultPort =
        slug === "freeciv"
          ? 5556
          : slug === "openarena" || slug === "wolfenstein-enemy-territory"
          ? 27960
          : slug === "xonotic"
          ? 26000
          : slug === "srb2"
          ? 5029
          : slug === "jfsw"
          ? 1997
          : slug === "opentyrian-2000" || slug === "opentyrian"
          ? 1333
          : 0;
      peerConnect = {
        host: leaderAddress,
        port: Number(party.port || catalogGame?.port || defaultPort || 0),
        name: state.accountState?.username || "",
      };
    }
  }

  try {
    const launched = await maybeOfferPhoneControllerThenPlay(
      detail,
      async () => {
        setStatus("Checking Java / launching…");
        const edition = party.editionSlug || party.installedEditionSlug || null;
        await window.playbound.play(slug, peerConnect, edition);
        startGameSession(slug, party.gameTitle || slug);
        setStatus(
          peerConnect?.host
            ? `Joining ${party.gameTitle || slug} via party network…`
            : `Launched ${party.gameTitle || slug}`
        );
      },
      slug
    );
    if (!launched) return;
  } catch (err) {
    const msg = err?.message || String(err || "Launch failed");
    console.warn("launchPartyGame failed:", msg);
    setStatus(msg, true);
    if (/not installed/i.test(msg)) {
      markPartyInstallReturn(slug);
      api.navigateTo("gameDetail", { slug });
    }
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
    if (createPartyInFlight) return;
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
    createPartyInFlight = true;
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
      if (res?.error || !res?.party?.id) throw new Error(res?.error || "Failed to create party.");
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
      await api.refreshFriendsData();
    } catch (err) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await api.refreshFriendsData();
        if (state._activeParty?.id) {
          document.getElementById("create-party-panel").style.display = "none";
          if (nameInput) nameInput.value = "";
          return;
        }
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        }
      }
      if (msg) {
        msg.textContent = err.message || "Couldn't create party.";
        msg.style.display = "block";
      }
    } finally {
      createPartyInFlight = false;
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
  setStatus("Opened party voice in Discord.");
}

async function handleLaunchPartyVoice(partyId, party, voiceBtn, errorEl) {
  if (voiceBtn) {
    voiceBtn.disabled = true;
    voiceBtn.textContent = "Opening…";
  }
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }
  try {
    const res = await window.playbound.provisionPartyDiscord(partyId);
    if (res?.needsDiscordLink) {
      handlePartyVoice(res);
      return;
    }

    const inviteUrl =
      res?.inviteUrl || res?.party?.discord?.inviteUrl || party.discord?.inviteUrl || "";

    if (!inviteUrl) {
      if (res?.moved) {
        setStatus("Moved to party voice in Discord — open Discord to join.");
        void window.playbound.openDiscordInvite?.("https://discord.com/app");
        return;
      }
      const errMsg = res?.error || "Could not launch Discord voice.";
      if (errorEl) {
        errorEl.textContent = errMsg;
        errorEl.style.display = "block";
      }
      setStatus(errMsg, true);
      return;
    }

    openPartyVoice(inviteUrl);
    const areaSlot = document.getElementById("friends-party-area");
    if (areaSlot) areaSlot.dataset.sig = "";
    blurPartyFocus();
    void api.refreshFriendsData();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Could not launch Discord voice.";
    if (errorEl) {
      errorEl.textContent = errMsg;
      errorEl.style.display = "block";
    }
    setStatus(errMsg, true);
  } finally {
    if (voiceBtn) {
      voiceBtn.disabled = false;
      voiceBtn.innerHTML = `${ICON.phone} Launch Voice`;
    }
  }
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
