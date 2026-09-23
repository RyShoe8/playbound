import { createFreeOfferCard, storeDisplayName } from "../cards.js";
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
 * Game Deals — free store giveaways and deep store discounts.
 *
 * Mirrors the website's /deals page, and reuses `createFreeOfferCard` for the
 * free half so a card only ever looks one way across the app. The discounted
 * half gets its own small builder rather than `createGameCard`: a game card is
 * built around install state and a Play button, which assumes PlayBound has
 * the game — most discounts here do not (`game.slug` is a rare bonus, not the
 * norm; see `storeDiscounts/service.ts` on the platform side). The two say
 * different things either way — a giveaway is a countdown, a discount is a
 * comparison.
 *
 * Both sections hide when empty rather than rendering an empty grid. Even
 * scanning the stores directly, a real 75%+ discount is not guaranteed on any
 * given day — that should still look deliberate, not broken.
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
   * Whole-card click opens the store, not a PlayBound detail view — unlike
   * createGameCard's cards, most of these have no PlayBound page to open
   * (game.slug is null for a store-wide find; see the module doc). Prefer the
   * store link, same as createFreeOfferCard's claimUrl-first handling; only
   * fall back to the detail view on the rare row where a catalog match exists
   * and, somehow, no store link came through.
   */
  card.addEventListener("click", () => {
    if (game.storeUrl) {
      window.playbound.openExternal?.(game.storeUrl, { skipUtm: true });
    } else if (game.slug) {
      api.openGameDetail?.(game.slug, state.currentView);
    }
  });

  return card;
}

/**
 * Filter state for the view, reset on each open.
 *
 * Deliberately module-local rather than in `state`: unlike the Games view's
 * filters, nobody expects a deals filter to persist across a session, and a
 * remembered "Steam only" would quietly hide a new Epic giveaway next launch.
 */
let current = { kind: "all", store: "all", freeOffers: [], discounted: [] };

/**
 * Stores present in the data, for the filter row.
 *
 * Mirrors dealStoreKey in platform/src/lib/deals.ts: free offers carry a store
 * slug, discounts carry a normalised `storeKey` from the API, and both land in
 * one bucket so a GOG giveaway and a GOG discount filter together. Built from
 * what is actually loaded, because offering a filter that can only return
 * nothing is worse than not offering it.
 */
function storeOptions(freeOffers, discounted) {
  const seen = new Map();
  for (const o of freeOffers) {
    if (o.store && !seen.has(o.store)) seen.set(o.store, storeDisplayName(o.store));
  }
  for (const g of discounted) {
    if (g.storeKey && !seen.has(g.storeKey)) seen.set(g.storeKey, g.storeName || g.storeKey);
  }
  return [...seen.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function chipsHtml(options, activeValue, attr) {
  return options
    .map(
      (o) =>
        `<button type="button" class="filter-chip ${o.key === activeValue ? "active" : ""}" data-${attr}="${escapeHtml(o.key)}">${escapeHtml(o.label)}</button>`
    )
    .join("");
}

function paintDeals() {
  const { kind, store, freeOffers, discounted } = current;

  const visibleFree =
    kind === "discounted"
      ? []
      : freeOffers.filter((o) => store === "all" || o.store === store);
  const visibleDiscounted =
    kind === "free" ? [] : discounted.filter((g) => store === "all" || g.storeKey === store);

  const discountSection = document.getElementById("deals-discount-section");
  const freeSection = document.getElementById("deals-free-section");
  const discountGrid = document.getElementById("deals-discount-grid");
  const freeGrid = document.getElementById("deals-free-grid");

  if (discountGrid) discountGrid.replaceChildren(...visibleDiscounted.map(createDiscountCard));
  if (freeGrid) freeGrid.replaceChildren(...visibleFree.map(createFreeOfferCard));

  // Hide the whole section, heading included. An empty grid under "Free right
  // now" reads as "there is nothing" when the truth is "you filtered it out".
  discountSection?.classList.toggle("hidden", visibleDiscounted.length === 0);
  freeSection?.classList.toggle("hidden", visibleFree.length === 0);

  const status = document.getElementById("deals-status");
  if (!status) return;
  if (visibleFree.length > 0 || visibleDiscounted.length > 0) {
    status.classList.add("hidden");
    return;
  }
  status.classList.remove("hidden");
  if (freeOffers.length === 0 && discounted.length === 0) {
    /*
     * "Could not load" and "nothing is on offer" are different facts and the
     * player deserves to know which one they are looking at — the first is
     * worth retrying, the second is not.
     */
    status.textContent =
      current.ok === false
        ? "Could not reach PlayBound to load deals. Check your connection and try again."
        : "No free giveaways or discounts right now. Check back soon.";
  } else {
    status.textContent = "Nothing matches those filters. Try All deals and All stores.";
  }
}

function syncFilterChips() {
  const kindHost = document.getElementById("deals-kind-chips");
  const storeRow = document.getElementById("deals-store-row");
  const storeHost = document.getElementById("deals-store-chips");
  if (!kindHost || !storeHost || !storeRow) return;

  const { freeOffers, discounted } = current;
  kindHost.innerHTML = chipsHtml(
    [
      { key: "all", label: "All deals" },
      { key: "free", label: `Free (${freeOffers.length})` },
      { key: "discounted", label: `75% off or more (${discounted.length})` },
    ],
    current.kind,
    "kind"
  );

  const options = storeOptions(freeOffers, discounted);
  // One store is not a choice; hide the row rather than show a single chip.
  storeRow.classList.toggle("hidden", options.length <= 1);
  storeHost.innerHTML = chipsHtml(
    [{ key: "all", label: "All stores" }, ...options],
    current.store,
    "store"
  );

  kindHost.querySelectorAll("[data-kind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      current.kind = btn.dataset.kind;
      syncFilterChips();
      paintDeals();
    });
  });
  storeHost.querySelectorAll("[data-store]").forEach((btn) => {
    btn.addEventListener("click", () => {
      current.store = btn.dataset.store;
      syncFilterChips();
      paintDeals();
    });
  });
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
          giveaways alongside catalog games at 75% off or deeper.
        </p>
      </div>
      <button class="btn-secondary btn-sm" id="btn-open-deals-web">Open playbound.club/deals</button>
    </div>
    <div class="games-filter-card">
      <div class="games-filter-row">
        <span class="games-filter-label">Show:</span>
        <div class="search-chips-wrap" id="deals-kind-chips"></div>
      </div>
      <div class="games-filter-row hidden" id="deals-store-row">
        <span class="games-filter-label">Store:</span>
        <div class="search-chips-wrap" id="deals-store-chips"></div>
      </div>
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

  current = {
    // Filters reset on open; see the note on `current` above.
    kind: "all",
    store: "all",
    ok: res.ok,
    freeOffers: Array.isArray(res.freeOffers) ? res.freeOffers : [],
    discounted: Array.isArray(res.discounted) ? res.discounted : [],
  };

  syncFilterChips();
  paintDeals();
}

api.renderDealsView = renderDealsView;

export { renderDealsView };
