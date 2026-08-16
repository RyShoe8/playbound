import { api, escapeHtml, prefetchGameDetail, state } from "./shared.js";

function categoryChipsHtml(item, extra = []) {
  const seen = new Set();
  const chips = [];
  for (const raw of [...(item.genres || []), ...(item.tags || []), ...extra]) {
    const label = String(raw || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push(label);
    if (chips.length >= 3) break;
  }
  if (!chips.length) return "";
  return `<div class="card-tags">${chips
    .map((c) => `<span class="chip">${escapeHtml(c)}</span>`)
    .join("")}</div>`;
}

export function createGameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const bgGrad =
    Array.isArray(game.art) && game.art.length >= 2
      ? `linear-gradient(135deg, ${game.art[0]}, ${game.art[1]})`
      : `linear-gradient(135deg, #312e81, #a78bfa)`;

  const banner = document.createElement("div");
  banner.className = "card-banner";
  banner.style.background = bgGrad;
  banner.textContent = (game.title || "?").charAt(0);

  if (game.coverImage) {
    const img = document.createElement("img");
    img.className = "card-cover";
    img.src = game.coverImage;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.remove();
      banner.textContent = (game.title || "?").charAt(0);
    });
    banner.textContent = "";
    banner.appendChild(img);
  }

  card.appendChild(banner);

  const body = document.createElement("div");
  body.className = "card-body";
  body.innerHTML = `
      <div class="card-title"><span class="card-title-text">${escapeHtml(game.title)}</span>${
        game.testing || game.status === "testing"
          ? `<span class="badge card-testing-badge">Testing</span>`
          : ""
      }</div>
      <div class="card-blurb">${escapeHtml(game.blurb || "")}</div>
      ${categoryChipsHtml(game)}
      <div class="card-footer">
        <span style="font-size: 11px; color: var(--text-dim);">${escapeHtml(game.approxSize || "")}</span>
        <button class="btn-secondary btn-sm" type="button">View</button>
      </div>
  `;
  card.appendChild(body);

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
