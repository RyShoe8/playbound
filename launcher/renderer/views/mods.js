import {
  api,
  CACHE_TTL,
  cacheInvoke,
  enhanceSelect,
  escapeHtml,
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
  const existing = new Set([...gameSelect.options].map((o) => o.value).filter(Boolean));
  const gameOptions = new Map();
  for (const m of mods) {
    if (m.baseGameSlug && !gameOptions.has(m.baseGameSlug)) {
      gameOptions.set(m.baseGameSlug, m.baseGameTitle || m.baseGameSlug);
    }
  }
  let added = false;
  [...gameOptions.entries()]
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .forEach(([slug, title]) => {
      if (existing.has(slug)) return;
      const opt = document.createElement("option");
      opt.value = slug;
      opt.textContent = title;
      gameSelect.appendChild(opt);
      added = true;
    });
  if (added) gameSelect._syncCustomSelect?.();
}

export function paintModsGrid() {
  const mods = Array.isArray(state._modsCatalog) ? state._modsCatalog : [];
  const search = document.getElementById("mods-search");
  const gameSelect = document.getElementById("mods-game");
  const q = (search?.value || "").trim().toLowerCase();
  const gameSlug = gameSelect?.value || "";
  let list = mods.slice();
  if (state.compatibilityFilter === "compatible") {
    list = list.filter(isModDesktopCompatible);
  }
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
  grid.replaceChildren(
    ...list.map((mod) => {
      const card = document.createElement("div");
      card.className = "game-card";
      const bgGrad =
        Array.isArray(mod.art) && mod.art.length >= 2
          ? `linear-gradient(135deg, ${mod.art[0]}, ${mod.art[1]})`
          : `linear-gradient(135deg, #312e81, #a78bfa)`;
      card.innerHTML = `
          <div class="card-banner" style="background:${bgGrad}">${escapeHtml((mod.title || "?").charAt(0))}</div>
          <div class="card-body">
            <div class="card-title">${escapeHtml(mod.title)}</div>
            <div class="card-blurb">${escapeHtml(mod.tagline || mod.baseGameTitle || mod.baseGameSlug || "")}</div>
            <div class="card-tags">${[mod.license, mod.baseGameTitle]
              .filter(Boolean)
              .slice(0, 3)
              .map((c) => `<span class="chip">${escapeHtml(c)}</span>`)
              .join("")}</div>
            <div class="card-footer">
              <span style="font-size: 11px; color: var(--text-dim);">${escapeHtml([mod.baseGameTitle ? `For ${mod.baseGameTitle}` : (mod.baseGameSlug ? `For ${mod.baseGameSlug}` : null), mod.approxSize].filter(Boolean).join(" · "))}</span>
              <button class="btn-primary btn-sm btn-mod-install" type="button">Install</button>
            </div>
          </div>
        `;
      const coverUrl = mod.coverImage || mod.baseGameCoverImage || "";
      const useBaseFallback = !mod.coverImage && Boolean(mod.baseGameCoverImage);
      if (coverUrl) {
        const banner = card.querySelector(".card-banner");
        banner.textContent = "";
        const img = document.createElement("img");
        img.className = "card-cover";
        img.src = coverUrl;
        img.alt = "";
        img.loading = "lazy";
        if (useBaseFallback) img.dataset.source = "base-game";
        banner.appendChild(img);
      }
      card.addEventListener(
        "pointerenter",
        () => {
          api.prefetchView?.("modDetail");
          prefetchModDetail(mod.slug);
        },
        { once: true }
      );
      card.querySelector(".btn-mod-install")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          setStatus(`Installing ${mod.title}…`);
          const result = await window.playbound.installMod(mod.slug);
          if (result?.status === "external" || result?.status === "external-opened") {
            setStatus("Opened download page in browser.");
          } else {
            setStatus(`Installed ${mod.title}`);
          }
          setProgress(null);
        } catch (err) {
          setStatus(err.message || String(err), true);
          setProgress(null);
        }
      });
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        api.openModDetail(mod.slug, "mods");
      });
      return card;
    })
  );
}

async function renderModsView() {
  const created = ensureModsShell();
  const res = await cacheInvoke("mods", CACHE_TTL.mods, () => window.playbound.getModsCatalog());
  const mods = res?.mods || [];
  state._modsCatalog = mods;
  syncModGameOptions(mods);
  if (created) {
    const gameSelect = document.getElementById("mods-game");
    enhanceSelect(gameSelect);
    gameSelect?._syncCustomSelect?.();
  }
  paintModsGrid();
  markViewReady(views.mods);
}

api.renderModsView = renderModsView;
api.paintModsGrid = paintModsGrid;
