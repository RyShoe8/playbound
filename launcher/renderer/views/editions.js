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
  isEditionDesktopCompatible,
  isMacOS,
  sortEditionsByCompatibility,
  isModDesktopCompatible,
  selectExecutableLabel,
  setStatus,
  startGameSession,
  state,
  views,
} from "../shared.js";

async function renderEditionsView(gameSlugParam) {
  const gameSlug = gameSlugParam || editionsContextSlug();
  const container = views.editions;
  if (!container) return;

  if (!gameSlug) {
    container.innerHTML = `
      <div class="section-header" style="margin-top:0">
        <div>
          <h1 class="view-title" style="margin:0">Editions</h1>
          <p class="view-sub" style="margin:4px 0 0 0">Open a game first to browse its editions.</p>
        </div>
        <button class="btn-secondary btn-sm" id="btn-editions-to-games">Browse games</button>
      </div>
    `;
    document.getElementById("btn-editions-to-games")?.addEventListener("click", () => {
      api.navigateTo("games");
    });
    return;
  }

  state.currentDetailSlug = gameSlug;
  updateGamesFamilyNav();

  container.innerHTML = `
    <div class="section-header" style="margin-top:0">
      <div>
        <button type="button" class="btn-secondary btn-sm" id="editions-back-game">← Back to game</button>
        <h1 class="view-title" style="margin:12px 0 0 0">Editions</h1>
        <p class="view-sub" style="margin:4px 0 0 0" id="editions-sub">Loading editions for ${escapeHtml(gameSlug)}…</p>
      </div>
    </div>
    <div id="editions-grid" class="editions-grid" style="margin-top:20px"></div>
  `;

  document.getElementById("editions-back-game")?.addEventListener("click", () => {
    api.openGameDetail(gameSlug, "games");
  });

  let catalogTitle = gameSlug;
  let catalogGame = null;
  try {
    const catalogRes = await window.playbound.getCatalog?.();
    catalogGame = (catalogRes?.games || []).find((g) => g.slug === gameSlug) || null;
    if (catalogGame?.title) catalogTitle = catalogGame.title;
  } catch {
    /* ignore */
  }

  const sub = document.getElementById("editions-sub");
  if (sub) sub.textContent = `Alternate builds, community servers, and versions of ${catalogTitle}.`;

  const grid = document.getElementById("editions-grid");
  try {
    const res = await window.playbound.getEditions?.(gameSlug);
    let editions = res?.editions || [];
    if (!grid) return;
    editions = sortEditionsByCompatibility(editions, catalogGame);
    if (state.compatibilityFilter === "compatible") {
      editions = editions.filter((ed) => isEditionDesktopCompatible(ed, catalogGame));
    }
    if (!editions.length) {
      const hiddenByCompat =
        state.compatibilityFilter === "compatible" && (res?.editions || []).length > 0;
      grid.innerHTML = hiddenByCompat
        ? `<p class="view-sub" style="grid-column:1/-1">No compatible editions for this device. Switch to All Games to see every edition.</p>`
        : `<p class="view-sub" style="grid-column:1/-1">No editions listed for this game — the default install recipe is used.</p>`;
      return;
    }
    grid.replaceChildren(
      ...editions.map((ed) => {
        const card = document.createElement("div");
        card.className = "edition-card";
        const cover = ed.coverImage || ed.heroImage || "";
        const desc = ed.shortDescription || ed.description || "Alternate edition of this game.";
        card.innerHTML = `
          <div class="edition-card-banner">
            ${cover ? `<img class="edition-card-cover" src="${escapeHtml(cover)}" alt="" loading="lazy" />` : `<span>${escapeHtml((ed.editionName || "?").charAt(0))}</span>`}
            <div class="edition-card-gradient"></div>
          </div>
          <div class="edition-card-body">
            <div class="edition-card-header">
              <h3 class="edition-card-title">${escapeHtml(ed.editionName || ed.editionSlug)}</h3>
              ${ed.isDefault ? `<span class="edition-row-tag">Default</span>` : ""}
            </div>
            <p class="edition-card-desc">${escapeHtml(desc)}</p>
            <div class="edition-card-badges">
              ${ed.editionType ? `<span class="chip">${escapeHtml(ed.editionType)}</span>` : ""}
              ${(ed.tags || []).slice(0, 3).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("")}
              ${ed.verificationLevel ? `<span class="chip chip-accent">${escapeHtml(ed.verificationLevel)}</span>` : ""}
              ${ed.version ? `<span class="chip" style="font-size:10px">v${escapeHtml(ed.version)}</span>` : ""}
            </div>
            <div class="edition-card-footer">
              <button type="button" class="btn-primary btn-sm btn-ed-install">Install / Play</button>
              <button type="button" class="btn-secondary btn-sm btn-ed-details">Details →</button>
            </div>
          </div>
        `;
        card.querySelector(".btn-ed-details")?.addEventListener("click", (e) => {
          e.stopPropagation();
          api.openEditionDetail(gameSlug, ed.editionSlug);
        });
        card.querySelector(".btn-ed-install")?.addEventListener("click", (e) => {
          e.stopPropagation();
          api.openEditionDetail(gameSlug, ed.editionSlug);
        });
        card.addEventListener("click", () => {
          api.openEditionDetail(gameSlug, ed.editionSlug);
        });
        return card;
      })
    );
  } catch (err) {
    if (grid) {
      grid.innerHTML = `<p class="view-sub" style="grid-column:1/-1">${escapeHtml(
        err.message || String(err)
      )}</p>`;
    }
  }
}

api.renderEditionsView = renderEditionsView;
