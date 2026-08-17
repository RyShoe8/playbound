import { createGameCard } from "../cards.js";
import {
  api,
  escapeHtml,
  filterByCompatibility,
  loadPlayingNowBySlug,
  markViewReady,
  state,
  views,
} from "../shared.js";

export const GENRES = [
  "Strategy",
  "RTS",
  "FPS",
  "Racing",
  "Puzzle",
  "RPG",
  "Roguelike",
  "Simulation",
  "Platformer",
  "Sandbox",
  "Tower Defense",
  "Space",
  "Arcade",
  "Pirate",
  "MMO",
  "Survival",
  "Shooter",
  "Action",
  "Adventure",
  "Sports",
  "Fighting",
  "Social Deduction",
  "Card Game",
  "Idle",
  "Horror",
  "MOBA",
  "Party Game",
];

export const TAGS = [
  "Co-op",
  "Open Source",
  "Remake",
  "Physics",
  "Retro",
  "Turn-Based",
  "Tactical",
  "City Builder",
  "Management",
  "Deckbuilder",
  "Pixel Art",
  "Sci-Fi",
  "Fantasy",
  "Cyberpunk",
  "Post-Apocalyptic",
  "Zombies",
  "Anime",
  "Atmospheric",
  "Casual",
  "Hardcore",
  "Competitive",
  "PvE",
  "PvP",
  "Class-Based",
  "Crafting",
  "Economy",
  "Fast-Paced",
  "Grid-Based",
  "Isometric",
  "Local Multiplayer",
  "Minigames",
  "Modular",
  "Naval",
  "Nostalgic",
  "Resource Management",
  "Turn-Based Tactics",
  "Voxel",
];

export const PLATFORMS = ["Windows", "macOS", "Linux", "Android", "iOS", "Web"];

export const FEATURES = [
  "Multiplayer",
  "Singleplayer",
  "Co-op",
  "Couch Co-Op",
  "Split-Screen Co-op",
  "Hotseat",
  "LAN Support",
  "Dedicated Servers",
  "Cross-play",
  "Controller Support",
  "Family Friendly",
  "Mod Support",
  "Map Editor",
  "Level Editor",
  "Custom Maps",
  "Community Content",
  "Replays",
  "Ranked Ladder",
  "Spectator Mode",
  "Story Campaign",
  "Daily Runs",
  "Procedural Worlds",
  "Team Play",
];

const SORT_OPTIONS = [
  { label: "Title", value: "title" },
  { label: "Release Year", value: "releaseYear" },
  { label: "Players", value: "players" },
  { label: "Plays", value: "plays" },
];

let searchPlayingNow = new Map();

function ensureSearchShell() {
  const container = views.search;
  if (!container) return false;
  if (document.getElementById("search-games-grid")) return false;

  container.innerHTML = `
    <div class="search-filters-card">
      <div class="search-filters-header">
        <div class="search-filters-title-row">
          <svg class="search-filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="4" y1="21" x2="4" y2="14"></line>
            <line x1="4" y1="10" x2="4" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12" y2="3"></line>
            <line x1="20" y1="21" x2="20" y2="16"></line>
            <line x1="20" y1="12" x2="20" y2="3"></line>
            <line x1="1" y1="14" x2="7" y2="14"></line>
            <line x1="9" y1="8" x2="15" y2="8"></line>
            <line x1="17" y1="16" x2="23" y2="16"></line>
          </svg>
          <span class="search-filters-heading">Filters</span>
          <span id="search-active-count" class="search-badge hidden">0</span>
        </div>
        <button type="button" id="search-clear-all" class="search-clear-btn-text hidden">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          Clear all
        </button>
      </div>

      <div class="search-filter-group">
        <p class="search-filter-group-label">Genres</p>
        <div class="search-chips-wrap" id="search-genre-chips"></div>
      </div>

      <div class="search-filter-group">
        <p class="search-filter-group-label">Tags</p>
        <div class="search-chips-wrap" id="search-tag-chips"></div>
      </div>

      <div class="search-filter-group">
        <p class="search-filter-group-label">Platforms</p>
        <div class="search-chips-wrap" id="search-platform-chips"></div>
      </div>

      <details class="search-details-group">
        <summary class="search-filter-group-label search-details-summary">
          <svg class="chevron-icon" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          Features
          <span id="search-features-count" class="search-badge hidden">0</span>
        </summary>
        <div class="search-chips-wrap" id="search-feature-chips" style="margin-top: 8px;"></div>
      </details>

      <div class="search-sort-row">
        <div class="search-sort-group">
          <p class="search-filter-group-label">Sort by</p>
          <div class="search-chips-wrap" id="search-sort-chips"></div>
        </div>
        <div class="search-result-summary">
          <h1 class="search-summary-title">Search</h1>
          <p class="search-summary-sub" id="search-result-label">Search games or use the filters above.</p>
        </div>
      </div>
    </div>

    <div id="search-empty-hint" class="search-empty-hint hidden"></div>
    <div id="search-games-grid" class="game-grid" style="margin-top: 20px;"></div>
  `;

  document.getElementById("search-clear-all")?.addEventListener("click", () => {
    state.searchFilters.genres = [];
    state.searchFilters.tags = [];
    state.searchFilters.platforms = [];
    state.searchFilters.features = [];
    state.searchFilters.sort = "title";
    state.searchFilters.sortDir = "asc";
    state.searchFilters.q = "";
    state.searchQuery = "";
    const globalInput = document.getElementById("global-search-input");
    const globalClear = document.getElementById("global-search-clear");
    if (globalInput) globalInput.value = "";
    if (globalClear) globalClear.classList.add("hidden");
    paintSearchResults(state.catalogCache);
  });

  return true;
}

function renderChips(containerId, items, activeSet, onToggle) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = items
    .map((item) => {
      const active = activeSet.has(item);
      return `<button type="button" class="filter-chip ${active ? "active" : ""}" data-item="${escapeHtml(item)}">${escapeHtml(item)}</button>`;
    })
    .join("");

  container.querySelectorAll(".filter-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      onToggle(btn.dataset.item);
    });
  });
}

export function paintSearchResults(catalog = state.catalogCache) {
  ensureSearchShell();

  const q = (state.searchQuery || state.searchFilters.q || "").trim().toLowerCase();
  const genreSet = new Set(state.searchFilters.genres || []);
  const tagSet = new Set(state.searchFilters.tags || []);
  const platformSet = new Set(state.searchFilters.platforms || []);
  const featureSet = new Set(state.searchFilters.features || []);
  const sort = state.searchFilters.sort || "title";
  const sortDir = state.searchFilters.sortDir || "asc";

  const activeCount =
    genreSet.size + tagSet.size + platformSet.size + featureSet.size;

  const activeBadge = document.getElementById("search-active-count");
  const clearAllBtn = document.getElementById("search-clear-all");
  const featuresCountBadge = document.getElementById("search-features-count");

  if (activeBadge) {
    if (activeCount > 0) {
      activeBadge.textContent = String(activeCount);
      activeBadge.classList.remove("hidden");
    } else {
      activeBadge.classList.add("hidden");
    }
  }

  if (clearAllBtn) {
    clearAllBtn.classList.toggle("hidden", activeCount === 0 && !q);
  }

  if (featuresCountBadge) {
    if (featureSet.size > 0) {
      featuresCountBadge.textContent = String(featureSet.size);
      featuresCountBadge.classList.remove("hidden");
    } else {
      featuresCountBadge.classList.add("hidden");
    }
  }

  // Render filter chips
  renderChips("search-genre-chips", GENRES, genreSet, (item) => {
    if (genreSet.has(item)) genreSet.delete(item);
    else genreSet.add(item);
    state.searchFilters.genres = Array.from(genreSet);
    paintSearchResults(catalog);
  });

  renderChips("search-tag-chips", TAGS, tagSet, (item) => {
    if (tagSet.has(item)) tagSet.delete(item);
    else tagSet.add(item);
    state.searchFilters.tags = Array.from(tagSet);
    paintSearchResults(catalog);
  });

  renderChips("search-platform-chips", PLATFORMS, platformSet, (item) => {
    if (platformSet.has(item)) platformSet.delete(item);
    else platformSet.add(item);
    state.searchFilters.platforms = Array.from(platformSet);
    paintSearchResults(catalog);
  });

  renderChips("search-feature-chips", FEATURES, featureSet, (item) => {
    if (featureSet.has(item)) featureSet.delete(item);
    else featureSet.add(item);
    state.searchFilters.features = Array.from(featureSet);
    paintSearchResults(catalog);
  });

  // Render sort chips
  const sortHost = document.getElementById("search-sort-chips");
  if (sortHost) {
    sortHost.innerHTML = `
      ${SORT_OPTIONS.map(
        (o) =>
          `<button type="button" class="filter-chip ${sort === o.value ? "active" : ""}" data-sort="${o.value}">${o.label}</button>`
      ).join("")}
      <button type="button" class="filter-chip active" id="search-toggle-sort-dir">${
        sortDir === "asc" ? "↑ Asc" : "↓ Desc"
      }</button>
    `;
    sortHost.querySelectorAll("[data-sort]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.searchFilters.sort = btn.dataset.sort;
        paintSearchResults(catalog);
      });
    });
    document.getElementById("search-toggle-sort-dir")?.addEventListener("click", () => {
      state.searchFilters.sortDir = sortDir === "asc" ? "desc" : "asc";
      paintSearchResults(catalog);
    });
  }

  // Filter games from catalog
  let list = filterByCompatibility(catalog).slice();

  if (q) {
    list = list.filter((g) => {
      const blob = `${g.title || ""} ${g.tagline || ""} ${g.description || ""} ${(g.genres || []).join(" ")} ${(g.tags || []).join(" ")} ${(g.features || []).join(" ")}`
        .toLowerCase();
      return blob.includes(q);
    });
  }

  if (genreSet.size > 0) {
    list = list.filter((g) => (g.genres || []).some((gen) => genreSet.has(gen)));
  }

  if (tagSet.size > 0) {
    list = list.filter((g) => (g.tags || []).some((t) => tagSet.has(t)));
  }

  if (platformSet.size > 0) {
    list = list.filter((g) => (g.platforms || []).some((p) => platformSet.has(p)));
  }

  if (featureSet.size > 0) {
    list = list.filter((g) => (g.features || []).some((f) => featureSet.has(f)));
  }

  // Sort games
  const dir = sortDir === "desc" ? -1 : 1;
  if (sort === "releaseYear") {
    list.sort((a, b) => ((Number(a.releaseYear) || 0) - (Number(b.releaseYear) || 0)) * dir);
  } else if (sort === "players") {
    list.sort(
      (a, b) =>
        ((searchPlayingNow.get(b.slug) || 0) - (searchPlayingNow.get(a.slug) || 0)) * dir ||
        String(a.title).localeCompare(String(b.title))
    );
  } else if (sort === "plays") {
    list.sort(
      (a, b) =>
        ((Number(b.plays) || 0) - (Number(a.plays) || 0)) * dir ||
        String(a.title).localeCompare(String(b.title))
    );
  } else {
    list.sort((a, b) => String(a.title).localeCompare(String(b.title)) * dir);
  }

  const resultLabel = document.getElementById("search-result-label");
  if (resultLabel) {
    if (!q && activeCount === 0) {
      resultLabel.textContent = `Browsing all ${list.length} games. Click any tag or type above to filter.`;
    } else {
      resultLabel.textContent = `${list.length} result${list.length === 1 ? "" : "s"}${
        q ? ` for “${escapeHtml(q)}”` : ""
      }`;
    }
  }

  const emptyHint = document.getElementById("search-empty-hint");
  const grid = document.getElementById("search-games-grid");

  if (!grid) return;

  if (list.length === 0) {
    if (emptyHint) {
      emptyHint.innerHTML = `
        <div class="search-empty-box">
          <p class="search-empty-title">Nothing matched your search</p>
          <p class="search-empty-sub">Try fewer filters, a different query, or clear your filters to explore the whole library.</p>
        </div>
      `;
      emptyHint.classList.remove("hidden");
    }
    grid.replaceChildren();
  } else {
    if (emptyHint) emptyHint.classList.add("hidden");
    grid.replaceChildren(...list.map((game) => createGameCard(game, searchPlayingNow.get(game.slug))));
  }
}

export async function renderSearchView() {
  ensureSearchShell();
  const catalog = state.catalogCache;
  searchPlayingNow = await loadPlayingNowBySlug();
  paintSearchResults(catalog);
  markViewReady(views.search);
}

api.renderSearchView = renderSearchView;
api.paintSearchResults = paintSearchResults;
