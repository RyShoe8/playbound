import {
  api,
  escapeHtml,
  isGameDesktopCompatible,
  prefetchGameDetail,
  prefetchModDetail,
  state,
} from "./shared.js";

/** Mirrors CardCategoryTags: genres then tags, deduped, capped. */
function categoryChipsHtml(item, { extra = [], max = 4 } = {}) {
  const seen = new Set();
  const chips = [];
  for (const raw of [...(item.genres || []), ...(item.tags || []), ...extra]) {
    const label = String(raw || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push(label);
    if (chips.length >= max) break;
  }
  if (!chips.length) return "";
  return `<div class="card-tags">${chips
    .map((c) => `<span class="chip">${escapeHtml(c)}</span>`)
    .join("")}</div>`;
}

const ICON_DOWNLOAD = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`;
const ICON_MONITOR_PLAY = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 7.75a.75.75 0 0 1 1.142-.638l3.664 2.249a.75.75 0 0 1 0 1.278l-3.664 2.25a.75.75 0 0 1-1.142-.64z"/><path d="M12 17v4"/><path d="M8 21h8"/><rect x="2" y="3" width="20" height="14" rx="2"/></svg>`;

/**
 * `sizeLabel()` from the website's GameCard. The launcher catalog ships an
 * already-formatted `approxSize` ("~1.2 GB"), so the tilde is dropped to leave
 * the same string the site renders.
 */
function cardSizeLabel(game) {
  const raw = String(game.approxSize || "").trim();
  if (!raw || raw === "Browser") return "";
  return raw.replace(/^~\s*/, "");
}

function isBrowserGame(game) {
  // The catalog marks non-installable titles as external entries pointing at
  // the game's own site — the launcher's equivalent of isBrowserGame().
  return game.kind === "external" || Boolean(game.browserPlayable);
}

/** Top-right badge: Play for browser titles, otherwise the download size. */
function launchBadgeHtml(game) {
  if (isBrowserGame(game)) {
    return `<span class="card-launch-badge card-launch-play">${ICON_MONITOR_PLAY} Play</span>`;
  }
  const label = cardSizeLabel(game);
  return `<span class="card-launch-badge">${ICON_DOWNLOAD}${label ? ` ${escapeHtml(label)}` : ""}</span>`;
}

/**
 * A card for one game, structured like the website's GameCard: portrait art
 * carrying the title, an incompatibility corner and a launch badge over it,
 * and a footer of category tags against the live player count.
 *
 * `playingNow` is optional and comes from one shared snapshot for the whole
 * view (see loadPlayingNowBySlug). When a slug is absent from that snapshot
 * the count is left out rather than shown as a misleading 0.
 */
export function createGameCard(game, playingNow) {
  const card = document.createElement("div");
  card.className = "game-card";

  const bgGrad =
    Array.isArray(game.art) && game.art.length >= 2
      ? `linear-gradient(135deg, ${game.art[0]}, ${game.art[1]})`
      : `linear-gradient(135deg, #312e81, #a78bfa)`;

  const art = document.createElement("div");
  art.className = "card-art";
  art.style.background = bgGrad;

  const fallback = document.createElement("span");
  fallback.className = "card-art-fallback";
  fallback.textContent = (game.title || "?").charAt(0);
  art.appendChild(fallback);

  if (game.coverImage) {
    const img = document.createElement("img");
    img.className = "card-cover";
    img.src = game.coverImage;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => img.remove());
    art.appendChild(img);
  }

  // The site's GameArt renders the title over the bottom of the cover, which
  // is why the card body below carries no title of its own.
  const titleOverlay = document.createElement("div");
  titleOverlay.className = "card-art-title";
  titleOverlay.innerHTML = `<span class="card-title-text">${escapeHtml(game.title)}</span>${
    game.testing || game.status === "testing"
      ? `<span class="badge card-testing-badge">Testing</span>`
      : ""
  }`;
  art.appendChild(titleOverlay);

  if (state.compatibilityFilter === "all" && !isGameDesktopCompatible(game)) {
    const corner = document.createElement("span");
    corner.className = "card-incompatible-corner";
    corner.textContent = "Mobile Only";
    art.appendChild(corner);
  }

  const badge = document.createElement("div");
  badge.className = "card-launch-badge-slot";
  badge.innerHTML = launchBadgeHtml(game);
  art.appendChild(badge);

  card.appendChild(art);

  const footer = document.createElement("div");
  footer.className = "card-meta";
  footer.innerHTML = `
    ${categoryChipsHtml(game)}
    ${
      typeof playingNow === "number"
        ? `<p class="card-playing"><span class="card-playing-dot"></span>${playingNow.toLocaleString()} playing</p>`
        : ""
    }
  `;
  card.appendChild(footer);

  card.addEventListener(
    "pointerenter",
    () => {
      api.prefetchView?.("gameDetail");
      prefetchGameDetail(game.slug);
    },
    { once: true }
  );
  card.addEventListener("click", () => api.openGameDetail?.(game.slug, state.currentView));
  return card;
}

/**
 * A card for one mod, structured in the standardized 3/4 portrait format
 * matching createGameCard and web's ModCard.
 */
export function createModCard(mod) {
  const card = document.createElement("div");
  card.className = "game-card mod-card";

  const bgGrad =
    Array.isArray(mod.art) && mod.art.length >= 2
      ? `linear-gradient(135deg, ${mod.art[0]}, ${mod.art[1]})`
      : `linear-gradient(135deg, #312e81, #a78bfa)`;

  const art = document.createElement("div");
  art.className = "card-art";
  art.style.background = bgGrad;

  const fallback = document.createElement("span");
  fallback.className = "card-art-fallback";
  fallback.textContent = (mod.title || "?").charAt(0);
  art.appendChild(fallback);

  const coverUrl = mod.coverImage || mod.baseGameCoverImage || "";
  if (coverUrl) {
    const img = document.createElement("img");
    img.className = "card-cover";
    img.src = coverUrl;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => img.remove());
    art.appendChild(img);
  }

  const titleOverlay = document.createElement("div");
  titleOverlay.className = "card-art-title";
  titleOverlay.innerHTML = `<span class="card-title-text">${escapeHtml(mod.title)}</span>`;
  art.appendChild(titleOverlay);

  const badge = document.createElement("div");
  badge.className = "card-launch-badge-slot";
  const sizeLabel = String(mod.approxSize || "").replace(/^~\s*/, "");
  badge.innerHTML = `<span class="card-launch-badge">${ICON_DOWNLOAD}${sizeLabel ? ` ${escapeHtml(sizeLabel)}` : " Mod"}</span>`;
  art.appendChild(badge);

  card.appendChild(art);

  const footer = document.createElement("div");
  footer.className = "card-meta";
  const tags = [
    mod.license,
    mod.baseGameTitle ? `For ${mod.baseGameTitle}` : mod.baseGameSlug ? `For ${mod.baseGameSlug}` : null,
  ].filter(Boolean);
  footer.innerHTML = `
    <div class="card-tags">${tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("")}</div>
  `;
  card.appendChild(footer);

  card.addEventListener(
    "pointerenter",
    () => {
      api.prefetchView?.("modDetail");
      prefetchModDetail(mod.slug);
    },
    { once: true }
  );
  card.addEventListener("click", () => api.openModDetail?.(mod.slug, state.currentView));
  return card;
}

function formatOfferExpiration(endDate) {
  if (!endDate) return null;
  const end = new Date(endDate);
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return null;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffHours < 24) {
    const hours = Math.floor(diffHours);
    return hours <= 1 ? "Ends today" : `${hours}h left`;
  }
  if (diffDays < 2) return "Ends tomorrow";
  if (diffDays < 7) {
    return `Ends ${end.toLocaleDateString("en-US", { weekday: "short" })}`;
  }
  return `${Math.floor(diffDays)}d left`;
}

function storeDisplayName(store) {
  const names = {
    epic: "Epic Games",
    steam: "Steam",
    gog: "GOG",
    prime_gaming: "Prime Gaming",
  };
  return names[store] || store;
}

function offerTypeBadgeLabel(type, store) {
  if (type === "free_to_keep") return "FREE TO KEEP";
  if (type === "free_weekend") return "FREE WEEKEND";
  if (type === "free_trial") return "FREE TRIAL";
  if (type === "free_with_subscription") return store === "prime_gaming" ? "PRIME" : "SUBSCRIPTION";
  return "FREE";
}

export function createFreeOfferCard(offer) {
  const card = document.createElement("div");
  card.className = "free-offer-card";

  const displayTitle =
    (offer.metadata && offer.metadata.title) || offer.unmatchedTitle || offer.externalId || "Free Game";
  const storeName = storeDisplayName(offer.store);
  const typeLabel = offerTypeBadgeLabel(offer.offerType, offer.store);
  const expiry = formatOfferExpiration(offer.endDate);

  const banner = document.createElement("div");
  banner.className = "free-offer-banner";
  if (offer.coverImage) {
    const img = document.createElement("img");
    img.className = "free-offer-cover";
    img.src = offer.coverImage;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.remove();
      banner.textContent = displayTitle.charAt(0);
    });
    banner.appendChild(img);
  } else {
    banner.textContent = displayTitle.charAt(0);
  }

  const storeBadge = document.createElement("span");
  storeBadge.className = `store-badge store-badge-${escapeHtml(offer.store)}`;
  storeBadge.textContent = storeName;
  banner.appendChild(storeBadge);

  const typeBadge = document.createElement("span");
  typeBadge.className = "offer-type-badge";
  typeBadge.textContent = typeLabel;
  banner.appendChild(typeBadge);

  card.appendChild(banner);

  const body = document.createElement("div");
  body.className = "free-offer-body";
  body.innerHTML = `
    <div class="free-offer-title" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</div>
    <div class="free-offer-meta">
      ${offer.retailPrice ? `<span class="free-offer-price-old">${escapeHtml(offer.retailPrice)}</span>` : ""}
      <span class="free-offer-free-label">FREE</span>
      ${expiry ? `<span class="free-offer-expiry">⏱ ${escapeHtml(expiry)}</span>` : ""}
    </div>
    <div class="free-offer-actions">
      <button class="btn-primary btn-sm btn-claim" type="button">Claim on ${escapeHtml(storeName)}</button>
    </div>
  `;

  body.querySelector(".btn-claim")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (offer.claimUrl) {
      window.playbound.openExternal(offer.claimUrl);
    }
  });

  card.addEventListener("click", () => {
    if (offer.gameSlug) {
      api.openGameDetail?.(offer.gameSlug, state.currentView);
    } else if (offer.claimUrl) {
      window.playbound.openExternal(offer.claimUrl);
    }
  });

  card.appendChild(body);
  return card;
}
