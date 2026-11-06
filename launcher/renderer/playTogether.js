/*
 * Play together: the website homepage's multiplayer panel, for the launcher.
 *
 * One panel for the launcher home sidebar and the Friend View window's Friends
 * tab. Share when you're free, see who's online and who could play next, invite
 * them or plan a party. Same data and same routes as HomePlayTogether.tsx on the
 * site, so anything saved here shows up there. Imports nothing that needs the
 * main launcher page, because Friend View has its own small page.
 */
import { PLAN_LENGTH, defaultPlayPreferences, findMatches, timeSlots, toMatchGame } from "./playMatch.js";

const REFRESH_EVERY = 120000;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clock = (time) => new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const slotLabel = (time, now) => `${new Date(time).getDate() !== new Date(now).getDate() ? "Tomorrow · " : ""}${clock(time)}`;

/** The launcher's calls answer { error } instead of throwing, so turn that into one failure path. */
async function call(work) {
  const result = await work();
  if (!result || result.error || result.ok === false) throw new Error(result?.error || "Please try again.");
  return result;
}

async function leaveFor(view, params = {}) {
  await window.playbound.hideOverlay?.();
  await window.playbound.showMainWindow({ navigate: { view, ...params } });
}

export function mountPlayTogether(host, { isShowing = () => !document.hidden } = {}) {
  const s = {
    snapshot: null, games: [], partyId: "", now: Date.now(), when: 0, selected: "", message: "", notice: "", busy: false,
    failed: false, editing: false, prefs: defaultPlayPreferences, query: "", planningAt: 0, plans: {}, sent: [],
  };
  let lastLoad = 0;
  let writes = 0;

  const matches = () => (s.snapshot ? findMatches(s.snapshot, s.games, s.when, s.now) : []);
  const sentKey = (friendId, at) => `${friendId}:${at > s.now ? at : 0}`;

  async function load({ force = false } = {}) {
    if (!force && (!isShowing() || Date.now() - lastLoad < REFRESH_EVERY)) return;
    lastLoad = Date.now();
    const version = writes;
    try {
      const data = await call(() => window.playbound.getPlayAvailability());
      if (version !== writes || s.busy) return;
      s.snapshot = data;
      s.failed = false;
      s.now = Date.now();
    } catch (error) {
      if (s.snapshot) return;
      s.failed = true;
      s.notice = error.message;
    }
    paint();
  }

  async function loadExtras() {
    try {
      const raw = await window.playbound.getCatalog();
      const list = Array.isArray(raw) ? raw : raw?.games || [];
      s.games = list.filter((game) => game.partyLaunchable ?? game.isMultiplayer ?? game.multiplayer).map(toMatchGame);
    } catch { /* Matching needs the catalog; the rest of the panel still works without it. */ }
    try {
      const parties = await window.playbound.getParties({ includeDiscoverable: false });
      s.partyId = parties?.myParties?.[0]?.id || "";
    } catch { /* The button falls back to starting a party. */ }
    paint();
  }

  async function run(work) {
    if (s.busy) return;
    writes++;
    s.busy = true;
    s.notice = "";
    paint();
    try {
      s.notice = await work();
    } catch (error) {
      s.notice = error.message || "Please try again.";
    }
    s.busy = false;
    writes++;
    paint();
  }

  async function plan(at, gameSlug) {
    if (s.plans[at]) return s.plans[at];
    const result = await call(() => window.playbound.createEvent({
      title: "Play together with friends", plannedParty: true, gameSlug, eventType: "party", visibility: "unlisted", hostType: "community",
      startsAt: new Date(at).toISOString(), endsAt: new Date(at + PLAN_LENGTH).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }));
    s.plans[at] = result.event.id;
    return result.event.id;
  }

  async function invite(friend, at, gameSlug) {
    if (at > s.now) {
      const eventId = await plan(at, gameSlug);
      const when = new Date(at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
      await call(() => window.playbound.sendFriendMessage({ friendId: friend.id, eventId, message: `Join my party on ${when}.` }));
    } else {
      const list = await call(() => window.playbound.getParties({ includeDiscoverable: false }));
      const editionSlug = friend.sharedGames?.find((game) => game.slug === gameSlug)?.editionSlug;
      const party = list.myParties?.[0] || (await call(() => window.playbound.createParty({ gameSlug, editionSlug, visibility: "friends" }))).party;
      s.partyId = party.id;
      const result = await call(() => window.playbound.inviteToParty(party.id, [friend.id]));
      if (result.results?.[0]?.status !== 201) throw new Error(result.results?.[0]?.error || "Invite failed.");
    }
    s.sent.push(sentKey(friend.id, at));
    return `Invitation sent to ${friend.username}.`;
  }

  const shareFree = () => run(async () => {
    const start = s.when || Date.now();
    const window_ = { startsAt: new Date(start).toISOString(), endsAt: new Date(start + PLAN_LENGTH).toISOString() };
    const result = await call(() => window.playbound.patchPlayAvailability({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, window: window_ }));
    s.snapshot.availability = { ...s.snapshot.availability, window: result.window };
    return "Availability shared for two hours.";
  });

  const clearWindow = () => run(async () => {
    await call(() => window.playbound.patchPlayAvailability({ timezone: s.snapshot.availability.timezone, window: null }));
    s.snapshot.availability = { ...s.snapshot.availability, window: null };
    return "Window cleared.";
  });

  const savePreferences = () => run(async () => {
    const result = await call(() => window.playbound.patchPlayAvailability(s.prefs));
    s.snapshot.preferences = result.preferences;
    s.editing = false;
    return "Preferences saved.";
  });

  function preferencesSummary() {
    const p = s.snapshot.preferences || defaultPlayPreferences;
    const choice = p.mode === "any" ? "Any multiplayer game"
      : p.mode === "genres" ? p.genres.join(", ")
        : s.games.filter((game) => p.games.includes(game.slug)).map((game) => game.title).join(", ");
    return `${choice} · ${p.downloads ? "Open to free downloads" : "Installed games only"}`;
  }

  function optionsHtml() {
    const key = s.prefs.mode;
    const options = key === "genres" ? [...new Set(s.games.flatMap((game) => game.genres))].sort().map((name) => ({ slug: name, title: name })) : s.games;
    return options.filter((option) => option.title.toLowerCase().includes(s.query.toLowerCase())).map((option) =>
      `<label class="pt-check"><input type="checkbox" data-option="${escapeHtml(option.slug)}" ${s.prefs[key].includes(option.slug) ? "checked" : ""}>${escapeHtml(option.title)}</label>`).join("");
  }

  function preferencesHtml() {
    const p = s.prefs;
    return `<div class="pt-sheet">
      <label class="pt-field">Games
        <select data-prefs-mode>
          <option value="any" ${p.mode === "any" ? "selected" : ""}>Any multiplayer game</option>
          <option value="genres" ${p.mode === "genres" ? "selected" : ""}>Choose genres</option>
          <option value="games" ${p.mode === "games" ? "selected" : ""}>Choose games</option>
        </select>
      </label>
      ${p.mode === "any" ? "" : `<input data-prefs-query aria-label="Filter options" placeholder="Search options" value="${escapeHtml(s.query)}"><div class="pt-options" data-prefs-options>${optionsHtml()}</div>`}
      <label class="pt-check"><input type="checkbox" data-prefs-downloads ${p.downloads ? "checked" : ""}>Open to downloading free games</label>
      <div class="pt-actions">
        <button type="button" class="pt-button primary" data-action="save-prefs" ${s.busy ? "disabled" : ""}>Save preferences</button>
        <button type="button" class="pt-button" data-action="cancel-prefs">Cancel</button>
      </div>
    </div>`;
  }

  function planHtml() {
    const at = s.planningAt;
    const planned = s.plans[at];
    const day = new Date(at).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    return `<div class="pt-sheet">
      <h3>${planned ? "Your party is planned" : "Plan a party"}</h3>
      <p>${escapeHtml(day)} · ${clock(at)} – ${clock(at + PLAN_LENGTH)}</p>
      <p>${planned ? "Open the party details or choose a friend to invite." : "Create an unlisted party, then invite your friends."}</p>
      <div class="pt-actions">
        ${planned ? `<button type="button" class="pt-button primary" data-action="open-plan">Open party</button>`
          : `<button type="button" class="pt-button primary" data-action="create-plan" ${s.busy ? "disabled" : ""}>${s.busy ? "Creating party…" : "Create party"}</button>`}
        <button type="button" class="pt-button" data-action="close-plan">${planned ? "Back to friends" : "Close"}</button>
      </div>
    </div>`;
  }

  function selectedHtml(list) {
    const target = s.snapshot.friends?.find((friend) => friend.id === s.selected);
    if (!target) return "";
    const chosen = list.find((match) => match.friend.id === s.selected);
    const at = chosen?.at || s.when || s.now;
    const sent = s.sent.includes(sentKey(target.id, at));
    return `<div class="pt-sheet">
      <h3>${escapeHtml(target.username)}</h3>
      ${target.recentGames?.length ? `<p>Recently played · ${escapeHtml(target.recentGames.join(", "))}</p>` : ""}
      <button type="button" class="pt-button" data-action="invite-selected" ${s.busy || sent ? "disabled" : ""}>${sent ? "Invited" : at > s.now ? `Invite for ${clock(at)}` : "Invite to party"}</button>
      <label class="pt-field">Message <input data-message maxlength="500" value="${escapeHtml(s.message)}"></label>
      <button type="button" class="pt-button" data-action="send-message" ${s.busy || !s.message.trim() ? "disabled" : ""}>Send message</button>
    </div>`;
  }

  function paint() {
    if (s.failed && !s.snapshot) {
      host.innerHTML = `<section class="site-panel site-pad pt-panel"><h2>Play together</h2><p role="status">${escapeHtml(s.notice)}</p><button type="button" class="pt-button" data-action="retry">Try again</button></section>`;
      return;
    }
    if (!s.snapshot) {
      host.innerHTML = '<section class="site-panel site-pad pt-panel"><h2>Play together</h2><p>Loading friends…</p></section>';
      return;
    }
    if (s.when && s.when < s.now) s.when = 0;
    const list = matches();
    const online = (s.snapshot.friends || []).filter((friend) => friend.online);
    const window_ = s.snapshot.availability?.window;
    const busy = s.busy ? "disabled" : "";
    host.innerHTML = `<section class="site-panel site-pad pt-panel">
      <h2>Play together</h2>
      <label class="pt-field">When
        <select data-when>
          <option value="0">Now</option>
          ${timeSlots(s.now).map((time) => `<option value="${time}" ${time === s.when ? "selected" : ""}>${escapeHtml(slotLabel(time, s.now))}</option>`).join("")}
        </select>
      </label>
      <div class="pt-actions">
        ${s.when ? `<button type="button" class="pt-button" data-action="plan" ${busy}>${s.plans[s.when] ? "View party plan" : "Plan a party"}</button>`
          : `<button type="button" class="pt-button" data-action="party">${s.partyId ? "Open your party" : "Start a Party"}</button>`}
        <button type="button" class="pt-button primary" data-action="free" ${busy}>${s.when ? `Free at ${clock(s.when)}` : "Free to Play Now"}</button>
      </div>
      ${s.planningAt ? planHtml() : ""}
      ${window_ && Date.parse(window_.endsAt) > s.now ? `<p>Your window · ${clock(Date.parse(window_.startsAt))} – ${clock(Date.parse(window_.endsAt))} <button type="button" class="pt-link" data-action="clear-window" ${busy}>Clear</button></p>` : ""}
      <h3>Friends online</h3>
      ${online.length ? `<div class="pt-actions">${online.map((friend) => `<button type="button" class="pt-chip" data-pick="${escapeHtml(friend.id)}">${escapeHtml(friend.username)}</button>`).join("")}</div>` : "<p>No friends online right now.</p>"}
      <div class="pt-row"><h3>Play preferences</h3><button type="button" class="pt-link" data-action="edit-prefs">${s.editing ? "Close" : "Edit"}</button></div>
      ${s.editing ? preferencesHtml() : `<p>${escapeHtml(preferencesSummary())}</p>`}
      ${s.snapshot.recentGames?.length ? `<p>Recently played · ${escapeHtml(s.snapshot.recentGames.join(", "))}</p>` : ""}
      <h3>Next available</h3>
      ${list.length ? list.slice(0, 3).map((match, index) => {
        const sent = s.sent.includes(sentKey(match.friend.id, match.at));
        return `<div class="pt-match">
          <button type="button" class="pt-match-who" data-pick="${escapeHtml(match.friend.id)}"><strong>${escapeHtml(match.friend.username)}</strong> · ${match.at === s.now ? "Free now" : clock(match.at)}<small>${escapeHtml(match.game.title)} · ${match.installed ? "Both installed" : "Free download"}</small></button>
          ${index === 0 ? `<button type="button" class="pt-button" data-invite="${escapeHtml(match.friend.id)}" ${s.busy || sent ? "disabled" : ""}>${sent ? "Invited" : "Invite"}</button>` : ""}
        </div>`;
      }).join("") : "<p>No matching friends in the next six hours.</p>"}
      ${selectedHtml(list)}
      ${s.notice ? `<p role="status" class="pt-notice">${escapeHtml(s.notice)}</p>` : ""}
      <button type="button" class="pt-link" data-action="friends">Friends &amp; schedule →</button>
    </section>`;
  }

  const actions = {
    retry: () => { s.failed = false; s.notice = ""; paint(); void load({ force: true }); },
    plan: () => { s.planningAt = s.when; s.notice = ""; paint(); },
    "close-plan": () => { s.planningAt = 0; paint(); },
    "create-plan": () => run(async () => { await plan(s.planningAt); return ""; }),
    "open-plan": () => leaveFor("eventDetail", { eventId: s.plans[s.planningAt] }),
    party: () => leaveFor("friends"),
    free: shareFree,
    "clear-window": clearWindow,
    "edit-prefs": () => { s.notice = ""; s.prefs = { ...defaultPlayPreferences, ...s.snapshot.preferences }; s.query = ""; s.editing = !s.editing; paint(); },
    "cancel-prefs": () => { s.editing = false; paint(); },
    "save-prefs": savePreferences,
    "invite-selected": () => {
      const target = s.snapshot.friends.find((friend) => friend.id === s.selected);
      const chosen = matches().find((match) => match.friend.id === s.selected);
      return run(() => invite(target, chosen?.at || s.when || s.now, chosen?.game.slug));
    },
    "send-message": () => run(async () => {
      await call(() => window.playbound.sendFriendMessage({ friendId: s.selected, message: s.message }));
      s.message = "";
      return "Message sent.";
    }),
    friends: () => leaveFor("friends"),
  };

  host.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !host.contains(button) || button.disabled) return;
    if (button.dataset.action) return void actions[button.dataset.action]?.();
    if (button.dataset.pick) {
      s.selected = button.dataset.pick;
      s.message = "";
      return void paint();
    }
    if (button.dataset.invite) {
      const match = matches().find((candidate) => candidate.friend.id === button.dataset.invite);
      if (match) void run(() => invite(match.friend, match.at, match.game.slug));
    }
  });

  host.addEventListener("change", (event) => {
    const field = event.target;
    if (field.matches("[data-when]")) {
      s.when = Number(field.value);
      s.planningAt = 0;
      paint();
    } else if (field.matches("[data-prefs-mode]")) {
      s.prefs = { ...s.prefs, mode: field.value };
      s.query = "";
      paint();
    } else if (field.matches("[data-prefs-downloads]")) {
      s.prefs = { ...s.prefs, downloads: field.checked };
    } else if (field.matches("[data-option]")) {
      const key = s.prefs.mode;
      const value = field.dataset.option;
      s.prefs = { ...s.prefs, [key]: field.checked ? [...s.prefs[key], value] : s.prefs[key].filter((item) => item !== value) };
    }
  });

  // Typing updates only what depends on it, so the box being typed in keeps its focus.
  host.addEventListener("input", (event) => {
    const field = event.target;
    if (field.matches("[data-message]")) {
      s.message = field.value;
      const send = host.querySelector('[data-action="send-message"]');
      if (send) send.disabled = s.busy || !s.message.trim();
    } else if (field.matches("[data-prefs-query]")) {
      s.query = field.value;
      const options = host.querySelector("[data-prefs-options]");
      if (options) options.innerHTML = optionsHtml();
    }
  });

  const refreshIfIdle = () => {
    if (!host.isConnected || !isShowing()) return;
    s.now = Date.now();
    void load();
    if (!s.busy && !host.contains(document.activeElement)) paint();
  };
  document.addEventListener("visibilitychange", refreshIfIdle);
  setInterval(refreshIfIdle, 30000);

  paint();
  void load({ force: true });
  void loadExtras();

  return {
    /** Read again now: the Friend View window was hidden until this moment. */
    refresh: () => { void load({ force: true }); },
  };
}
