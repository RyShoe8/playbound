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
  CACHE_TTL,
  cacheInvalidate,
  cacheInvoke,
  markViewDirty,
  markViewReady,
  setStatus,
  startGameSession,
  state,
  views,
} from "../shared.js";

async function renderEventsView() {
  const container = views.events;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Events</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Game Nights and tournaments — join, play, and host.</p>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <button class="btn-primary btn-sm" id="btn-create-event" type="button">+ Create Event</button>
        <button class="btn-secondary btn-sm" id="btn-open-events-web" type="button">Open playbound.club/events</button>
      </div>
    </div>
    <div id="events-banner" class="events-banner" style="margin-top: 16px"></div>
    <div id="events-list" class="events-list" style="margin-top: 20px"></div>

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

  // Populate games dropdown
  try {
    const catalog = await window.playbound.getCatalog();
    (catalog || []).forEach((g) => {
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

  const closeModal = () => {
    modal.classList.remove("open");
    if (errorMsg) errorMsg.style.display = "none";
  };

  openBtn?.addEventListener("click", () => {
    // Set default startsAt to next full hour
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    const startsInput = document.getElementById("event-starts-at");
    if (startsInput && !startsInput.value) startsInput.value = localIso;
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
      notifyStatus(`Event "${title}" created!`);
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
  const events = res.events || [];
  const list = document.getElementById("events-list");
  const banner = document.getElementById("events-banner");
  if (!events.length) {
    list.innerHTML = `<p class="view-sub">No upcoming events. Host one with + Create Event above!</p>`;
    markViewReady(container);
    return;
  }

  const live = events.find((ev) => ev.status === "live");
  const soon = events.find((ev) => {
    if (!ev.startsAt) return false;
    const ms = new Date(ev.startsAt).getTime() - Date.now();
    return ms > 0 && ms < 60 * 60 * 1000;
  });
  if (banner && (live || soon)) {
    const ev = live || soon;
    const href = ev.id
      ? `https://playbound.club/events/${encodeURIComponent(ev.id)}`
      : "https://playbound.club/events";
    banner.innerHTML = `
      <div class="event-row" style="border-color: var(--primary)">
        <div>
          <p class="event-when">${live ? "🔴 LIVE NOW" : "Starts within an hour"}</p>
          <p class="event-title">${escapeHtml(ev.title)}</p>
          <p class="event-desc">${escapeHtml(ev.gameSlug || "")}${
      ev.counts?.going != null ? ` · ${ev.counts.going} going` : ""
    }</p>
        </div>
        <button class="btn-primary btn-sm" type="button" id="btn-event-banner">${
          live ? "Join" : "View Event"
        }</button>
      </div>
    `;
    document.getElementById("btn-event-banner")?.addEventListener("click", () => {
      window.playbound.openExternal(href);
    });
  }

  list.replaceChildren();
  for (const ev of events) {
    const row = document.createElement("div");
    row.className = "event-row";
    const when =
      ev.when?.dateLine && ev.when?.timeLine
        ? `${ev.when.dateLine} · ${ev.when.timeLine}`
        : ev.startsAt
          ? new Date(ev.startsAt).toLocaleString()
          : "";
    const href = ev.id
      ? `https://playbound.club/events/${encodeURIComponent(ev.id)}`
      : "https://playbound.club/events";
    row.innerHTML = `
      <div>
        <p class="event-when">${escapeHtml(when)}${
      ev.status === "live" ? " · LIVE" : ""
    }</p>
        <p class="event-title">${escapeHtml(ev.title)}</p>
        <p class="event-desc">${escapeHtml(ev.description || "")}</p>
        ${
          ev.gameSlug
            ? `<p class="event-game">${escapeHtml(ev.gameSlug)}${
                ev.counts?.going != null ? ` · ${ev.counts.going} going` : ""
              }</p>`
            : ""
        }
      </div>
      <div style="display: flex; gap: 8px; flex-shrink: 0;">
        ${
          ev.discordInviteUrl
            ? `<button class="btn-primary btn-sm" type="button" data-discord="${escapeHtml(
                ev.discordInviteUrl
              )}">Join Discord</button>`
            : ""
        }
        <button class="btn-secondary btn-sm" type="button" data-view-event="1">View Event</button>
      </div>
    `;
    row.querySelector("[data-view-event]")?.addEventListener("click", () => {
      window.playbound.openExternal(href);
    });
    // Points at the event's own voice channel once the bot has provisioned it.
    row.querySelector("[data-discord]")?.addEventListener("click", (e) => {
      window.playbound.openExternal(e.currentTarget.dataset.discord);
    });
    list.appendChild(row);
  }
  markViewReady(container);
}

// ── Servers (Game + Mod dropdowns) ───────────────────────────

api.renderEventsView = renderEventsView;
