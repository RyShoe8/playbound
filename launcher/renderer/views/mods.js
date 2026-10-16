import { createModCard } from "../cards.js";
import {
  api,
  CACHE_TTL,
  cacheInvoke,
  enhanceSelect,
  escapeHtml,
  filterRelatedByDiscovery,
  isModDesktopCompatible,
  markViewReady,
  prefetchModDetail,
  setProgress,
  setStatus,
  state,
  views,
} from "../shared.js";

function ensureModsShell() {
  const container = views.mods;
  if (document.getElementById("mods-grid")) return false;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Mods</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Browse mods you can install with PlayBound.</p>
      </div>
      <button class="btn-secondary btn-sm" id="btn-open-mods-web">Open playbound.club/mods</button>
    </div>
    <div class="games-filters" id="mods-filters">
      <input type="search" class="input-text" id="mods-search" placeholder="Search mods or games…" />
      <select class="input-text" id="mods-game" aria-label="Filter by game">
        <option value="">All games</option>
      </select>
    </div>
    <p class="view-sub" id="mods-count" style="margin: 10px 0 0 0"></p>
    <div id="mods-grid" class="game-grid" style="margin-top: 16px"></div>
  `;
  document.getElementById("btn-open-mods-web")?.addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/mods");
  });
  document.getElementById("mods-search")?.addEventListener("input", () => paintModsGrid());
  document.getElementById("mods-game")?.addEventListener("change", () => paintModsGrid());
  return true;
}

function syncModGameOptions(mods) {
  const gameSelect = document.getElementById("mods-game");
  if (!gameSelect) return;
  const previous = gameSelect.value;
  const gameOptions = new Map();
  for (const m of mods) {
    if (m.baseGameSlug && !gameOptions.has(m.baseGameSlug)) {
      gameOptions.set(m.baseGameSlug, m.baseGameTitle
        || state.catalogCache.find(game => game.slug === m.baseGameSlug)?.title
        || m.baseGameSlug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '));
    }
  }
  gameSelect.innerHTML =
    `<option value="">All games</option>` +
    [...gameOptions.entries()]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
      .map(([slug, title]) => `<option value="${escapeHtml(slug)}">${escapeHtml(title)}</option>`)
      .join("");
  gameSelect.value = gameOptions.has(previous) ? previous : "";
  enhanceSelect(gameSelect);
  gameSelect._syncCustomSelect?.();
}

export function paintModsGrid() {
  const mods = Array.isArray(state._modsCatalog) ? state._modsCatalog : [];
  const search = document.getElementById("mods-search");
  const gameSelect = document.getElementById("mods-game");
  const q = (search?.value || "").trim().toLowerCase();
  let list = mods.slice();
  if (state.compatibilityFilter === "compatible") {
    list = list.filter(isModDesktopCompatible);
  }
  list = filterRelatedByDiscovery(list, (m) => m.baseGameSlug);
  syncModGameOptions(list);
  const gameSlug = gameSelect?.value || "";
  if (gameSlug) list = list.filter((m) => m.baseGameSlug === gameSlug);
  if (q) {
    list = list.filter((m) =>
      [m.title, m.tagline, m.slug, m.baseGameTitle, m.baseGameSlug].join(" ").toLowerCase().includes(q)
    );
  }
  list.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  const count = document.getElementById("mods-count");
  if (count) count.textContent = `${list.length} mod${list.length === 1 ? "" : "s"}`;
  const grid = document.getElementById("mods-grid");
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<p class="view-sub" style="grid-column:1/-1">No mods match.</p>`;
    return;
  }
  /*
   * 460-odd cards built in one go held the page for the better part of a second. The first
   * screenful goes in at once and the rest follows in small batches between frames; a newer
   * paint (typing in the search box, say) cancels the batches still queued.
   */
  const token = (paintModsGrid._token = (paintModsGrid._token || 0) + 1);
  const FIRST = 36, BATCH = 60;
  grid.replaceChildren(...list.slice(0, FIRST).map((mod) => createModCard(mod)));
  let next = FIRST;
  const more = () => {
    if (token !== paintModsGrid._token || next >= list.length) return;
    grid.append(...list.slice(next, next + BATCH).map((mod) => createModCard(mod)));
    next += BATCH;
    setTimeout(more, 16);
  };
  setTimeout(more, 16);
}

async function renderModsView() {
  const created = ensureModsShell();
  const res = await cacheInvoke("mods", CACHE_TTL.mods, () => window.playbound.getModsCatalog());
  const mods = res?.mods || [];
  state._modsCatalog = mods;
  if (created) {
    const gameSelect = document.getElementById("mods-game");
    enhanceSelect(gameSelect);
  }
  paintModsGrid();
  markViewReady(views.mods);
}

api.renderModsView = renderModsView;
api.paintModsGrid = paintModsGrid;
