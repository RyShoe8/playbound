import {
  api,
  CACHE_TTL,
  cacheInvalidate,
  cacheInvoke,
  cachePeek,
  enhanceSelect,
  escapeHtml,
  filterRelatedByDiscovery,
  markViewDirty,
  markViewReady,
  prefetchEventDetail,
  prefetchGameDetail,
  setStatus,
  state,
  views,
} from "../shared.js";

function formatEventDate(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(isoStr);
  }
}

function eventTypeDisplay(type) {
  const map = {
    game_night: "Game Night",
    tournament: "Tournament",
    party: "Party",
    release: "Showcase / Release",
    meetup: "Community Meetup",
  };
  return map[type] || String(type || "Event").replace(/_/g, " ");
}

/**
 * One event card. Extracted from the old flat grid loop so the sectioned
 * layout can reuse it — the card markup itself is unchanged.
 */
function createEventCard(ev) {
  const card = document.createElement("div");
  card.className = "pb-event-card";

  const isLive = ev.status === "live";
  const going = ev.counts?.going ?? 0;
  const whenStr = ev.when?.dateLine
    ? `${ev.when.dateLine} · ${ev.when.timeLine || ""}`
    : formatEventDate(ev.startsAt);
  const coverUrl = ev.coverImage || null;

  const badges = `
    ${isLive ? `<span class="pb-badge-live">● Live now</span>` : ""}
    <span class="pb-badge-type">${escapeHtml(eventTypeDisplay(ev.eventType))}</span>
    ${ev.featured ? `<span class="pb-badge-featured">Featured</span>` : ""}
  `;

  card.innerHTML = `
    ${
      coverUrl
        ? `<div class="pb-event-card-cover-wrap">
             <img src="${escapeHtml(coverUrl)}" class="pb-event-card-cover-img" alt="${escapeHtml(ev.title)}" />
             <div class="pb-event-card-cover-overlay"></div>
             <div class="pb-event-badges" style="position: absolute; top: 10px; left: 10px; z-index: 2;">${badges}</div>
           </div>`
        : `<div class="pb-event-badges" style="padding: 16px 16px 0;">${badges}</div>`
    }
    <div class="pb-event-card-body">
      <h3 class="pb-event-title">${escapeHtml(ev.title)}</h3>
      ${ev.gameSlug ? `<p class="pb-event-game">${escapeHtml(ev.gameSlug)}</p>` : ""}
      <p class="pb-event-time">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${escapeHtml(whenStr)}
      </p>
      ${ev.description ? `<p class="pb-event-desc">${escapeHtml(ev.description)}</p>` : ""}
      <div class="pb-event-footer">
        <span class="pb-event-going">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          ${going} going${ev.maxParticipants ? ` / ${ev.maxParticipants}` : ""}
        </span>
        <div class="pb-event-actions">
          ${ev.discordInviteUrl ? `<button class="btn-secondary btn-sm btn-ev-discord" type="button">Discord</button>` : ""}
          <button class="btn-primary btn-sm btn-ev-view" type="button">View Event</button>
        </div>
      </div>
    </div>
  `;

  card.querySelector(".btn-ev-view")?.addEventListener("click", (e) => {
    e.stopPropagation();
    api.openEventDetail(ev.id, "events");
  });
  card.querySelector(".btn-ev-discord")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (ev.discordInviteUrl) window.playbound.openExternal(ev.discordInviteUrl);
  });
  card.addEventListener("pointerenter", () => prefetchEventDetail(ev.id), { once: true });
  card.addEventListener("click", () => api.openEventDetail(ev.id, "events"));

  return card;
}

/* ═══════════════════════════════════════════════════════════════
 * 1. EVENTS LIST / OVERVIEW VIEW
 * ═══════════════════════════════════════════════════════════════ */

async function renderEventsView() {
  const container = views.events;
  if (!container) return;

  container.innerHTML = `
    <div class="events-header-row" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Events</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Game Nights, tournaments, and open parties so you can actually play together.</p>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <button class="btn-primary btn-sm" id="btn-create-event" type="button">+ Create Event</button>
        <button class="btn-secondary btn-sm" id="btn-open-events-web" type="button">Open playbound.club/events</button>
      </div>
    </div>

    <!--
      Sections rather than one flat grid, matching the website's events page.
      The old single-event banner is gone with it: the site expresses the same
      thing as a "Happening soon" section plus the live badge already on each
      card, so a banner would be a third place saying it.
    -->
    <div id="events-sections" style="margin-top: 20px"></div>

    <!-- Create Event Modal -->
    <div class="modal-overlay" id="modal-create-event">
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title">Create Event</h2>
          <button type="button" class="modal-close" id="btn-close-create-event">✕</button>
        </div>
        <form id="form-create-event" class="modal-body">
          <div class="form-group">
            <label for="event-title">Event Title *</label>
            <input type="text" class="input-text" id="event-title" required placeholder="e.g. OpenRA Saturday Night Battle" />
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label for="event-type">Event Type</label>
              <select class="input-text" id="event-type">
                <option value="game_night">Game Night</option>
                <option value="tournament">Tournament</option>
                <option value="release">Showcase / Release</option>
                <option value="meetup">Community Meetup</option>
              </select>
            </div>
            <div class="form-group">
              <label for="event-game">Game</label>
              <select class="input-text" id="event-game">
                <option value="">No specific game</option>
              </select>
            </div>
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label for="event-starts-at">Starts At *</label>
              <input type="datetime-local" class="input-text" id="event-starts-at" required />
            </div>
            <div class="form-group">
              <label for="event-ends-at">Ends At (optional)</label>
              <input type="datetime-local" class="input-text" id="event-ends-at" />
            </div>
          </div>
          <div class="form-group">
            <label for="event-description">Description *</label>
            <textarea class="input-text" id="event-description" rows="3" required placeholder="Details about this match, rules, voice chat channels, or schedule…"></textarea>
          </div>

          <!-- Cover Photo Picker & Preview -->
          <div class="form-group">
            <label>Cover Photo (optional)</label>
            <div id="event-cover-preview-wrap" style="display:none; position:relative; width:100%; height:130px; border-radius:10px; overflow:hidden; margin-bottom:8px; border:1px solid var(--border); background:var(--bg-surface);">
              <img id="event-cover-preview-img" style="width:100%; height:100%; object-fit:cover;" />
              <div style="position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%);"></div>
              <span id="event-cover-preview-label" style="position:absolute; bottom:6px; left:8px; font-size:11px; font-weight:700; color:#fff;"></span>
              <button type="button" id="btn-remove-event-cover" style="position:absolute; top:6px; right:6px; background:rgba(239,68,68,0.85); color:#fff; border:none; border-radius:5px; padding:3px 8px; font-size:11px; cursor:pointer; font-weight:700;">✕ Remove</button>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="file" id="event-cover-file" accept="image/*" style="display:none;" />
              <button type="button" class="btn-secondary btn-sm" id="btn-choose-event-cover">Upload Cover Photo</button>
              <span id="event-cover-hint" class="view-sub" style="font-size:11px; margin:0;">Defaults to game cover if not provided</span>
            </div>
          </div>

          <div class="form-group">
            <label for="event-discord">Discord Invite / Voice Link (optional)</label>
            <input type="url" class="input-text" id="event-discord" placeholder="https://discord.gg/..." />
          </div>

          <div id="tournament-fields" style="display: none;" class="form-row-2">
            <div class="form-group">
              <label for="event-tournament-format">Tournament Format</label>
              <select class="input-text" id="event-tournament-format">
                <option value="single_elim">Single Elimination</option>
                <option value="double_elim">Double Elimination</option>
                <option value="round_robin">Round Robin</option>
                <option value="ffa">Free For All</option>
              </select>
            </div>
            <div class="form-group">
              <label for="event-team-size">Team Size</label>
              <select class="input-text" id="event-team-size">
                <option value="1">1v1 (Solo)</option>
                <option value="2">2v2 (Duos)</option>
                <option value="3">3v3 (Trios)</option>
                <option value="4">4v4 (Squads)</option>
              </select>
            </div>
          </div>

          <p id="create-event-error" class="view-sub" style="color:var(--danger); display:none; margin:0"></p>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" id="btn-cancel-create-event">Cancel</button>
            <button type="submit" class="btn-primary" id="btn-submit-create-event">Create Event</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById("btn-open-events-web")?.addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/events");
  });

  // Modal controls
  const modal = document.getElementById("modal-create-event");
  const openBtn = document.getElementById("btn-create-event");
  const closeBtn = document.getElementById("btn-close-create-event");
  const cancelBtn = document.getElementById("btn-cancel-create-event");
  const typeSelect = document.getElementById("event-type");
  const gameSelect = document.getElementById("event-game");
  const tournamentFields = document.getElementById("tournament-fields");
  const form = document.getElementById("form-create-event");
  const errorMsg = document.getElementById("create-event-error");

  const coverFileInput = document.getElementById("event-cover-file");
  const chooseCoverBtn = document.getElementById("btn-choose-event-cover");
  const removeCoverBtn = document.getElementById("btn-remove-event-cover");
  const coverPreviewWrap = document.getElementById("event-cover-preview-wrap");
  const coverPreviewImg = document.getElementById("event-cover-preview-img");
  const coverPreviewLabel = document.getElementById("event-cover-preview-label");

  let uploadedCustomCoverUrl = null;
  const gameCatalogMap = new Map();

  function updateCoverPreview() {
    if (uploadedCustomCoverUrl) {
      if (coverPreviewWrap && coverPreviewImg && coverPreviewLabel) {
        coverPreviewWrap.style.display = "block";
        coverPreviewImg.src = uploadedCustomCoverUrl;
        coverPreviewLabel.textContent = "Custom cover photo uploaded";
        if (removeCoverBtn) removeCoverBtn.style.display = "block";
      }
      return;
    }
    const selectedSlug = gameSelect?.value;
    const game = selectedSlug ? gameCatalogMap.get(selectedSlug) : null;
    if (game?.coverImage) {
      if (coverPreviewWrap && coverPreviewImg && coverPreviewLabel) {
        coverPreviewWrap.style.display = "block";
        coverPreviewImg.src = game.coverImage;
        coverPreviewLabel.textContent = `Using ${game.title || "game"} cover photo`;
        if (removeCoverBtn) removeCoverBtn.style.display = "none";
      }
    } else {
      if (coverPreviewWrap) coverPreviewWrap.style.display = "none";
    }
  }

  chooseCoverBtn?.addEventListener("click", () => {
    coverFileInput?.click();
  });

  coverFileInput?.addEventListener("change", async () => {
    const file = coverFileInput.files?.[0];
    if (!file) return;
    if (chooseCoverBtn) {
      chooseCoverBtn.disabled = true;
      chooseCoverBtn.textContent = "Uploading…";
    }
    if (errorMsg) errorMsg.style.display = "none";

    try {
      const buffer = await file.arrayBuffer();
      const res = await window.playbound.uploadEventCover(buffer, file.name, file.type);
      if (res && res.ok && res.url) {
        uploadedCustomCoverUrl = res.url;
        updateCoverPreview();
      } else {
        if (errorMsg) {
          errorMsg.textContent = res?.error || "Failed to upload cover photo.";
          errorMsg.style.display = "block";
        }
      }
    } catch {
      if (errorMsg) {
        errorMsg.textContent = "Failed to upload cover photo.";
        errorMsg.style.display = "block";
      }
    } finally {
      if (chooseCoverBtn) {
        chooseCoverBtn.disabled = false;
        chooseCoverBtn.textContent = uploadedCustomCoverUrl ? "Change Cover Photo" : "Upload Cover Photo";
      }
      coverFileInput.value = "";
    }
  });

  removeCoverBtn?.addEventListener("click", () => {
    uploadedCustomCoverUrl = null;
    if (chooseCoverBtn) chooseCoverBtn.textContent = "Upload Cover Photo";
    updateCoverPreview();
  });

  // Populate games dropdown
  try {
    const catalog = filterRelatedByDiscovery(await window.playbound.getCatalog() || []);
    (catalog || []).forEach((g) => {
      gameCatalogMap.set(g.slug, g);
      const opt = document.createElement("option");
      opt.value = g.slug;
      opt.textContent = g.title;
      gameSelect.appendChild(opt);
    });
    enhanceSelect(gameSelect);
    gameSelect._syncCustomSelect?.();
  } catch {}

  enhanceSelect(typeSelect);
  enhanceSelect(document.getElementById("event-tournament-format"));
  enhanceSelect(document.getElementById("event-team-size"));

  gameSelect?.addEventListener("change", () => {
    updateCoverPreview();
  });

  const closeModal = () => {
    modal.classList.remove("open");
    if (errorMsg) errorMsg.style.display = "none";
  };

  openBtn?.addEventListener("click", () => {
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    const startsInput = document.getElementById("event-starts-at");
    if (startsInput && !startsInput.value) startsInput.value = localIso;
    updateCoverPreview();
    modal.classList.add("open");
  });

  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  typeSelect?.addEventListener("change", () => {
    if (tournamentFields) {
      tournamentFields.style.display = typeSelect.value === "tournament" ? "grid" : "none";
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("event-title").value.trim();
    const description = document.getElementById("event-description").value.trim();
    const eventType = typeSelect.value;
    const gameSlug = gameSelect.value || null;
    const startsAtVal = document.getElementById("event-starts-at").value;
    const endsAtVal = document.getElementById("event-ends-at").value;
    const discord = document.getElementById("event-discord").value.trim();

    if (!title || !description || !startsAtVal) {
      if (errorMsg) {
        errorMsg.textContent = "Please fill in all required fields.";
        errorMsg.style.display = "block";
      }
      return;
    }

    const startsAtIso = new Date(startsAtVal).toISOString();
    const endsAtIso = endsAtVal ? new Date(endsAtVal).toISOString() : null;
    const submitBtn = document.getElementById("btn-submit-create-event");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating…";
    }
    if (errorMsg) errorMsg.style.display = "none";

    const payload = {
      title,
      description,
      eventType,
      gameSlug,
      coverImage: uploadedCustomCoverUrl || null,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      discordInviteUrl: discord || null,
      status: "registration_open",
      ...(eventType === "tournament"
        ? {
            tournamentFormat: document.getElementById("event-tournament-format")?.value || "single_elim",
            teamSize: Number(document.getElementById("event-team-size")?.value) || 1,
            checkInRequired: true,
          }
        : {}),
    };

    const res = await window.playbound.createEvent(payload);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Event";
    }

    if (res && res.ok) {
      closeModal();
      setStatus(`Event "${title}" created!`);
      cacheInvalidate("events");
      markViewDirty(views.events);
      await api.renderEventsView();
    } else {
      if (errorMsg) {
        errorMsg.textContent = res?.error || "Failed to create event. Make sure you are signed in from Settings.";
        errorMsg.style.display = "block";
      }
    }
  });

  const res =
    (await cacheInvoke("events", CACHE_TTL.events, () => window.playbound.getEvents?.())) || {
      events: [],
    };
  const events = filterRelatedByDiscovery(res.events || [], (ev) => ev.gameSlug);
  const sectionsHost = document.getElementById("events-sections");

  const pastRes =
    (await cacheInvoke("events-past", CACHE_TTL.events, () =>
      window.playbound.getEvents?.({ past: true })
    )) || { events: [] };
  const pastAll = filterRelatedByDiscovery(pastRes.events || [], (ev) => ev.gameSlug);

  /*
   * Same exclusive groupings as the website. One card per section — without
   * that a featured live Game Night showed up three times.
   */
  const now = Date.now();
  const startOf = (ev) => (ev.startsAt ? new Date(ev.startsAt).getTime() : 0);
  const claimed = new Set();
  const take = (predicate) => {
    const items = events.filter((ev) => !claimed.has(ev.id) && predicate(ev));
    for (const ev of items) claimed.add(ev.id);
    return items;
  };
  const activeIds = new Set(events.map((ev) => ev.id));
  const pastOnly = pastAll
    .filter(
      (ev) =>
        !activeIds.has(ev.id) &&
        (ev.status === "completed" ||
          ev.status === "cancelled" ||
          (ev.endsAt && new Date(ev.endsAt).getTime() < now))
    )
    .sort(
      (a, b) =>
        new Date(b.endsAt || b.startsAt).getTime() -
        new Date(a.endsAt || a.startsAt).getTime()
    )
    .slice(0, 6);

  const groups = [
    [
      "Happening soon",
      take(
        (ev) =>
          ev.status === "live" ||
          (startOf(ev) >= now && startOf(ev) - now < 48 * 3600_000)
      ),
    ],
    ["Featured", take((ev) => Boolean(ev.featured))],
    ["Game Nights", take((ev) => ev.eventType === "game_night")],
    ["Tournaments", take((ev) => ev.eventType === "tournament")],
    ["Parties", take((ev) => ev.eventType === "party")],
    ["Upcoming", events.filter((ev) => !claimed.has(ev.id))],
    ["Past events", pastOnly],
  ];

  if (sectionsHost) {
    sectionsHost.replaceChildren();
    if (!events.length && !pastOnly.length) {
      sectionsHost.innerHTML = `<p class="view-sub">No upcoming events. Host one with + Create Event above!</p>`;
    } else {
      if (!events.length) {
        const empty = document.createElement("p");
        empty.className = "view-sub";
        empty.textContent = "No upcoming events. Host one with + Create Event above!";
        sectionsHost.appendChild(empty);
      }
      for (const [title, items] of groups) {
        if (!items.length) continue;

        const section = document.createElement("section");
        section.className = "events-section";

        const heading = document.createElement("h2");
        heading.className = "events-section-title";
        heading.textContent = title;
        section.appendChild(heading);

        const grid = document.createElement("div");
        grid.className = "events-grid";
        for (const ev of items) grid.appendChild(createEventCard(ev));
        section.appendChild(grid);

        sectionsHost.appendChild(section);
      }
    }
  }

  markViewReady(container);
}

/* ═══════════════════════════════════════════════════════════════
 * 2. EVENT DETAIL VIEW (IN-LAUNCHER)
 * ═══════════════════════════════════════════════════════════════ */

async function renderEventDetailView(eventId) {
  state.currentEventDetailId = eventId;
  const container = views.eventDetail;
  if (!container) return;

  container.innerHTML = `<p class="view-sub">Loading event details…</p>`;

  const data = await cacheInvoke(`event:${eventId}`, CACHE_TTL.eventDetail, () =>
    window.playbound.getEventDetail(eventId)
  );

  if (!data || !data.event) {
    container.innerHTML = `
      <div style="padding: 24px;">
        <button class="btn-secondary btn-sm" id="btn-event-detail-back" style="margin-bottom: 16px">← Back to Events</button>
        <p class="view-sub">Event not found or removed.</p>
      </div>
    `;
    container.querySelector("#btn-event-detail-back")?.addEventListener("click", () => {
      api.navigateTo(state.detailReturnView || "events");
    });
    return;
  }

  const { event, counts = { going: 0, maybe: 0 }, presence = { online: 0, playing: 0 }, game, myRsvp, organizer, tournament } = data;
  const isLive = event.status === "live";
  const whenStr = event.when?.dateLine
    ? `${event.when.dateLine} · ${event.when.timeLine || ""}`
    : formatEventDate(event.startsAt);
  const coverUrl = event.coverImage || game?.coverImage || null;

  const currentUser = state.accountState?.user;
  const isOrganizer = Boolean(
    currentUser && (organizer?.id === currentUser.id || event.organizerId === currentUser.id)
  );
  const isAdmin = currentUser?.role === "admin";
  const canManage = isOrganizer || isAdmin;

  container.innerHTML = `
    <div class="event-detail-wrap">
      <button class="btn-secondary btn-sm" id="btn-event-detail-back" style="align-self: flex-start;">
        ← Back to ${state.detailReturnView === "games" ? "Games" : "Events"}
      </button>

      ${
        coverUrl
          ? `
        <div class="event-detail-cover-wrap">
          <img src="${escapeHtml(coverUrl)}" class="event-detail-cover-img" alt="${escapeHtml(event.title)}" />
          <div class="event-detail-cover-overlay"></div>
        </div>`
          : ""
      }

      <!-- Hero Header -->
      <section class="event-detail-hero">
        <div class="pb-event-badges">
          ${isLive ? `<span class="pb-badge-live">● Live now</span>` : ""}
          <span class="pb-badge-type">${escapeHtml(eventTypeDisplay(event.eventType))}</span>
          ${event.hostType === "playbound" ? `<span class="pb-badge-type">PlayBound Hosted</span>` : ""}
          ${event.featured ? `<span class="pb-badge-featured">Featured</span>` : ""}
          ${event.status === "cancelled" ? `<span class="pb-badge-live" style="color:#f87171">Cancelled</span>` : ""}
        </div>

        <h1 class="event-detail-title">${escapeHtml(event.title)}</h1>

        ${
          game
            ? `
          <div class="event-detail-game-row">
            <span style="color:var(--text-dim);">Game:</span>
            <a class="event-detail-game-link" id="link-event-game" data-slug="${escapeHtml(game.slug)}">
              ${escapeHtml(game.title)}
            </a>
            ${event.editionSlug ? `<span style="color:var(--text-dim); font-size:13px;">· ${escapeHtml(event.editionSlug)}</span>` : ""}
          </div>`
            : event.gameSlug
              ? `<div class="event-detail-game-row"><span style="color:var(--text-dim);">Game:</span> <span>${escapeHtml(event.gameSlug)}</span></div>`
              : ""
        }

        <p class="pb-event-time" style="font-size: 13px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${escapeHtml(whenStr)}
        </p>

        <div class="event-detail-stats">
          <span class="event-stat-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${counts.going || 0} going${event.maxParticipants ? ` / ${event.maxParticipants}` : ""}
          </span>
          <span class="event-stat-pill online">● ${presence.online || 0} online</span>
          <span class="event-stat-pill playing">● ${presence.playing || 0} playing</span>
          ${counts.maybe > 0 ? `<span class="event-stat-pill">${counts.maybe} maybe</span>` : ""}
        </div>
      </section>

      <!-- Action Toolbar -->
      <div class="event-detail-toolbar">
        <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
          ${
            event.discordInviteUrl
              ? `<button class="btn-primary btn-sm" id="btn-event-detail-discord" type="button">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                  Join Discord
                </button>`
              : ""
          }
          ${
            game
              ? `<button class="btn-secondary btn-sm" id="btn-event-detail-play" type="button">
                  ${isLive ? "▶ Play Now" : "View Game"}
                </button>`
              : ""
          }
        </div>

        <!-- RSVP Buttons -->
        <div class="event-rsvp-container" id="event-rsvp-group">
          <button type="button" class="event-rsvp-btn ${myRsvp === "going" ? "active-going" : ""}" data-rsvp="going">✓ Going</button>
          <button type="button" class="event-rsvp-btn ${myRsvp === "maybe" ? "active-maybe" : ""}" data-rsvp="maybe">? Maybe</button>
          <button type="button" class="event-rsvp-btn ${myRsvp === "not_going" ? "active-not_going" : ""}" data-rsvp="not_going">✕ Can't Go</button>
        </div>

        ${
          canManage
            ? `
          <div style="display: flex; gap: 6px; align-items: center;">
            ${
              event.status !== "cancelled"
                ? `<button class="btn-secondary btn-sm" id="btn-event-cancel" style="color:var(--danger);" type="button">Cancel Event</button>`
                : ""
            }
            <button class="btn-secondary btn-sm" id="btn-event-delete" style="color:var(--danger);" type="button">Delete</button>
          </div>`
            : ""
        }
      </div>

      <!-- Description / About -->
      ${
        event.description
          ? `
        <section class="event-section-card">
          <h2 class="event-section-title">About Event</h2>
          <p style="margin: 0; line-height: 1.6; color: var(--text-dim); font-size: 14px; white-space: pre-line;">
            ${escapeHtml(event.description)}
          </p>
        </section>`
          : ""
      }

      <!-- Tournament Bracket / Matches Section (if tournament) -->
      ${
        tournament
          ? `
        <section class="event-section-card">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <h2 class="event-section-title">Tournament Bracket (${escapeHtml(tournament.format || "Single Elim")})</h2>
            <button class="btn-primary btn-sm" id="btn-tournament-checkin" type="button">Check In for Tournament</button>
          </div>
          <div id="tournament-bracket-slot" style="margin-top: 12px;">
            ${
              (tournament.matches || []).length > 0
                ? `<div class="tournament-bracket-wrap">
                    <div class="tournament-round-col">
                      <div class="tournament-round-header">Matches</div>
                      ${tournament.matches
                        .map(
                          (m) => `
                        <div class="tournament-match-box">
                          <div class="tournament-slot ${m.winnerParticipantId === m.participantAId && m.winnerParticipantId ? "winner" : ""}">
                            <span>${escapeHtml(m.participantAId || "TBD")}</span>
                            <span>${m.scoreA != null ? m.scoreA : "-"}</span>
                          </div>
                          <div class="tournament-slot ${m.winnerParticipantId === m.participantBId && m.winnerParticipantId ? "winner" : ""}">
                            <span>${escapeHtml(m.participantBId || "TBD")}</span>
                            <span>${m.scoreB != null ? m.scoreB : "-"}</span>
                          </div>
                        </div>`
                        )
                        .join("")}
                    </div>
                  </div>`
                : `<p class="view-sub" style="margin: 0;">Bracket will be generated when registration closes.</p>`
            }
          </div>
        </section>`
          : ""
      }
    </div>
  `;

  // Wire back button
  container.querySelector("#btn-event-detail-back")?.addEventListener("click", () => {
    api.navigateTo(state.detailReturnView || "events");
  });

  // Wire game link & play button
  if (game) {
    container.querySelector("#link-event-game")?.addEventListener("click", () => {
      api.openGameDetail(game.slug, "eventDetail");
    });
    container.querySelector("#btn-event-detail-play")?.addEventListener("click", () => {
      api.openGameDetail(game.slug, "eventDetail");
    });
  }

  // Wire Discord button
  container.querySelector("#btn-event-detail-discord")?.addEventListener("click", () => {
    if (event.discordInviteUrl) {
      window.playbound.openExternal(event.discordInviteUrl);
    }
  });

  // Wire RSVP buttons
  container.querySelectorAll(".event-rsvp-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const status = btn.dataset.rsvp;
      if (!status) return;
      try {
        setStatus(`Setting RSVP to ${status}…`);
        const res = await window.playbound.rsvpEvent(eventId, status);
        if (res && res.ok) {
          setStatus(`RSVP updated!`);
          cacheInvalidate(`event:${eventId}`);
          cacheInvalidate("events");
          markViewDirty(views.events);
          await renderEventDetailView(eventId);
        } else {
          setStatus(res?.error || "Failed to update RSVP. Please sign in first.", true);
        }
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  });

  // Wire Tournament Check-In
  container.querySelector("#btn-tournament-checkin")?.addEventListener("click", async () => {
    try {
      setStatus("Checking in for tournament…");
      const res = await window.playbound.tournamentAction(eventId, "check_in");
      if (res && res.ok) {
        setStatus("Checked in successfully!");
        cacheInvalidate(`event:${eventId}`);
        await renderEventDetailView(eventId);
      } else {
        setStatus(res?.error || "Check-in failed.", true);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  // Wire Cancel Event
  container.querySelector("#btn-event-cancel")?.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to cancel this event?")) return;
    try {
      setStatus("Cancelling event…");
      const res = await window.playbound.cancelEvent(eventId);
      if (res && res.ok) {
        setStatus("Event cancelled.");
        cacheInvalidate(`event:${eventId}`);
        cacheInvalidate("events");
        markViewDirty(views.events);
        await renderEventDetailView(eventId);
      } else {
        setStatus(res?.error || "Failed to cancel event.", true);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  // Wire Delete Event
  container.querySelector("#btn-event-delete")?.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to permanently delete this event? This cannot be undone.")) return;
    try {
      setStatus("Deleting event…");
      const res = await window.playbound.deleteEvent(eventId);
      if (res && res.ok) {
        setStatus("Event deleted.");
        cacheInvalidate(`event:${eventId}`);
        cacheInvalidate("events");
        markViewDirty(views.events);
        api.navigateTo("events");
      } else {
        setStatus(res?.error || "Failed to delete event.", true);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  markViewReady(container, eventId);
}

api.renderEventsView = renderEventsView;
api.renderEventDetailView = renderEventDetailView;

