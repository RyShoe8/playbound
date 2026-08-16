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
  setStatus,
  CACHE_TTL,
  cacheInvoke,
  markViewReady,
  startGameSession,
  state,
  views,
} from "../shared.js";

async function renderGearView() {
  const container = views.gear;
  if (!container) return;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0; flex-direction: column; align-items: stretch; gap: 8px;">
      <div style="text-align: center;">
        <h1 class="view-title" style="margin: 0">Gear</h1>
        <p class="view-sub" style="margin: 8px auto 0; max-width: 36rem;">
          Hardware recommendations driven by the games you actually play. Playbound Certified and tested by the community.
        </p>
      </div>
      <div style="display: flex; justify-content: flex-end;">
        <button class="btn-secondary btn-sm" id="btn-open-gear-web">Open playbound.club/gear</button>
      </div>
    </div>
    <div id="gear-directory" style="margin-top: 24px;">
      <p class="view-sub">Loading gear…</p>
    </div>
  `;

  document.getElementById("btn-open-gear-web")?.addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/gear");
  });

  const dir = document.getElementById("gear-directory");
  try {
    const res =
      (await cacheInvoke("gear", CACHE_TTL.gear, () => window.playbound.getGearCatalog?.())) || {};
    const categories = Array.isArray(res.categories) ? res.categories : [];
    const grouped = res.grouped && typeof res.grouped === "object" ? res.grouped : {};

    if (!categories.length) {
      dir.innerHTML = `<p class="view-sub" style="text-align:center;padding:40px 0;">Check back soon for our first batch of recommendations.</p>`;
      return;
    }

    dir.innerHTML = categories
      .map((category) => {
        const items = Array.isArray(grouped[category]) ? grouped[category] : [];
        const preview = items.slice(0, 4);
        const cards = preview
          .map((gear) => {
            const img = gear.coverImage
              ? `<img class="gear-card-img" src="${escapeHtml(gear.coverImage)}" alt="" loading="lazy" />`
              : `<div class="gear-card-img gear-card-img-fallback">${escapeHtml(
                  String(gear.category || "?").slice(0, 1)
                )}</div>`;
            const links = (gear.affiliateLinks || [])
              .map(
                (l) =>
                  `<button type="button" class="btn-secondary btn-sm gear-buy" data-url="${escapeHtml(
                    l.url
                  )}">Buy from ${escapeHtml(l.retailer)}${
                    l.price ? ` · ${escapeHtml(l.price)}` : ""
                  }</button>`
              )
              .join("");
            const certified = gear.playboundCertified
              ? `<span class="chip chip-accent">Playbound Certified</span>`
              : "";
            const detailUrl = `https://playbound.club/gear/${encodeURIComponent(
              String(gear.category || "").toLowerCase()
            )}/${encodeURIComponent(gear.slug)}`;
            return `
              <div class="gear-card">
                ${img}
                <div class="gear-card-body">
                  <div class="gear-card-title-row">
                    <button type="button" class="gear-card-title-btn" data-url="${escapeHtml(detailUrl)}">${escapeHtml(
                      gear.title
                    )}</button>
                    ${certified}
                  </div>
                  <p class="gear-card-desc">${escapeHtml(gear.description || "")}</p>
                  <div class="gear-card-actions">${links || `<button type="button" class="btn-secondary btn-sm" data-url="${escapeHtml(
                    detailUrl
                  )}">View on playbound.club</button>`}</div>
                </div>
              </div>
            `;
          })
          .join("");

        return `
          <section class="gear-category-section">
            <div class="gear-category-header">
              <h2 class="gear-category-title">${escapeHtml(category)}</h2>
              <button type="button" class="btn-secondary btn-sm gear-view-all" data-category="${escapeHtml(
                String(category).toLowerCase()
              )}">View all ${escapeHtml(category)} →</button>
            </div>
            <div class="gear-card-grid">${cards}</div>
          </section>
        `;
      })
      .join("");

    dir.querySelectorAll("[data-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const url = btn.getAttribute("data-url");
        if (!url) return;
        // Affiliate buy links must not get PlayBound UTMs.
        const skipUtm = btn.classList.contains("gear-buy");
        window.playbound.openExternal(url, skipUtm ? { skipUtm: true } : undefined);
      });
    });
    dir.querySelectorAll(".gear-view-all").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-category");
        window.playbound.openExternal(`https://playbound.club/gear/${encodeURIComponent(cat || "")}`);
      });
    });
  } catch (err) {
    dir.innerHTML = `<p class="view-sub" style="color: var(--danger)">Failed to load gear: ${escapeHtml(
      err?.message || String(err)
    )}</p>`;
  }
  markViewReady(container);
}

api.renderGearView = renderGearView;
