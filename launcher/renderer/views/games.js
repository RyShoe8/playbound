import { createGameCard } from "../cards.js";
import {
  api,
  enhanceSelect,
  escapeHtml,
  filterByCompatibility,
  markViewReady,
  state,
  views,
} from "../shared.js";

function ensureGamesShell() {
  const container = views.games;
  if (document.getElementById("games-grid")) return false;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Games</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Browse free PC games you can install with PlayBound.</p>
      </div>
      <button class="btn-secondary btn-sm" id="btn-open-web">Open playbound.club</button>
    </div>

    <div class="games-filters" id="games-filters">
      <input type="search" class="input-text" id="games-search" placeholder="Search title, tagline, tags…" value="${escapeHtml(state.gamesFilters.query)}" />
      <select class="input-text" id="games-genre">
        <option value="">All genres</option>
      </select>
      <select class="input-text" id="games-sort">
        <option value="name" ${state.gamesFilters.sort === "name" ? "selected" : ""}>Sort: Name</option>
        <option value="size" ${state.gamesFilters.sort === "size" ? "selected" : ""}>Sort: Size</option>
      </select>
      <label class="filter-check"><input type="checkbox" id="games-mp" ${state.gamesFilters.multiplayerOnly ? "checked" : ""} /> Multiplayer</label>
      <label class="filter-check"><input type="checkbox" id="games-installable" ${state.gamesFilters.installableOnly ? "checked" : ""} /> Installable</label>
    </div>
    <p class="view-sub" id="games-count" style="margin: 10px 0 0 0"></p>
    <div id="games-grid" class="game-grid" style="margin-top: 16px"></div>
  `;

  document.getElementById("btn-open-web").addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/discover");
  });

  const apply = () => paintGamesGrid(state.catalogCache);
  document.getElementById("games-search").addEventListener("input", (e) => {
    state.gamesFilters.query = e.target.value;
    apply();
  });
  document.getElementById("games-genre").addEventListener("change", (e) => {
    state.gamesFilters.genre = e.target.value;
    apply();
  });
  document.getElementById("games-sort").addEventListener("change", (e) => {
    state.gamesFilters.sort = e.target.value;
    apply();
  });
  document.getElementById("games-mp").addEventListener("change", (e) => {
    state.gamesFilters.multiplayerOnly = e.target.checked;
    apply();
  });
  document.getElementById("games-installable").addEventListener("change", (e) => {
    state.gamesFilters.installableOnly = e.target.checked;
    apply();
  });
  return true;
}

function syncGenreOptions(catalog) {
  const genreSelect = document.getElementById("games-genre");
  if (!genreSelect) return;
  const existing = new Set([...genreSelect.options].map((o) => o.value).filter(Boolean));
  const genreSet = new Set();
  for (const g of catalog) {
    for (const genre of g.genres || []) genreSet.add(genre);
  }
  let added = false;
  [...genreSet].sort().forEach((genre) => {
    if (existing.has(genre)) return;
    const opt = document.createElement("option");
    opt.value = genre;
    opt.textContent = genre;
    if (state.gamesFilters.genre === genre) opt.selected = true;
    genreSelect.appendChild(opt);
    added = true;
  });
  if (added) genreSelect._syncCustomSelect?.();
}

function parseSizeMB(label) {
  if (!label) return 0;
  const m = String(label).match(/([\d.]+)\s*(GB|MB)/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return /gb/i.test(m[2]) ? n * 1000 : n;
}

export function paintGamesGrid(catalog = state.catalogCache) {
  const q = state.gamesFilters.query.trim().toLowerCase();
  let list = filterByCompatibility(catalog.slice());

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
  if (state.gamesFilters.multiplayerOnly) {
    list = list.filter((g) => g.isMultiplayer ?? g.multiplayer);
  }
  if (state.gamesFilters.installableOnly) {
    list = list.filter((g) => g.kind && g.kind !== "external");
  }

  if (state.gamesFilters.sort === "size") {
    list.sort((a, b) => parseSizeMB(b.approxSize) - parseSizeMB(a.approxSize));
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
  grid.replaceChildren(...list.map(createGameCard));
}

async function renderGamesView() {
  const created = ensureGamesShell();
  const catalog =
    state.catalogCache.length > 0 ? state.catalogCache : await window.playbound.getCatalog();
  if (!state.catalogCache.length && Array.isArray(catalog)) state.catalogCache = catalog;
  syncGenreOptions(catalog);
  if (created) {
    const genreSelect = document.getElementById("games-genre");
    enhanceSelect(genreSelect);
    genreSelect?._syncCustomSelect?.();
  }
  paintGamesGrid(catalog);
  markViewReady(views.games);
}

api.renderGamesView = renderGamesView;
api.paintGamesGrid = paintGamesGrid;
