import { createGameCard } from "../cards.js";
import {
  api,
  enhanceSelect,
  escapeHtml,
  filterCatalogGames,
  filterGamesByPrice,
  loadPlayingNowBySlug,
  markViewReady,
  parsePriceFilter,
  state,
  views,
} from "../shared.js";

const PRICE_OPTIONS = [
  { label: "Any", value: "any" },
  { label: "Free", value: "free" },
  { label: "Under $5", value: "under5" },
  { label: "Under $10", value: "under10" },
  { label: "Under $15", value: "under15" },
];

const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function ensureGamesShell() {
  const container = views.games;
  if (document.getElementById("games-grid")) return false;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Games</h1>
        <p class="view-sub" style="margin: 5px 0 0">Free or regularly $15 or less. Tested by PlayBound, with one memorable reason to play.</p>
      </div>
      <button class="btn-secondary btn-sm" id="btn-open-web">Open playbound.club</button>
    </div>

    <!--
      Laid out like the website's discover filters: wrapping genre pills with
      counts, then one card holding sort and the secondary toggles with the
      game count on the right.
    -->
    <div class="genre-pills" id="games-genre-pills"></div>

    <!-- Tags, collapsed by default. Populated by syncTagOptions. -->
    <div class="games-tag-section" id="games-tag-section"></div>

    <div class="games-filter-card">
      <div class="games-filter-row">
        <div class="games-filter-group">
          <span class="games-filter-label">Sort:</span>
          <select class="input-text games-filter-select" id="games-sort">
            <option value="name" ${state.gamesFilters.sort === "name" ? "selected" : ""}>Name (A-Z)</option>
            <option value="players" ${state.gamesFilters.sort === "players" ? "selected" : ""}>Most Players</option>
          </select>
        </div>
        <p class="view-sub games-filter-count" id="games-count"></p>
      </div>
      <div class="games-filter-row games-price-row ${state.discoveryMode === "ALL" ? "is-visible" : ""}" id="games-price-row">
        <span class="games-filter-label">Price:</span>
        <div class="search-chips-wrap" id="games-price-chips"></div>
      </div>
      <div class="games-filter-row games-filter-row-secondary">
        <label class="pb-check">
          <input type="checkbox" class="pb-check-input" id="games-mp" ${state.gamesFilters.multiplayerOnly ? "checked" : ""} />
          <span class="pb-check-box" aria-hidden="true">${CHECK_ICON}</span>
          Multiplayer
        </label>
        <label class="pb-check">
          <input type="checkbox" class="pb-check-input" id="games-has-players" ${state.gamesFilters.hasPlayersOnly ? "checked" : ""} />
          <span class="pb-check-box" aria-hidden="true">${CHECK_ICON}</span>
          Has Players
        </label>
      </div>
    </div>
    <div id="games-grid" class="game-grid" style="margin-top: 16px"></div>
  `;

  document.getElementById("btn-open-web").addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/discover");
  });

  const apply = () => paintGamesGrid(state.catalogCache);
  document.getElementById("games-sort").addEventListener("change", (e) => {
    state.gamesFilters.sort = e.target.value;
    apply();
  });
  document.getElementById("games-mp").addEventListener("change", (e) => {
    state.gamesFilters.multiplayerOnly = e.target.checked;
    apply();
  });
  document.getElementById("games-has-players").addEventListener("change", (e) => {
    state.gamesFilters.hasPlayersOnly = e.target.checked;
    apply();
  });
  return true;
}

/**
 * Tag chips beneath the genre pills, collapsed until asked for.
 *
 * Counts come from the same base list the genre pills use, so picking one tag
 * narrows the rest the way faceted filters are expected to. Selected tags are
 * always rendered even at zero — a tag that filtered everything out would
 * otherwise disappear and leave no way to undo it.
 */
function syncTagOptions(catalog) {
  const host = document.getElementById("games-tag-section");
  if (!host) return;

  const filters = state.gamesFilters;
  const selected = Array.isArray(filters.tags) ? filters.tags : [];

  let base = filterCatalogGames(catalog);
  if (state.discoveryMode === "ALL") base = filterGamesByPrice(base, filters.price);
  if (filters.genre) base = base.filter((g) => (g.genres || []).includes(filters.genre));

  const counts = new Map();
  for (const g of base) {
    for (const tag of g.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  for (const t of selected) if (!counts.has(t)) counts.set(t, 0);
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (ordered.length === 0) {
    host.innerHTML = "";
    return;
  }

  const open = Boolean(filters.tagsOpen);
  const badge = selected.length
    ? `<span class="games-tag-badge">${selected.length}</span>`
    : "";

  const chips = ordered
    .map(([tag, count]) => {
      const on = selected.includes(tag);
      return `<button type="button" class="games-tag-chip${on ? " selected" : ""}" data-tag="${escapeHtml(
        tag
      )}" aria-pressed="${on}">${escapeHtml(tag)}<span class="games-tag-count">${count}</span></button>`;
    })
    .join("");

  const clear = selected.length
    ? `<button type="button" class="games-tag-clear" id="games-tag-clear">Clear</button>`
    : "";

  host.innerHTML = `
    <button type="button" class="games-tag-toggle" id="games-tag-toggle" aria-expanded="${open}">
      <span class="games-tag-caret${open ? " open" : ""}" aria-hidden="true">&#9656;</span>
      Tags${badge}
    </button>
    ${open ? `<div class="games-tag-chips">${chips}${clear}</div>` : ""}
  `;

  host.querySelector("#games-tag-toggle")?.addEventListener("click", () => {
    filters.tagsOpen = !filters.tagsOpen;
    syncTagOptions(catalog);
  });
  host.querySelectorAll("[data-tag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.tag || "";
      const next = selected.includes(tag)
        ? selected.filter((t) => t !== tag)
        : [...selected, tag];
      filters.tags = next;
      paintGamesGrid(catalog);
    });
  });
  host.querySelector("#games-tag-clear")?.addEventListener("click", () => {
    filters.tags = [];
    paintGamesGrid(catalog);
  });
}

/**
 * Genre pills with counts, matching the website's discover filters.
 *
 * Counts come from the compatibility + discovery-filtered catalog so a pill
 * never promises more games than clicking it will show.
 */
function syncGenreOptions(catalog) {
  const host = document.getElementById("games-genre-pills");
  if (!host) return;

  const base = (() => {
    let list = filterCatalogGames(catalog);
    if (state.discoveryMode === "ALL") list = filterGamesByPrice(list, state.gamesFilters.price);
    return list;
  })();
  const counts = new Map();
  for (const g of base) {
    for (const genre of g.genres || []) counts.set(genre, (counts.get(genre) || 0) + 1);
  }
  const ordered = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const pill = (value, label, count) => {
    const selected = state.gamesFilters.genre === value;
    return `<button type="button" class="genre-pill${selected ? " selected" : ""}" data-genre="${escapeHtml(
      value
    )}"><span>${escapeHtml(label)}</span><span class="genre-pill-count">${count}</span></button>`;
  };

  host.innerHTML = [
    pill("", "All", base.length),
    ...ordered.map(([genre, count]) => pill(genre, genre, count)),
  ].join("");

  host.querySelectorAll("[data-genre]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.genre || "";
      // Clicking the active pill clears it, as the website's does.
      state.gamesFilters.genre = state.gamesFilters.genre === value ? "" : value;
      paintGamesGrid(catalog);
    });
  });
}

function syncPriceChips() {
  const row = document.getElementById("games-price-row");
  const host = document.getElementById("games-price-chips");
  if (!row || !host) return;
  const show = state.discoveryMode === "ALL";
  row.classList.toggle("is-visible", show);
  if (!show) return;
  const current = parsePriceFilter(state.gamesFilters.price);
  host.innerHTML = PRICE_OPTIONS.map(
    (o) =>
      `<button type="button" class="filter-chip ${current === o.value ? "active" : ""}" data-price="${o.value}">${o.label}</button>`
  ).join("");
  host.querySelectorAll("[data-price]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.gamesFilters.price = parsePriceFilter(btn.dataset.price);
      paintGamesGrid(state.catalogCache);
    });
  });
}

function parseSizeMB(label) {
  if (!label) return 0;
  const m = String(label).match(/([\d.]+)\s*(GB|MB)/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return /gb/i.test(m[2]) ? n * 1000 : n;
}

export function paintGamesGrid(catalog = state.catalogCache) {
  syncGenreOptions(catalog);
  syncTagOptions(catalog);
  syncPriceChips();
  const q = state.gamesFilters.query.trim().toLowerCase();
  let list = filterCatalogGames(catalog.slice());
  if (state.discoveryMode === "ALL") {
    list = filterGamesByPrice(list, state.gamesFilters.price);
  }

  if (q) {
    list = list.filter((g) => {
      const blob = [g.title, g.blurb, ...(g.tags || []), ...(g.genres || []), g.slug]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }
  if (state.gamesFilters.genre) {
    list = list.filter((g) => (g.genres || []).includes(state.gamesFilters.genre));
  }
  /*
   * Every selected tag must match. Tags describe what a game is, so a second
   * one is meant to narrow — matching any would widen the results instead.
   */
  const selectedTags = Array.isArray(state.gamesFilters.tags) ? state.gamesFilters.tags : [];
  if (selectedTags.length > 0) {
    const wanted = selectedTags.map((t) => t.toLowerCase());
    list = list.filter((game) => {
      const has = new Set((game.tags || []).map((t) => t.toLowerCase()));
      return wanted.every((t) => has.has(t));
    });
  }
  if (state.gamesFilters.multiplayerOnly) {
    list = list.filter((g) => g.isMultiplayer ?? g.multiplayer);
  }
  /*
   * Has Players reads the same shared 15-minute snapshot the cards do, so the
   * filter and the "N playing" on each card can never disagree. A slug absent
   * from the snapshot has nobody in it.
   */
  if (state.gamesFilters.hasPlayersOnly) {
    list = list.filter((g) => (gamesPlayingNow.get(g.slug) || 0) > 0);
  }

  if (state.gamesFilters.sort === "players") {
    list.sort(
      (a, b) =>
        (gamesPlayingNow.get(b.slug) || 0) - (gamesPlayingNow.get(a.slug) || 0) ||
        String(a.title).localeCompare(String(b.title))
    );
  } else {
    list.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  }

  const count = document.getElementById("games-count");
  if (count) count.textContent = `${list.length} game${list.length === 1 ? "" : "s"}`;

  const grid = document.getElementById("games-grid");
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<p class="view-sub" style="grid-column:1/-1">No games match your filters.</p>`;
    return;
  }
  grid.replaceChildren(...list.map((game) => createGameCard(game, gamesPlayingNow.get(game.slug))));
}

/** One shared snapshot for the whole grid, not a request per card. */
let gamesPlayingNow = new Map();

async function renderGamesView() {
  const created = ensureGamesShell();
  const catalog =
    state.catalogCache.length > 0 ? state.catalogCache : await window.playbound.getCatalog();
  if (!state.catalogCache.length && Array.isArray(catalog)) state.catalogCache = catalog;
  syncGenreOptions(catalog);
  syncTagOptions(catalog);
  if (created) {
    // The genre select is a pill row now; sort is the only dropdown left.
    const sortSelect = document.getElementById("games-sort");
    enhanceSelect(sortSelect);
    sortSelect?._syncCustomSelect?.();
  }
  paintGamesGrid(catalog);
  markViewReady(views.games);

  // Painted without counts first so the grid is not held up by the network,
  // then repainted once the 15-minute snapshot resolves (usually from cache).
  const counts = await loadPlayingNowBySlug();
  if (counts.size > 0) {
    gamesPlayingNow = counts;
    if (state.currentView === "games") paintGamesGrid(catalog);
  }
}

api.renderGamesView = renderGamesView;
api.paintGamesGrid = paintGamesGrid;
