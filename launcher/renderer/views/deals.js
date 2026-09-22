import { createFreeOfferCard } from "../cards.js";
import {
  api,
  CACHE_TTL,
  cacheInvoke,
  escapeHtml,
  markViewReady,
  state,
  views,
} from "../shared.js";

/**
 * Game Deals — free store giveaways and discounted catalog games.
 *
 * Mirrors the website's /deals page, and reuses `createFreeOfferCard` for the
 * free half so a card only ever looks one way across the app. The discounted
 * half gets its own small builder rather than `createGameCard`: a game card is
 * built around install state and a Play button, and none of that applies to a
 * store link for something you do not own yet. The two say different things — a
 * giveaway is a countdown, a discount is a comparison.
 *
 * Both sections hide when empty rather than rendering an empty grid. For the
 * discounted half that is the common case, not an edge case: the catalog carries
 * roughly eighteen paid games, so a day with nothing on sale is normal.
 */

const DEALS_WEB_URL = "https://playbound.club/deals";

/** `599` → `"$5.99"`. Mirrors formatCents in platform/src/lib/deals.ts. */
function formatCents(cents, currency = "USD") {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "";
  const symbol = currency === "USD" ? "$" : "";
  return `${symbol}${(n / 100).toFixed(2)}`;
}

function createDiscountCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const art = document.createElement("div");
  art.className = "card-art";
  const from = game.art?.from || "#1e1b4b";
  const to = game.art?.to || "#312e81";
  art.style.background = `linear-gradient(135deg, ${from}, ${to})`;

  const fallback = document.createElement("span");
  fallback.className = "card-art-fallback";
  fallback.textContent = (game.title || "?").charAt(0);
  art.appendChild(fallback);

  if (game.coverImage) {
    /*
     * A plain <img>, like every other cover in the launcher. No next/image and
     * no optimizer here, which is why the Amazon and Alienware covers that broke
     * on the website were always fine in the desktop app.
     */
    const img = document.createElement("img");
    img.className = "card-cover";
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("load", () => img.classList.add("is-loaded"));
    img.addEventListener("error", () => img.remove());
    img.src = game.coverImage;
    art.appendChild(img);
  }

  const titleOverlay = document.createElement("div");
  titleOverlay.className = "card-art-title";
  titleOverlay.innerHTML = `<span class="card-title-text">${escapeHtml(game.title || "")}</span>`;
  art.appendChild(titleOverlay);

  const pct = Number(game.percentOff);
  if (Number.isFinite(pct) && pct > 0) {
    const badge = document.createElement("div");
    badge.className = "card-incompatible-corner";
    badge.style.background = "rgba(16, 185, 129, 0.9)";
    badge.textContent = `-${Math.floor(pct)}%`;
    art.appendChild(badge);
  }

  card.appendChild(art);

  /*
   * Footer built from the same `card-meta` / `card-tags` / `chip` vocabulary as
   * createFreeOfferCard and createGameCard, so this needs no new CSS and cannot
   * drift visually from the cards beside it. The struck-through chip for the old
   * price is lifted straight from the free-offer card's retailPrice chip.
   */
  const footer = document.createElement("div");
  footer.className = "card-meta";
  const current = formatCents(game.currentPriceCents, game.currency);
  const regular = formatCents(game.regularPriceCents, game.currency);
  footer.innerHTML = `
    <div class="card-tags">
      ${
        regular
          ? `<span class="chip" style="text-decoration: line-through; opacity: 0.6;">${escapeHtml(regular)}</span>`
          : ""
      }
      <span class="chip" style="color: var(--color-play, #34d27b); font-weight: 700;">${escapeHtml(current)}</span>
      ${game.storeName ? `<span class="chip">${escapeHtml(game.storeName)}</span>` : ""}
    </div>
  `;
  card.appendChild(footer);

  /*
   * Whole-card click, like every other card in the launcher. It goes to the
   * game's own detail view rather than the store: this is a catalog game, so
   * PlayBound has editorial, install and multiplayer information for it, and the
   * detail view already carries the store link.
   */
  card.addEventListener("click", () => {
    api.openGameDetail?.(game.slug, state.currentView);
  });

  return card;
}

async function renderDealsView() {
  const container = views.deals;
  if (!container) return;

  container.innerHTML = `
    <div class="gear-header-row">
      <div class="gear-header-copy">
        <h1 class="view-title">Game Deals</h1>
        <p class="view-sub">
          Everything worth playing that costs little or nothing right now — live store
          giveaways alongside catalog games selling below their usual price.
        </p>
      </div>
      <button class="btn-secondary btn-sm" id="btn-open-deals-web">Open playbound.club/deals</button>
    </div>
    <div id="deals-status" class="view-sub" style="padding: 24px 0;">Loading deals…</div>
    <section id="deals-discount-section" class="hidden">
      <div class="section-header"><span>🏷️ On sale now</span></div>
      <div id="deals-discount-grid" class="game-grid"></div>
    </section>
    <section id="deals-free-section" class="hidden">
      <div class="section-header"><span>🎁 Free right now</span></div>
      <div id="deals-free-grid" class="game-grid"></div>
    </section>
  `;

  document.getElementById("btn-open-deals-web")?.addEventListener("click", () => {
    window.playbound.openExternal?.(DEALS_WEB_URL);
  });

  markViewReady(container);

  const res = (await cacheInvoke("deals", CACHE_TTL.deals, () =>
    window.playbound.getDeals?.()
  )) || {};

  const freeOffers = Array.isArray(res.freeOffers) ? res.freeOffers : [];
  const discounted = Array.isArray(res.discounted) ? res.discounted : [];
  const status = document.getElementById("deals-status");

  if (discounted.length > 0) {
    const grid = document.getElementById("deals-discount-grid");
    if (grid) grid.replaceChildren(...discounted.map(createDiscountCard));
    document.getElementById("deals-discount-section")?.classList.remove("hidden");
  }

  if (freeOffers.length > 0) {
    const grid = document.getElementById("deals-free-grid");
    if (grid) grid.replaceChildren(...freeOffers.map(createFreeOfferCard));
    document.getElementById("deals-free-section")?.classList.remove("hidden");
  }

  if (status) {
    if (freeOffers.length === 0 && discounted.length === 0) {
      /*
       * "Could not load" and "nothing is on offer" are different facts and the
       * player deserves to know which one they are looking at — the first is
       * worth retrying, the second is not.
       */
      status.textContent =
        res.ok === false
          ? "Could not reach PlayBound to load deals. Check your connection and try again."
          : "No free giveaways or discounts right now. Check back soon.";
    } else {
      status.remove();
    }
  }
}

api.renderDealsView = renderDealsView;

export { renderDealsView };
