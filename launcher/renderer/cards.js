import {
  accessPriceLabel,
  api,
  catalogPriceBySlug,
  escapeHtml,
  isGameDesktopCompatible,
  prefetchGameDetail,
  prefetchModDetail,
  requiresGamePriceLine,
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

/** Renders edition badges below tags if distinct community/remaster editions exist. */
function editionChipsHtml(game, { max = 3 } = {}) {
  const editions = Array.isArray(game.editions) ? game.editions : [];
  if (!editions.length) return "";
  const visible = editions.slice(0, max);
  const overflow = editions.length - max;
  return `<div class="card-editions">
    <span class="card-editions-label">Editions:</span>
    ${visible.map((e) => `<span class="chip edition-chip" data-edition-slug="${escapeHtml(e.slug)}" title="${escapeHtml(e.name || e.slug)}">${escapeHtml(e.name || e.slug)}</span>`).join("")}
    ${overflow > 0 ? `<span class="card-editions-overflow">+${overflow}</span>` : ""}
  </div>`;
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

/**
 * Mirrors isBrowserGame() in platform/src/lib/gameLaunch.ts.
 *
 * This used to treat every `kind: "external"` entry as a browser game, but
 * external only means "PlayBound hands off rather than downloading" — which is
 * equally true of a live-service game that ships its own installer. Those were
 * getting a "Play" badge and no download size, hiding that some are very large.
 */
function isBrowserGame(game) {
  if (game.browserPlayable) return true;
  const methods = Array.isArray(game.launchMethods) ? game.launchMethods : [];
  return methods.includes("browser") && !methods.includes("install");
}

/** Top-right badge: Play for browser titles, otherwise the download size. */
function launchBadgeHtml(game) {
  if (isBrowserGame(game)) {
    return `<span class="card-launch-badge card-launch-play">${ICON_MONITOR_PLAY} Play</span>`;
  }
  const label = cardSizeLabel(game);
  return `<span class="card-launch-badge">${ICON_DOWNLOAD}${label ? ` ${escapeHtml(label)}` : ""}</span>`;
}

function attachCardCover(art, coverUrl) {
  if (!coverUrl) return;
  const img = document.createElement("img");
  img.className = "card-cover";
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";

  let retried = false;
  img.addEventListener("load", () => {
    img.classList.add("is-loaded");
  });
  img.addEventListener("error", () => {
    if (!retried) {
      retried = true;
      setTimeout(() => {
        if (!img.isConnected) return;
        const separator = coverUrl.includes("?") ? "&" : "?";
        img.src = `${coverUrl}${separator}_r=${Date.now()}`;
      }, 1200);
    } else {
      img.remove();
    }
  });

  img.src = coverUrl;
  if (img.complete && img.naturalWidth > 0) {
    img.classList.add("is-loaded");
  }
  art.appendChild(img);
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

  attachCardCover(art, game.coverImage);

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
  const price = accessPriceLabel(game.fromPriceCents);
  footer.innerHTML = `
    <div class="card-meta-copy">
      <p class="card-price">${escapeHtml(price)}</p>
      ${categoryChipsHtml(game)}
      ${editionChipsHtml(game)}
    </div>
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
  card.querySelectorAll(".edition-chip[data-edition-slug]").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      api.openEditionDetail?.(game.slug, chip.dataset.editionSlug);
    });
  });

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
  attachCardCover(art, coverUrl);

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

  const body = document.createElement("div");
  body.className = "mod-card-body";

  const fixesText = mod.whatItChanges || mod.tagline || "";
  if (fixesText) {
    const fixesEl = document.createElement("p");
    fixesEl.className = "mod-fixes-text";
    fixesEl.textContent = fixesText;
    fixesEl.title = fixesText;
    body.appendChild(fixesEl);
  }

  const footer = document.createElement("div");
  footer.className = "card-meta";
  const baseTitle = mod.baseGameTitle || mod.baseGameSlug || "";
  const requireLine = requiresGamePriceLine(
    baseTitle,
    catalogPriceBySlug().get(mod.baseGameSlug)
  );
  const tags = [
    mod.license,
    requireLine || (baseTitle ? `For ${baseTitle}` : null),
  ].filter(Boolean);
  footer.innerHTML = `
    <div class="card-tags">${tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("")}</div>
  `;
  body.appendChild(footer);
  card.appendChild(body);

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
  card.className = "game-card free-offer-card";

  const displayTitle =
    (offer.metadata && offer.metadata.title) || offer.unmatchedTitle || offer.externalId || "Free Game";
  const storeName = storeDisplayName(offer.store);
  const typeLabel = offerTypeBadgeLabel(offer.offerType, offer.store);
  const expiry = formatOfferExpiration(offer.endDate);

  const art = document.createElement("div");
  art.className = "card-art";
  art.style.background = `linear-gradient(135deg, #1e1b4b, #312e81)`;

  const fallback = document.createElement("span");
  fallback.className = "card-art-fallback";
  fallback.textContent = (displayTitle || "?").charAt(0);
  art.appendChild(fallback);

  attachCardCover(art, offer.coverImage);

  const titleOverlay = document.createElement("div");
  titleOverlay.className = "card-art-title";
  titleOverlay.innerHTML = `<span class="card-title-text">${escapeHtml(displayTitle)}</span>`;
  art.appendChild(titleOverlay);

  const storeBadge = document.createElement("div");
  storeBadge.className = "card-incompatible-corner";
  storeBadge.style.background = "rgba(0, 0, 0, 0.75)";
  storeBadge.textContent = storeName;
  art.appendChild(storeBadge);

  const badgeSlot = document.createElement("div");
  badgeSlot.className = "card-launch-badge-slot";
  badgeSlot.innerHTML = `<span class="card-launch-badge card-launch-play">${escapeHtml(typeLabel)}</span>`;
  art.appendChild(badgeSlot);

  card.appendChild(art);

  const footer = document.createElement("div");
  footer.className = "card-meta";
  footer.innerHTML = `
    <div class="card-tags">
      ${offer.retailPrice ? `<span class="chip" style="text-decoration: line-through; opacity: 0.6;">${escapeHtml(offer.retailPrice)}</span>` : ""}
      <span class="chip" style="color: var(--color-play, #34d27b); font-weight: 700;">FREE</span>
      ${expiry ? `<span class="chip">⏱ ${escapeHtml(expiry)}</span>` : ""}
    </div>
  `;
  card.appendChild(footer);

  card.addEventListener("click", () => {
    if (offer.gameSlug) {
      api.openGameDetail?.(offer.gameSlug, state.currentView);
    } else if (offer.claimUrl) {
      window.playbound.openExternal(offer.claimUrl);
    }
  });

  return card;
}
