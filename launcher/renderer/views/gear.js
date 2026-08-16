import { createGameCard } from "../cards.js";
import {
  api,
  CACHE_TTL,
  cacheInvoke,
  escapeHtml,
  markViewReady,
  state,
  views,
} from "../shared.js";

function renderRatingStarsHtml(rating) {
  if (rating == null || isNaN(rating)) return "";
  const r = Math.round(rating * 2) / 2;
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    if (r >= i) {
      stars.push(`<span class="star star-full">★</span>`);
    } else if (r >= i - 0.5) {
      stars.push(`<span class="star star-half">★</span>`);
    } else {
      stars.push(`<span class="star star-empty">☆</span>`);
    }
  }
  return `<span class="gear-rating-stars">${stars.join("")}</span>`;
}

// ── GEAR DIRECTORY VIEW ─────────────────────────────────────────────

async function renderGearView() {
  const container = views.gear;
  if (!container) return;

  container.innerHTML = `
    <div class="gear-header-row">
      <div class="gear-header-copy">
        <h1 class="view-title">Gear</h1>
        <p class="view-sub">Hardware recommendations driven by the games you actually play. Playbound Certified and tested by the community.</p>
      </div>
      <button class="btn-secondary btn-sm" id="btn-open-gear-web">Open playbound.club/gear</button>
    </div>
    <div id="gear-directory" class="gear-directory">
      <p class="view-sub">Loading gear recommendations…</p>
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
      markViewReady(container);
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
                  `<button type="button" class="btn-secondary btn-sm gear-buy" data-buy-url="${escapeHtml(
                    l.url
                  )}">Buy from ${escapeHtml(l.retailer)}${
                    l.price ? ` · ${escapeHtml(l.price)}` : ""
                  }</button>`
              )
              .join("");
            const certified = gear.playboundCertified
              ? `<span class="chip chip-accent">Playbound Certified</span>`
              : "";
            return `
              <div class="gear-card" data-gear-slug="${escapeHtml(gear.slug)}">
                <div class="gear-card-img-wrap" data-gear-slug="${escapeHtml(gear.slug)}">
                  ${img}
                </div>
                <div class="gear-card-body">
                  <div class="gear-card-title-row">
                    <button type="button" class="gear-card-title-btn" data-gear-slug="${escapeHtml(gear.slug)}">${escapeHtml(
                      gear.title
                    )}</button>
                    ${certified}
                  </div>
                  <p class="gear-card-desc">${escapeHtml(gear.description || "")}</p>
                  <div class="gear-card-actions">
                    <button type="button" class="btn-primary btn-sm gear-open-detail" data-gear-slug="${escapeHtml(
                      gear.slug
                    )}">View Item</button>
                    ${links}
                  </div>
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
              )}">View all ${escapeHtml(category)} on web →</button>
            </div>
            <div class="gear-card-grid">${cards}</div>
          </section>
        `;
      })
      .join("");

    dir.querySelectorAll("[data-gear-slug]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if ((e.target).closest(".gear-buy")) return;
        const slug = el.getAttribute("data-gear-slug");
        if (slug) api.openGearDetail?.(slug, "gear");
      });
    });

    dir.querySelectorAll("[data-buy-url]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = btn.getAttribute("data-buy-url");
        if (url) window.playbound.openExternal(url, { skipUtm: true });
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

// ── GEAR ITEM DETAIL VIEW ───────────────────────────────────────────

async function renderGearDetailView(slug) {
  const container = views.gearDetail;
  if (!container) return;

  container.innerHTML = `
    <div class="gear-detail-loading">
      <p class="view-sub">Loading gear details…</p>
    </div>
  `;

  try {
    const res = await cacheInvoke(`gearDetail:${slug}`, CACHE_TTL.gear, () =>
      window.playbound.getGearDetail?.(slug)
    );

    if (!res || !res.gear) {
      container.innerHTML = `
        <div class="section-header" style="margin-top: 0">
          <button type="button" class="btn-secondary btn-sm" id="gear-detail-back">← Back to Gear</button>
        </div>
        <p class="view-sub" style="padding: 40px 0; text-align: center;">Gear recommendation not found.</p>
      `;
      document.getElementById("gear-detail-back")?.addEventListener("click", () => {
        api.navigateTo(state.detailReturnView || "gear");
      });
      markViewReady(container, slug);
      return;
    }

    const {
      gear,
      recommendedGames = [],
      reviews = [],
      avgRating = null,
      reviewCount = 0,
      discussions = [],
      discussionCount = 0,
    } = res;

    const certifiedBadge = gear.playboundCertified
      ? `<span class="chip chip-accent">Playbound Certified</span>`
      : "";

    const activeLinksHtml = (gear.affiliateLinks || [])
      .map(
        (link) => `
        <div class="gear-buy-card">
          <div class="gear-buy-card-info">
            <div class="gear-buy-retailer">
              <svg class="gear-buy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
              <span>${escapeHtml(link.retailer)}</span>
            </div>
            ${link.price ? `<div class="gear-buy-price">${escapeHtml(link.price)}</div>` : ""}
            ${link.shipping ? `<div class="gear-buy-shipping">${escapeHtml(link.shipping)}</div>` : ""}
          </div>
          <button type="button" class="btn-primary btn-sm gear-buy-now-btn" data-buy-url="${escapeHtml(
            link.url
          )}">Buy on ${escapeHtml(link.retailer)}</button>
        </div>
      `
      )
      .join("");

    const platformsHtml = (gear.platforms || [])
      .map((p) => `<span class="chip">${escapeHtml(p)}</span>`)
      .join("");

    const bestForHtml = (gear.bestFor || [])
      .map((b) => `<span class="chip chip-accent">${escapeHtml(b)}</span>`)
      .join("");

    const screenshotsHtml = (gear.screenshots || [])
      .map(
        (s, i) =>
          `<img class="gear-detail-thumb" src="${escapeHtml(s)}" alt="Screenshot ${i + 1}" loading="lazy" />`
      )
      .join("");

    const recommendedGamesHtml = recommendedGames.length
      ? `
        <section class="gear-detail-rec-section">
          <h2 class="gear-detail-section-title">Recommended for Games</h2>
          <div class="game-grid" style="margin-top: 12px;">
            ${recommendedGames
              .map(
                (g) => `
              <div class="game-card gear-rec-game-card" data-game-slug="${escapeHtml(g.slug)}">
                <div class="card-art" style="background: linear-gradient(135deg, #1e1b4b, #312e81);">
                  ${
                    g.coverImage
                      ? `<img class="card-cover" src="${escapeHtml(g.coverImage)}" alt="" loading="lazy" />`
                      : `<span class="card-art-fallback">${escapeHtml((g.title || "?").charAt(0))}</span>`
                  }
                  <div class="card-art-title">
                    <span class="card-title-text">${escapeHtml(g.title)}</span>
                  </div>
                </div>
                <div class="card-meta">
                  <span class="chip">${escapeHtml(g.reason || "Recommended Hardware")}</span>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </section>
      `
      : "";

    const videosHtml = (gear.videos || []).length
      ? `
        <section class="gear-detail-videos-section">
          <h2 class="gear-detail-section-title">Videos</h2>
          <div class="gear-videos-grid">
            ${gear.videos
              .map((v) => {
                if (v.includes("youtube.com") || v.includes("youtu.be")) {
                  const ytid = v.match(/(?:embed\/|v=|youtu\.be\/)([\w-]{11})/)?.[1];
                  if (ytid) {
                    return `<div class="gear-video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(
                      ytid
                    )}" allowfullscreen></iframe></div>`;
                  }
                }
                return `<div class="gear-video-link"><button type="button" class="btn-secondary btn-sm gear-ext-video" data-video-url="${escapeHtml(
                  v
                )}">Watch Video Link</button></div>`;
              })
              .join("")}
          </div>
        </section>
      `
      : "";

    container.innerHTML = `
      <div class="gear-detail-view">
        <!-- Breadcrumbs & Nav Bar -->
        <div class="gear-detail-nav-row">
          <button type="button" class="btn-secondary btn-sm" id="gear-detail-back">← Back to Gear</button>
          <div class="gear-detail-breadcrumbs">
            <span class="gear-breadcrumb-link" id="breadcrumb-gear">Gear</span>
            <span class="gear-breadcrumb-sep">/</span>
            <span class="gear-breadcrumb-link" id="breadcrumb-cat">${escapeHtml(gear.category)}</span>
            <span class="gear-breadcrumb-sep">/</span>
            <span class="gear-breadcrumb-current">${escapeHtml(gear.title)}</span>
          </div>
          <button type="button" class="btn-secondary btn-sm" id="gear-detail-web">Open on Web</button>
        </div>

        <!-- Header -->
        <header class="gear-detail-header">
          <h1 class="gear-detail-title">${escapeHtml(gear.title)}</h1>
          ${
            gear.manufacturer
              ? `<p class="gear-detail-by">by <strong class="gear-manufacturer">${escapeHtml(
                  gear.manufacturer
                )}</strong></p>`
              : ""
          }
          <div class="gear-detail-badges-row">
            ${certifiedBadge}
            ${
              avgRating != null
                ? `<div class="gear-detail-rating">${renderRatingStarsHtml(avgRating)} <strong>${avgRating.toFixed(
                    1
                  )}</strong> <span class="view-sub">(${reviewCount} review${
                    reviewCount === 1 ? "" : "s"
                  })</span></div>`
                : ""
            }
          </div>
        </header>

        <!-- Tabs -->
        <nav class="detail-tabs" id="gear-detail-tabs">
          <button type="button" class="detail-tab active" data-tab="overview">Overview</button>
          <button type="button" class="detail-tab" data-tab="reviews">Reviews ${
            reviewCount ? `(${reviewCount})` : ""
          }</button>
          <button type="button" class="detail-tab" data-tab="discussion">Discussion ${
            discussionCount ? `(${discussionCount})` : ""
          }</button>
        </nav>

        <!-- Tab Contents -->
        <div id="gear-tab-overview" class="gear-tab-content">
          <div class="gear-detail-main-grid">
            <!-- Left: Media Column -->
            <div class="gear-detail-media-col">
              ${
                gear.coverImage
                  ? `<div class="gear-detail-cover-wrap"><img class="gear-detail-cover" src="${escapeHtml(
                      gear.coverImage
                    )}" alt="${escapeHtml(gear.title)}" /></div>`
                  : `<div class="gear-detail-cover-wrap gear-detail-cover-fallback">${escapeHtml(
                      gear.category
                    )}</div>`
              }
              ${
                screenshotsHtml
                  ? `<div class="gear-detail-thumbs-gallery">${screenshotsHtml}</div>`
                  : ""
              }
            </div>

            <!-- Right: Details & Purchase Column -->
            <div class="gear-detail-info-col">
              ${
                platformsHtml
                  ? `<div class="gear-info-row"><span class="gear-info-label">Platforms:</span> <div class="gear-info-chips">${platformsHtml}</div></div>`
                  : ""
              }
              ${
                bestForHtml
                  ? `<div class="gear-info-row"><span class="gear-info-label">Best for:</span> <div class="gear-info-chips">${bestForHtml}</div></div>`
                  : ""
              }

              <div class="gear-detail-desc">
                ${escapeHtml(gear.description || "").replace(/\n/g, "<br>")}
              </div>

              <!-- Where to Buy -->
              <div class="gear-detail-buy-section">
                <h3 class="gear-buy-section-title">Where to buy</h3>
                <div class="gear-buy-list">
                  ${activeLinksHtml || `<p class="view-sub">No purchase links available currently.</p>`}
                </div>
              </div>
            </div>
          </div>

          ${recommendedGamesHtml}
          ${videosHtml}
        </div>

        <div id="gear-tab-reviews" class="gear-tab-content hidden">
          <div class="gear-reviews-list">
            ${
              reviews.length
                ? reviews
                    .map(
                      (r) => `
                <div class="detail-review-card">
                  <div class="detail-review-header">
                    <div>
                      <strong>${escapeHtml(r.authorName)}</strong>
                      ${renderRatingStarsHtml(r.rating)}
                    </div>
                    <span class="view-sub">${escapeHtml(String(r.createdAt || "").slice(0, 10))}</span>
                  </div>
                  ${r.title ? `<h4 class="detail-review-title">${escapeHtml(r.title)}</h4>` : ""}
                  <p class="detail-review-body">${escapeHtml(r.body)}</p>
                </div>
              `
                    )
                    .join("")
                : `<p class="view-sub" style="text-align: center; padding: 40px 0;">No reviews yet. Be the first to review on playbound.club!</p>`
            }
          </div>
        </div>

        <div id="gear-tab-discussion" class="gear-tab-content hidden">
          <div class="gear-discussions-list">
            ${
              discussions.length
                ? discussions
                    .map(
                      (d) => `
                <div class="gear-discussion-row">
                  <span class="chip">${escapeHtml(d.category || "general")}</span>
                  <div class="gear-disc-main">
                    <h4 class="gear-disc-title">${escapeHtml(d.title)}</h4>
                    <span class="view-sub">Started by ${escapeHtml(d.authorName)} · ${d.replyCount} repl${
                        d.replyCount === 1 ? "y" : "ies"
                      }</span>
                  </div>
                  <button type="button" class="btn-secondary btn-sm gear-open-topic" data-topic-id="${escapeHtml(
                    d.id
                  )}">View Discussion</button>
                </div>
              `
                    )
                    .join("")
                : `<p class="view-sub" style="text-align: center; padding: 40px 0;">No active discussion topics yet. Start one on playbound.club!</p>`
            }
          </div>
        </div>
      </div>
    `;

    // Event wiring
    document.getElementById("gear-detail-back")?.addEventListener("click", () => {
      api.navigateTo(state.detailReturnView || "gear");
    });
    document.getElementById("breadcrumb-gear")?.addEventListener("click", () => {
      api.navigateTo("gear");
    });
    document.getElementById("breadcrumb-cat")?.addEventListener("click", () => {
      api.navigateTo("gear");
    });
    document.getElementById("gear-detail-web")?.addEventListener("click", () => {
      window.playbound.openExternal(
        `https://playbound.club/gear/${encodeURIComponent(
          String(gear.category || "").toLowerCase()
        )}/${encodeURIComponent(gear.slug)}`
      );
    });

    // Tab switching
    container.querySelectorAll("#gear-detail-tabs .detail-tab").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        const tabKey = tabBtn.getAttribute("data-tab");
        container
          .querySelectorAll("#gear-detail-tabs .detail-tab")
          .forEach((b) => b.classList.toggle("active", b === tabBtn));
        container.querySelectorAll(".gear-tab-content").forEach((c) => {
          c.classList.toggle("hidden", c.id !== `gear-tab-${tabKey}`);
        });
      });
    });

    // Buy links
    container.querySelectorAll("[data-buy-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const url = btn.getAttribute("data-buy-url");
        if (url) window.playbound.openExternal(url, { skipUtm: true });
      });
    });

    // Recommended game cards
    container.querySelectorAll("[data-game-slug]").forEach((card) => {
      card.addEventListener("click", () => {
        const gameSlug = card.getAttribute("data-game-slug");
        if (gameSlug) api.openGameDetail?.(gameSlug, "gearDetail");
      });
    });

    // External video links
    container.querySelectorAll("[data-video-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const url = btn.getAttribute("data-video-url");
        if (url) window.playbound.openExternal(url);
      });
    });
  } catch (err) {
    container.innerHTML = `
      <div class="section-header" style="margin-top: 0">
        <button type="button" class="btn-secondary btn-sm" id="gear-detail-back">← Back to Gear</button>
      </div>
      <p class="view-sub" style="color: var(--danger); padding: 40px 0; text-align: center;">Failed to load gear detail: ${escapeHtml(
        err?.message || String(err)
      )}</p>
    `;
    document.getElementById("gear-detail-back")?.addEventListener("click", () => {
      api.navigateTo(state.detailReturnView || "gear");
    });
  }

  markViewReady(container, slug);
}

api.renderGearView = renderGearView;
api.renderGearDetailView = renderGearDetailView;
