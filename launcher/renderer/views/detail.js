import { createFreeOfferCard, createGameCard } from "../cards.js";
import {
  api,
  buildActivityPanelHtml,
  CACHE_TTL,
  cacheInvoke,
  cachePeek,
  editionsContextSlug,
  enhanceSelect,
  escapeHtml,
  executableNoun,
  filterByCompatibility,
  formatStatNumber,
  gamePlayHintHtml,
  isGameDesktopCompatible,
  isMacOS,
  isModDesktopCompatible,
  markViewReady,
  selectExecutableLabel,
  setStatus,
  startGameSession,
  state,
  views,
  setProgress,
} from "../shared.js";

/** Sort state for game-detail servers table */
const detailServersSort = { sort: "players", sortDir: "desc" };

const HW_VERDICT_LABEL = {
  excellent: "Runs Great",
  good: "Runs Well",
  playable: "Playable",
  limited: "Limited",
  unsupported: "Unsupported",
  unknown: "Unknown",
};

function formatHwRam(mb) {
  if (mb == null) return null;
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB`;
  return `${mb} MB`;
}

async function fillGameHardwareCompat(slug) {
  const body = document.getElementById("detail-hw-compat-body");
  if (!body) return;
  if (!state.accountState.connected) {
    body.innerHTML =
      "Sign in to check this game against your PC. Sync hardware from Settings after signing in.";
    return;
  }
  try {
    const data = await window.playbound.getHardwareCompatibility?.(slug);
    if (!data || data.error) {
      body.textContent = data?.error || "Couldn’t check compatibility.";
      return;
    }
    if (!data.hasProfile || !data.result || data.result.verdict === "unknown") {
      body.innerHTML = `${escapeHtml(
        data.result?.summary ||
          "Sync your hardware from Settings (Your Gaming PC) to see whether this game will run well."
      )} <button type="button" class="btn-secondary btn-sm" id="detail-hw-sync" style="margin-left:8px">Sync now</button>`;
      document.getElementById("detail-hw-sync")?.addEventListener("click", async () => {
        body.textContent = "Syncing…";
        await window.playbound.syncHardwareProfile?.();
        api.fillGameHardwareCompat(slug);
      });
      return;
    }
    const r = data.result;
    const label = HW_VERDICT_LABEL[r.verdict] || "Unknown";
    const rec = r.compared?.required?.recommended || r.compared?.required?.min || {};
    const reasons = (r.reasons || [])
      .slice(0, 5)
      .map((x) => `<li>${escapeHtml(x.message)}</li>`)
      .join("");
    const ram = formatHwRam(r.compared?.user?.ramMB);
    body.innerHTML = `
      <p style="font-weight:800;margin:0 0 6px">${escapeHtml(label)}</p>
      <p class="view-sub" style="margin:0 0 10px">${escapeHtml(r.summary || "")}</p>
      ${reasons ? `<ul style="margin:0 0 12px;padding-left:18px;font-size:13px;color:var(--text-muted)">${reasons}</ul>` : ""}
      <div class="req-grid">
        <div class="req-card">
          <div class="req-label">Your PC</div>
          <p>${escapeHtml([r.compared?.user?.gpu, r.compared?.user?.cpu, ram ? `${ram} RAM` : null].filter(Boolean).join(" · ") || "—")}</p>
        </div>
        <div class="req-card">
          <div class="req-label">Game</div>
          <p>${escapeHtml(
            [
              rec.gpuText || rec.gpuTier ? `GPU: ${rec.gpuText || rec.gpuTier}` : null,
              rec.ramMB ? `RAM: ${formatHwRam(rec.ramMB)}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Requirements not fully specified"
          )}</p>
        </div>
      </div>
    `;
  } catch (err) {
    body.textContent = err?.message || "Couldn’t check compatibility.";
  }
}

function youtubeId(url) {
  try {
    const raw = String(url || "").trim();
    if (!raw) return null;
    const match = raw.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
    if (match?.[1]) return match[1];
    const u = new URL(raw);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v") || u.pathname.split("/")[2] || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function vimeoId(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("vimeo.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const id = parts.find((p) => /^\d+$/.test(p));
    return id || null;
  } catch {
    return null;
  }
}

function isPlayableVideo(url) {
  if (!url) return false;
  const s = String(url).trim();
  if (youtubeId(s) || vimeoId(s)) return true;
  return /\.(mp4|webm|m3u8)(\?|$)/i.test(s) || (s.includes("steamstatic.com") && (s.includes("movie") || s.includes(".webm") || s.includes(".mp4")));
}

function classifyMediaUrl(src) {
  const url = String(src || "").trim();
  const yt = youtubeId(url);
  if (yt) {
    return { kind: "youtube", src: url, embedUrl: `https://www.youtube-nocookie.com/embed/${yt}` };
  }
  const vim = vimeoId(url);
  if (vim) {
    return { kind: "vimeo", src: url, embedUrl: `https://player.vimeo.com/video/${vim}` };
  }
  return { kind: "direct", src: url };
}

async function renderGameDetailView(slug) {
  state.currentDetailSlug = slug;
  const container = views.gameDetail;
  if (!cachePeek(`game:${slug}`, CACHE_TTL.gameDetail)) {
    container.innerHTML = `<p class="view-sub">Loading game details...</p>`;
  }
  const detail = await cacheInvoke(`game:${slug}`, CACHE_TTL.gameDetail, () =>
    window.playbound.getGameDetail(slug)
  );
  if (!detail) {
    container.innerHTML = `<p class="view-sub">Game not found.</p>`;
    return;
  }

  const bgGrad =
    Array.isArray(detail.art) && detail.art.length >= 2
      ? `linear-gradient(135deg, ${detail.art[0]}, ${detail.art[1]})`
      : `linear-gradient(135deg, #312e81, #a78bfa)`;
  const coverUrl = detail.coverImage || "";
  const genreChips = (detail.genres || [])
    .map((g) => `<span class="chip">${escapeHtml(g)}</span>`)
    .join("");
  const featureItems = (detail.features || [])
    .map((f) => `<li>${escapeHtml(f)}</li>`)
    .join("");
  const shots = (detail.screenshots || [])
    .slice(0, 8)
    .map(
      (src) =>
        `<a class="shot-thumb" href="${escapeHtml(src)}" data-ext="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="" loading="lazy" /></a>`
    )
    .join("");

  const coverHtml = coverUrl
    ? `<div class="detail-cover"><img src="${escapeHtml(coverUrl)}" alt="" loading="lazy" /></div>`
    : `<div class="detail-cover detail-cover-fallback" style="background:${bgGrad}"><span>${escapeHtml(
        (detail.title || "?").charAt(0)
      )}</span></div>`;

  const [liveStats, editionsRes] = await Promise.all([
    cacheInvoke(`live:${slug}`, CACHE_TTL.liveStatsGame, () =>
      window.playbound.getLiveStats?.({ game: slug })
    ),
    cacheInvoke(`editions:${slug}`, CACHE_TTL.editions, () => window.playbound.getEditions?.(slug)),
  ]);
  const editions = Array.isArray(editionsRes?.editions) ? editionsRes.editions : [];
  const playingChip =
    liveStats && Number(liveStats.playingNow) > 0
      ? `<span class="playing-now-chip">${formatStatNumber(liveStats.playingNow)} playing now</span>`
      : liveStats
        ? `<span class="playing-now-chip">0 playing now</span>`
        : "";

  const faqHtml = (detail.faq || [])
    .map(
      (item) =>
        `<div class="faq-card"><h3>${escapeHtml(item.q || item.question || "FAQ")}</h3><p>${escapeHtml(item.a || item.answer || "")}</p></div>`
    )
    .join("");

  const whyHtml = detail.whyWePickedIt
    ? `<section class="detail-section">
        <h2 class="detail-section-title">Why we picked it</h2>
        <p class="detail-prose">${escapeHtml(detail.whyWePickedIt)}</p>
      </section>`
    : "";

  const bestForItems = (detail.bestFor || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const notForItems = (detail.notFor || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const fitHtml =
    bestForItems || notForItems
      ? `<section class="detail-section">
          <h2 class="detail-section-title">Best for</h2>
          <div class="fit-grid">
            ${
              bestForItems
                ? `<div><div class="req-label">Great when…</div><ul class="feature-list">${bestForItems}</ul></div>`
                : ""
            }
            ${
              notForItems
                ? `<div><div class="req-label">Skip if…</div><ul class="feature-list">${notForItems}</ul></div>`
                : ""
            }
          </div>
        </section>`
      : "";

  /*
   * No pre-selected edition when there is a real choice.
   *
   * Editions are not cosmetic — Project Quarm and EverQuest Live are different
   * servers, vanilla and Rat King Adventure are different games. Defaulting the
   * picker meant Install silently committed to whichever happened to be marked
   * default, which is the wrong call to make on someone's behalf.
   */
  const editionPickerOptions = [
    `<option value="" selected>Choose an edition…</option>`,
    ...editions.map(
      (ed) =>
        `<option value="${escapeHtml(ed.editionSlug)}">${escapeHtml(ed.editionName)}${
          ed.isDefault ? " (recommended)" : ""
        }</option>`
    ),
  ].join("");

  container.innerHTML = `
    <button class="btn-secondary btn-sm" id="detail-back" style="margin-bottom: 12px">← Back</button>

    <section class="detail-hero">
      ${coverHtml}
      <div class="detail-hero-copy">
        <div class="chip-row">${genreChips}${(detail.isMultiplayer ?? detail.multiplayer) ? '<span class="chip chip-accent">Multiplayer</span>' : ""}${detail.testing ? '<span class="chip chip-accent">Testing</span>' : ""}${playingChip}</div>
        <h1 class="view-title detail-hero-title">${escapeHtml(detail.title)}</h1>
        <p class="view-sub detail-hero-sub">${escapeHtml(detail.blurb)} · ${escapeHtml(detail.approxSize || "")}${detail.version ? ` · v${escapeHtml(detail.version)}` : ""}</p>
        <div class="detail-hero-actions" id="detail-actions"></div>
      </div>
    </section>

    <nav class="detail-tabs" id="detail-tabs">
      <button type="button" class="detail-tab ${state.detailActiveTab === "overview" ? "active" : ""}" data-tab="overview">Overview</button>
      <button type="button" class="detail-tab ${state.detailActiveTab === "install" ? "active" : ""}" data-tab="install">Install</button>
      ${(detail.hasServerBrowser ?? detail.multiplayer) ? `<button type="button" class="detail-tab ${state.detailActiveTab === "servers" ? "active" : ""}" data-tab="servers">Servers</button>` : ""}
      ${detail.mods && detail.mods.length > 0 ? `<button type="button" class="detail-tab ${state.detailActiveTab === "mods" ? "active" : ""}" data-tab="mods">Mods</button>` : ""}
      <button type="button" class="detail-tab ${state.detailActiveTab === "guides" ? "active" : ""}" data-tab="guides">Guides</button>
      <button type="button" class="detail-tab ${state.detailActiveTab === "achievements" ? "active" : ""}" data-tab="achievements">Achievements</button>
      <button type="button" class="detail-tab ${state.detailActiveTab === "news" ? "active" : ""}" data-tab="news">News</button>
      <button type="button" class="detail-tab ${state.detailActiveTab === "discussion" ? "active" : ""}" data-tab="discussion">Discussion</button>
      <button type="button" class="detail-tab ${state.detailActiveTab === "reviews" ? "active" : ""}" data-tab="reviews">Reviews</button>
      <button type="button" class="detail-tab ${state.detailActiveTab === "media" ? "active" : ""}" data-tab="media">Media</button>
    </nav>

    <div class="detail-tab-panels">
      <div class="detail-tab-panel ${state.detailActiveTab === "overview" ? "active" : ""}" data-panel="overview">
        ${buildActivityPanelHtml(liveStats)}
        ${
          editions.length > 1
            ? `<section class="detail-section" id="detail-editions-sec">
                 <h2 class="detail-section-title">Editions</h2>
                 <div class="editions-list" id="detail-editions-list"></div>
               </section>`
            : ""
        }
        <section class="detail-section">
          <h2 class="detail-section-title">About</h2>
          <p class="detail-prose">${escapeHtml(detail.description || detail.blurb || "")}</p>
        </section>
        ${whyHtml}
        ${fitHtml}
        ${
          featureItems
            ? `<section class="detail-section"><h2 class="detail-section-title">Features</h2><ul class="feature-list">${featureItems}</ul></section>`
            : ""
        }
        <section class="detail-section" id="detail-hw-compat">
          <h2 class="detail-section-title">Will this run on your PC?</h2>
          <p class="view-sub" id="detail-hw-compat-body">Checking…</p>
        </section>
        ${
          detail.systemRequirements
            ? `<section class="detail-section"><h2 class="detail-section-title">System Requirements</h2>
            <div class="req-grid">
              <div class="req-card"><div class="req-label">Minimum</div><p>${escapeHtml(detail.systemRequirements.min || "—")}</p></div>
              <div class="req-card"><div class="req-label">Recommended</div><p>${escapeHtml(detail.systemRequirements.recommended || "—")}</p></div>
            </div></section>`
            : ""
        }
        ${shots ? `<section class="detail-section"><h2 class="detail-section-title">Screenshots</h2><div class="shot-row">${shots}</div></section>` : ""}
        <p class="view-sub"><a href="#" id="detail-open-site">Open full page on playbound.club</a></p>
      </div>
      <div class="detail-tab-panel ${state.detailActiveTab === "install" ? "active" : ""}" data-panel="install">
        <section class="detail-section">
          <h2 class="detail-section-title">Install</h2>
          ${
            editions.length > 1
              ? `<label class="view-sub" for="detail-edition-pick">Edition</label>
                 <select class="input-text" id="detail-edition-pick" style="max-width:320px;margin:8px 0 6px">${editionPickerOptions}</select>
                 <p class="view-sub edition-gate-hint" id="detail-edition-hint" style="margin:0 0 14px">This game has ${editions.length} editions — pick one to install.</p>`
              : ""
          }
          ${
            detail.addons && detail.addons.length > 0
              ? `<div class="detail-addons-picker" style="margin: 0.75rem 0;">
                 <p style="font-weight:600; margin-bottom:0.5rem; font-size:13px; color:#a1a1aa;">Optional Downloads</p>
                 ${detail.addons
                   .map(
                     (a) =>
                       `<label style="display:block; font-size:13px; margin-bottom:0.25rem; color:#e2e8f0; display:flex; align-items:flex-start; gap:0.5rem; cursor:pointer;">
                          <input type="checkbox" class="addon-checkbox" value="${escapeHtml(a.id)}" checked style="margin-top:2px;" />
                          <div>
                            <div>${escapeHtml(a.name)}</div>
                            <div style="font-size:11px; color:#a1a1aa;">${escapeHtml(a.description || "")}</div>
                          </div>
                        </label>`
                   )
                   .join("")}
               </div>`
              : ""
          }
          <div class="detail-hero-actions" style="margin-bottom:16px">
            <button class="btn-primary" type="button" id="install-tab-install">${editions.length > 1 ? "Install selected edition" : "Install Game"}</button>
            ${detail.website ? `<button class="btn-secondary" type="button" id="install-tab-website">Official website</button>` : ""}
          </div>
          ${gamePlayHintHtml(slug)}
          ${
            detail.systemRequirements
              ? `<div class="req-grid" style="margin-bottom:16px;margin-top:16px">
              <div class="req-card"><div class="req-label">Minimum</div><p>${escapeHtml(detail.systemRequirements.min || "—")}</p></div>
              <div class="req-card"><div class="req-label">Recommended</div><p>${escapeHtml(detail.systemRequirements.recommended || "—")}</p></div>
            </div>`
              : ""
          }
          ${faqHtml ? `<h3 class="detail-section-title">FAQ</h3><div class="faq-list">${faqHtml}</div>` : `<p class="view-sub">No FAQ yet for this title.</p>`}
        </section>
      </div>
      <div class="detail-tab-panel ${state.detailActiveTab === "servers" ? "active" : ""}" data-panel="servers" id="detail-servers-sec"></div>
      <div class="detail-tab-panel ${state.detailActiveTab === "mods" ? "active" : ""}" data-panel="mods" id="detail-mods-sec"></div>
      <div class="detail-tab-panel ${state.detailActiveTab === "guides" ? "active" : ""}" data-panel="guides" id="detail-guides-sec"><p class="view-sub">Loading guides…</p></div>
      <div class="detail-tab-panel ${state.detailActiveTab === "achievements" ? "active" : ""}" data-panel="achievements" id="detail-achievements-sec">
        <p class="view-sub">Platform-wide achievements are planned but not tracked yet.</p>
        <p class="view-sub"><a href="#" id="achievements-open-site">Open on playbound.club</a></p>
      </div>
      <div class="detail-tab-panel ${state.detailActiveTab === "news" ? "active" : ""}" data-panel="news" id="detail-news-sec"><p class="view-sub">Loading releases…</p></div>
      <div class="detail-tab-panel ${state.detailActiveTab === "discussion" ? "active" : ""}" data-panel="discussion" id="detail-discussion-sec"><p class="view-sub">Loading discussion…</p></div>
      <div class="detail-tab-panel ${state.detailActiveTab === "reviews" ? "active" : ""}" data-panel="reviews" id="detail-reviews-sec"><p class="view-sub">Loading reviews…</p></div>
      <div class="detail-tab-panel ${state.detailActiveTab === "media" ? "active" : ""}" data-panel="media" id="detail-media-sec"></div>
    </div>
  `;

  const editionsList = document.getElementById("detail-editions-list");
  if (editionsList && editions.length > 1) {
    for (const ed of editions) {
      const row = document.createElement("div");
      row.className = "edition-row";
      const cover = ed.coverImage || ed.heroImage || "";
      row.innerHTML = `
        <div class="edition-row-thumb">${
          cover ? "" : escapeHtml((ed.editionName || "?").charAt(0))
        }</div>
        <div class="edition-row-copy">
          <strong>${escapeHtml(ed.editionName)}${
            ed.isDefault ? ` <span class="edition-row-tag">Default</span>` : ""
          }</strong>
          <span>${escapeHtml(ed.editionType || "")}${ed.shortDescription ? ` · ${escapeHtml(ed.shortDescription)}` : ""}</span>
        </div>
        <button type="button" class="btn-secondary btn-sm">View</button>
      `;
      if (cover) {
        // Set via DOM rather than markup so a broken URL cannot inject, and so
        // a failed load falls back to the initial rather than an empty box.
        const thumb = row.querySelector(".edition-row-thumb");
        const img = document.createElement("img");
        img.src = cover;
        img.alt = "";
        img.loading = "lazy";
        img.addEventListener("error", () => {
          img.remove();
          thumb.textContent = (ed.editionName || "?").charAt(0);
        });
        thumb.appendChild(img);
      }
      row.querySelector("button")?.addEventListener("click", () => {
        api.openEditionDetail(slug, ed.editionSlug);
      });
      editionsList.appendChild(row);
    }
  }

  /**
   * Which edition to install, or null when the player has not chosen yet.
   *
   * Only falls back to a default when there is no real choice to make — with
   * one edition (or none) the picker is not shown, so there is nothing to ask.
   */
  function selectedEditionSlug() {
    const pick = document.getElementById("detail-edition-pick");
    if (pick) return pick.value || null;
    const def = editions.find((e) => e.isDefault) || editions[0];
    return def?.editionSlug || null;
  }

  /** Keep Install inert until an edition is picked, and say why. */
  function syncInstallGate() {
    const pick = document.getElementById("detail-edition-pick");
    const btn = document.getElementById("install-tab-install");
    if (!pick || !btn) return;
    const chosen = Boolean(pick.value);
    btn.disabled = !chosen;
    btn.title = chosen ? "" : "Choose an edition first";
    const hint = document.getElementById("detail-edition-hint");
    if (hint) hint.hidden = chosen;
  }

  function selectedAddons() {
    const checkboxes = document.querySelectorAll(".addon-checkbox");
    return Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
  }

  async function runInstall(editionSlug) {
    setStatus("Starting install...");
    try {
      const addons = selectedAddons();
      const res = await window.playbound.install(slug, null, editionSlug || null, addons);
      if (res.status === "installed") {
        setStatus("Install complete!");
        setProgress(null);
        api.renderGameDetailView(slug);
      } else if (res.status === "installer-opened") {
        setStatus("Installer opened — waiting for installer to finish…");
        setProgress(null);
        api.renderGameDetailView(slug);
      } else if (res.status === "external") {
        setStatus("Opened download page.");
        setProgress(null);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
      setProgress(null);
    }
  }

  /**
   * Install, but never without an explicit edition when one is owed.
   *
   * Shared by every install entry point on this page so the rule cannot be
   * bypassed by whichever button happens to be on screen.
   */
  async function runInstallGated() {
    const ed = selectedEditionSlug();
    if (editions.length > 1 && !ed) {
      setStatus("Choose which edition you want before installing.", true);
      const pick = document.getElementById("detail-edition-pick");
      if (pick) {
        // Send the player to the tab that actually holds the picker.
        document.getElementById("install-tab-install")?.click();
        pick.focus();
      }
      return;
    }
    await runInstall(ed);
  }

  document.getElementById("detail-edition-pick")?.addEventListener("change", syncInstallGate);
  syncInstallGate();

  document.getElementById("install-tab-install")?.addEventListener("click", () => {
    void runInstallGated();
  });
  document.getElementById("install-tab-website")?.addEventListener("click", () => {
    if (detail.website) {
      window.playbound.openExternal(detail.website, {
        campaign: "launcher_game_website",
        content: slug,
      });
    }
  });
  document.getElementById("achievements-open-site")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.playbound.openExternal(
      `https://playbound.club/games/${encodeURIComponent(slug)}?tab=achievements`
    );
  });

  // Guides / news / media / discussion / reviews (lazy fill)
  void (async () => {
    const guidesSec = document.getElementById("detail-guides-sec");
    const newsSec = document.getElementById("detail-news-sec");
    const mediaSec = document.getElementById("detail-media-sec");
    const discussionSec = document.getElementById("detail-discussion-sec");
    const reviewsSec = document.getElementById("detail-reviews-sec");
    const [guidesRes, releasesRes, discussionsRes, reviewsRes] = await Promise.all([
      window.playbound.getGameGuides?.(slug) || Promise.resolve({ guides: [] }),
      window.playbound.getGameReleases?.(slug) || Promise.resolve({ releases: [] }),
      window.playbound.getGameDiscussions?.(slug) || Promise.resolve({ topics: [] }),
      window.playbound.getGameReviews?.(slug) || Promise.resolve({ reviews: [] }),
    ]);
    const guides = guidesRes?.guides || [];
    if (guidesSec) {
      if (!guides.length) {
        guidesSec.innerHTML = `<p class="view-sub">No guides yet. <a href="#" id="guides-open-site">Write one on playbound.club</a></p>`;
        document.getElementById("guides-open-site")?.addEventListener("click", (e) => {
          e.preventDefault();
          window.playbound.openExternal(
            `https://playbound.club/games/${encodeURIComponent(slug)}?tab=guides`
          );
        });
      } else {
        guidesSec.innerHTML = `<div class="guide-list">${guides
          .map(
            (g) =>
              `<button type="button" class="guide-card" data-url="${escapeHtml(g.url)}" style="text-align:left;cursor:pointer;width:100%;color:inherit;background:rgba(255,255,255,0.02)">
                <h3>${escapeHtml(g.title)}</h3>
                <p>${escapeHtml(g.excerpt || "")}</p>
                <p style="margin-top:6px;font-size:11px">${escapeHtml(g.username || "")} · ${escapeHtml(
                g.createdAt ? new Date(g.createdAt).toLocaleDateString() : ""
              )}</p>
              </button>`
          )
          .join("")}</div>`;
        guidesSec.querySelectorAll("[data-url]").forEach((el) => {
          el.addEventListener("click", () => window.playbound.openExternal(el.dataset.url));
        });
      }
    }
    const releases = releasesRes?.releases || [];
    if (newsSec) {
      if (!releases.length) {
        newsSec.innerHTML = `<p class="view-sub">No GitHub release notes available${
          detail.website
            ? `. <a href="#" id="news-website">Check the official site</a>`
            : "."
        }</p>`;
        document.getElementById("news-website")?.addEventListener("click", (e) => {
          e.preventDefault();
          window.playbound.openExternal(detail.website, {
            campaign: "launcher_game_website",
            content: slug,
          });
        });
      } else {
        newsSec.innerHTML = `<div class="release-list">${releases
          .map(
            (r) =>
              `<a class="release-card" href="${escapeHtml(r.url)}" data-ext="${escapeHtml(r.url)}" style="display:block;text-decoration:none;color:inherit">
                <h3>${escapeHtml(r.name || r.tagName)}</h3>
                <p>${escapeHtml(r.body || "")}</p>
                <p style="margin-top:6px;font-size:11px">${
                  r.publishedAt ? escapeHtml(new Date(r.publishedAt).toLocaleDateString()) : ""
                }</p>
              </a>`
          )
          .join("")}</div>`;
        newsSec.querySelectorAll("[data-ext]").forEach((a) => {
          a.addEventListener("click", (e) => {
            e.preventDefault();
            window.playbound.openExternal(a.dataset.ext, {
              campaign: "launcher_github",
              content: slug,
            });
          });
        });
      }
    }
    if (discussionSec) {
      const topics = discussionsRes?.topics || [];
      const boardUrl =
        discussionsRes?.boardUrl ||
        `https://playbound.club/games/${encodeURIComponent(slug)}?tab=discussion`;
      if (!topics.length) {
        discussionSec.innerHTML = `<p class="view-sub">No discussions yet. <a href="#" id="discussion-open-site">Start one on playbound.club</a></p>`;
      } else {
        discussionSec.innerHTML = `<div class="guide-list">${topics
          .map(
            (t) =>
              `<button type="button" class="guide-card" data-url="${escapeHtml(t.url)}" style="text-align:left;cursor:pointer;width:100%;color:inherit;background:rgba(255,255,255,0.02)">
                <h3>${t.isPinned ? "📌 " : ""}${escapeHtml(t.title)}</h3>
                <p style="margin-top:6px;font-size:11px">${escapeHtml(t.category || "")}${
                t.username ? ` · ${escapeHtml(t.username)}` : ""
              } · ${Number(t.replyCount) || 0} replies${t.isSolved ? " · Solved" : ""}</p>
              </button>`
          )
          .join(
            ""
          )}</div><p class="view-sub" style="margin-top:12px"><a href="#" id="discussion-open-site">Open discussion board on playbound.club</a></p>`;
        discussionSec.querySelectorAll("[data-url]").forEach((el) => {
          el.addEventListener("click", () => window.playbound.openExternal(el.dataset.url));
        });
      }
      document.getElementById("discussion-open-site")?.addEventListener("click", (e) => {
        e.preventDefault();
        window.playbound.openExternal(boardUrl);
      });
    }
    if (reviewsSec) {
      const reviews = reviewsRes?.reviews || [];
      if (!reviews.length) {
        reviewsSec.innerHTML = `<p class="view-sub">No reviews yet. <a href="#" id="reviews-open-site">Write one on playbound.club</a></p>`;
      } else {
        reviewsSec.innerHTML = `<div class="guide-list">${reviews
          .map(
            (r) =>
              `<button type="button" class="guide-card" data-url="${escapeHtml(r.url)}" style="text-align:left;cursor:pointer;width:100%;color:inherit;background:rgba(255,255,255,0.02)">
                <h3>${"★".repeat(Math.max(0, Math.min(5, Number(r.rating) || 0)))}${"☆".repeat(
                Math.max(0, 5 - (Number(r.rating) || 0))
              )} · ${escapeHtml(r.title || "Review")}</h3>
                <p>${escapeHtml(r.body || "")}</p>
                <p style="margin-top:6px;font-size:11px">${escapeHtml(r.username || "")}${
                r.createdAt ? ` · ${escapeHtml(new Date(r.createdAt).toLocaleDateString())}` : ""
              }</p>
              </button>`
          )
          .join(
            ""
          )}</div><p class="view-sub" style="margin-top:12px"><a href="#" id="reviews-open-site">Write or manage reviews on playbound.club</a></p>`;
        reviewsSec.querySelectorAll("[data-url]").forEach((el) => {
          el.addEventListener("click", () => window.playbound.openExternal(el.dataset.url));
        });
      }
      document.getElementById("reviews-open-site")?.addEventListener("click", (e) => {
        e.preventDefault();
        window.playbound.openExternal(
          `https://playbound.club/games/${encodeURIComponent(slug)}?tab=reviews`
        );
      });
    }
    if (mediaSec) {
      const vids = (Array.isArray(detail.videos) ? detail.videos : [])
        .filter(isPlayableVideo)
        .map(classifyMediaUrl);
      const shots = (Array.isArray(detail.screenshots) ? detail.screenshots : []).filter(Boolean);

      const countText = [
        vids.length > 0 ? `${vids.length} ${vids.length === 1 ? "video" : "videos"}` : "",
        shots.length > 0 ? `${shots.length} ${shots.length === 1 ? "screenshot" : "screenshots"}` : ""
      ].filter(Boolean).join(" · ");

      let videosHtml = "";
      if (vids.length > 0) {
        videosHtml = `
          <details open class="media-details-group">
            <summary class="media-details-summary">
              <span class="media-details-summary-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"/><line x1="7" x2="7" y1="2" y2="22"/><line x1="17" x2="17" y1="2" y2="22"/><line x1="2" x2="22" y1="12" y2="12"/><line x1="2" x2="7" y1="7" y2="7"/><line x1="2" x2="7" y1="17" y2="17"/><line x1="17" x2="22" y1="17" y2="17"/><line x1="17" x2="22" y1="7" y2="7"/></svg>
                <span>Videos</span>
                <span class="media-details-count-badge">${vids.length}</span>
              </span>
              <svg class="media-details-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </summary>
            <div class="media-grid-videos">
              ${vids
                .map((v) => {
                  if (v.kind === "youtube" || v.kind === "vimeo") {
                    return `
                      <div class="media-video-frame">
                        <iframe src="${escapeHtml(v.embedUrl)}" title="${escapeHtml(detail.title || "Game")} video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
                      </div>
                    `;
                  }
                  return `
                    <div class="media-video-frame">
                      <video src="${escapeHtml(v.src)}" controls preload="metadata" poster="${escapeHtml(detail.coverImage || "")}">
                        <source src="${escapeHtml(v.src)}" />
                      </video>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </details>
        `;
      }

      let screenshotsHtml = "";
      if (shots.length > 0) {
        screenshotsHtml = `
          <details open class="media-details-group">
            <summary class="media-details-summary">
              <span class="media-details-summary-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                <span>Screenshots</span>
                <span class="media-details-count-badge">${shots.length}</span>
              </span>
              <svg class="media-details-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </summary>
            <div class="media-grid-screenshots">
              ${shots
                .map(
                  (src) =>
                    `<a class="media-screenshot-card" href="${escapeHtml(src)}" data-ext="${escapeHtml(src)}">
                      <img src="${escapeHtml(src)}" alt="${escapeHtml(detail.title || "")} screenshot" loading="lazy" />
                    </a>`
                )
                .join("")}
            </div>
          </details>
        `;
      } else if (vids.length === 0) {
        screenshotsHtml = `
          <p class="view-sub">No screenshots uploaded for ${escapeHtml(detail.title || "this game")} yet.</p>
        `;
      }

      const footerHtml = `
        <p class="view-sub" style="font-size:12px; margin-top:12px">
          More screenshots and trailers live on ${
            detail.website
              ? `<a href="#" id="media-official-link" style="color:var(--accent-light);font-weight:600">the official ${escapeHtml(detail.title || "game")} site</a>`
              : `the official ${escapeHtml(detail.title || "game")} site`
          }.
        </p>
      `;

      mediaSec.innerHTML = `
        <div class="media-header">
          <h2>Media</h2>
          <span class="media-header-count">${escapeHtml(countText)}</span>
        </div>
        ${videosHtml}
        ${screenshotsHtml}
        ${footerHtml}
      `;

      document.getElementById("media-official-link")?.addEventListener("click", (e) => {
        e.preventDefault();
        if (detail.website) window.playbound.openExternal(detail.website);
      });

      mediaSec.querySelectorAll("a.media-screenshot-card").forEach((a) => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          window.playbound.openExternal(a.dataset.ext);
        });
      });
    }
  })();

  document.getElementById("detail-back").addEventListener("click", () => {
    const back = ["games", "library", "home", "servers"].includes(state.detailReturnView)
      ? state.detailReturnView
      : "games";
    api.navigateTo(back);
  });
  document.getElementById("detail-open-site")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.playbound.openExternal(`https://playbound.club/games/${encodeURIComponent(slug)}`);
  });
  void api.fillGameHardwareCompat(slug);
  container.querySelectorAll("a.shot-thumb").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      window.playbound.openExternal(a.dataset.ext);
    });
  });
  document.getElementById("detail-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    state.detailActiveTab = btn.dataset.tab;
    container.querySelectorAll(".detail-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === state.detailActiveTab);
    });
    container.querySelectorAll(".detail-tab-panel").forEach((p) => {
      p.classList.toggle("active", p.dataset.panel === state.detailActiveTab);
    });
  });

  const actions = document.getElementById("detail-actions");
  if (detail.installed) {
    actions.innerHTML = `
      <button class="btn-success" id="act-play">Play Now</button>
      ${window.playbound.platform.supportsDesktopShortcuts() ? `<button class="btn-secondary" id="act-shortcut">Create Shortcut</button>` : ""}
      <button class="btn-secondary" id="act-folder">${window.playbound.platform.getOS() === "macos" ? "Open in Finder" : "Open Folder"}</button>
      <button class="btn-danger" id="act-uninstall">Uninstall</button>
      ${state.accountState.connected ? `<button class="btn-secondary" id="act-create-party">Create Party</button>` : ""}
      ${gamePlayHintHtml(slug)}
    `;
    document.getElementById("act-play").addEventListener("click", async () => {
      try {
        setStatus("Checking Java / launching…");
        await window.playbound.play(slug);
        startGameSession(slug, detail.title || slug);
        setStatus(`Launched ${detail.title || slug}`);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    const btnShortcut = document.getElementById("act-shortcut");
    if (btnShortcut) {
      btnShortcut.addEventListener("click", async () => {
        try {
          const res = await window.playbound.createShortcut(slug);
          setStatus(`Desktop shortcut created for ${res.title}`);
        } catch (err) {
          setStatus(err.message || String(err), true);
        }
      });
    }
    document.getElementById("act-folder").addEventListener("click", () => {
      if (detail.installedPath) window.playbound.openFolder(detail.installedPath);
    });
    document.getElementById("act-uninstall").addEventListener("click", async () => {
      if (!confirm(`Uninstall ${detail.title}?`)) return;
      setStatus("Uninstalling...");
      try {
        await window.playbound.uninstall(slug);
        setStatus(`Uninstalled ${detail.title || slug}`);
        api.renderGameDetailView(slug);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  } else if (detail.pendingInstaller) {
    const locateLabel = selectExecutableLabel();
    actions.innerHTML = `
      <button class="btn-primary" id="act-locate">${locateLabel}</button>
      <button class="btn-secondary" id="act-dismiss-pending">Dismiss</button>
      <button class="btn-secondary" id="act-install">Re-run installer</button>
      ${state.accountState.connected ? `<button class="btn-secondary" id="act-create-party">Create Party</button>` : ""}
    `;
    setStatus(
      detail.scanning
        ? `Looking for ${detail.title}…`
        : `${detail.title} is in Library — ${selectExecutableLabel().toLowerCase()} if the scan missed it.`
    );
    document.getElementById("act-locate").addEventListener("click", async () => {
      setStatus("Looking for install…");
      try {
        const res = await window.playbound.locateExe(slug);
        if (res?.status === "cancelled") {
          setStatus("Locate cancelled.");
          return;
        }
        setStatus("Install located — added to library.");
        setProgress(null);
        api.renderGameDetailView(slug);
        if (state.currentView === "library") api.renderLibraryView();
      } catch (err) {
        setStatus(err.message || String(err), true);
        setProgress(null);
      }
    });
    document.getElementById("act-dismiss-pending").addEventListener("click", async () => {
      if (!confirm(`Remove ${detail.title} from Library? (Does not delete game files.)`)) return;
      await window.playbound.dismissPendingInstall?.(slug);
      api.renderGameDetailView(slug);
      if (state.currentView === "library") api.renderLibraryView();
    });
    document.getElementById("act-install").addEventListener("click", async () => {
      await runInstallGated();
    });
  } else {
    const showLocate =
      detail.isInstallerKind || Boolean(detail.knownExePaths?.length);
    actions.innerHTML = `
      <button class="btn-primary" id="act-install">Install Game</button>
      ${showLocate ? `<button class="btn-secondary" id="act-locate">I've finished installing</button>` : ""}
      ${state.accountState.connected ? `<button class="btn-secondary" id="act-create-party">Create Party</button>` : ""}
    `;
    document.getElementById("act-install").addEventListener("click", async () => {
      await runInstallGated();
    });
    document.getElementById("act-locate")?.addEventListener("click", async () => {
      setStatus("Looking for install…");
      try {
        const res = await window.playbound.locateExe(slug);
        if (res?.status === "cancelled") {
          setStatus("Locate cancelled.");
          return;
        }
        setStatus("Install located — added to library.");
        setProgress(null);
        api.renderGameDetailView(slug);
        if (state.currentView === "library") api.renderLibraryView();
      } catch (err) {
        setStatus(err.message || String(err), true);
        setProgress(null);
      }
    });
  }

  document.getElementById("act-create-party")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Creating…";
    try {
      const res = await window.playbound.createParty?.({ gameSlug: slug, visibility: "friends", maxSize: 8 });
      if (res?.error || !res?.party) throw new Error(res?.error || "Couldn't create party.");
      setStatus(`Party created for ${detail.title || slug}`);
      if (res.needsDiscordLink) {
        window.playbound.linkDiscord?.();
      } else if (res.inviteUrl || res.party?.discord?.inviteUrl) {
        window.playbound.openExternal(res.inviteUrl || res.party.discord.inviteUrl);
      }
      api.navigateTo("friends");
    } catch (err) {
      setStatus(err.message || String(err), true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Create Party";
    }
  });

  const modsSec = document.getElementById("detail-mods-sec");
  const mods = (Array.isArray(detail.mods) ? detail.mods : []).filter((m) =>
    state.compatibilityFilter === "compatible" ? isModDesktopCompatible(m) : true
  );
  if (mods.length) {
    modsSec.innerHTML = `<div class="mods-list"></div>`;
    const modsList = modsSec.querySelector(".mods-list");
    for (const mod of mods) {
      const row = document.createElement("div");
      row.className = "mod-row";
      const external = mod.downloadKind === "external";
      if (mod.installed && !external) {
        row.innerHTML = `
          <div>
            <div class="mod-row-title">${escapeHtml(mod.title)}</div>
            <div class="view-sub" style="margin:0">${escapeHtml(mod.tagline || "")}</div>
          </div>
          <div class="library-mod-actions">
            <button class="btn-primary btn-sm btn-mod-play" type="button">Play</button>
            ${
              mod.installedPath
                ? `<button class="btn-secondary btn-sm btn-mod-folder" type="button">Folder</button>`
                : ""
            }
            <button class="btn-danger btn-sm btn-mod-uninstall" type="button">Remove</button>
          </div>
        `;
        row.querySelector(".btn-mod-play")?.addEventListener("click", async () => {
          try {
            setStatus(`Launching ${mod.title}…`);
            await window.playbound.playMod(mod.slug);
            setStatus(`Launched ${mod.title}`);
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        });
        row.querySelector(".btn-mod-folder")?.addEventListener("click", () => {
          window.playbound.openFolder(mod.installedPath);
        });
        row.querySelector(".btn-mod-uninstall")?.addEventListener("click", async () => {
          if (!confirm(`Remove mod ${mod.title} from library tracking?`)) return;
          try {
            setStatus(`Removing ${mod.title}…`);
            await window.playbound.uninstallMod(mod.slug);
            setStatus(`Removed ${mod.title}`);
            api.renderGameDetailView(slug);
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        });
      } else {
        row.innerHTML = `
          <div>
            <div class="mod-row-title">${escapeHtml(mod.title)}</div>
            <div class="view-sub" style="margin:0">${escapeHtml(mod.tagline || "")}</div>
          </div>
          ${
            mod.installed && mod.installedPath
              ? `<div class="library-mod-actions">
            <button class="btn-secondary btn-sm btn-mod-folder" type="button">Folder</button>
            <button class="btn-danger btn-sm btn-mod-uninstall" type="button">Remove</button>
          </div>`
              : `<button class="btn-sm ${mod.installed ? "btn-secondary" : "btn-primary"}" type="button">
            ${
              mod.installed
                ? "Installed"
                : external
                  ? "Open download page"
                  : "Install"
            }
          </button>`
          }
        `;
        if (mod.installed && mod.installedPath) {
          row.querySelector(".btn-mod-folder")?.addEventListener("click", () => {
            window.playbound.openFolder(mod.installedPath);
          });
          row.querySelector(".btn-mod-uninstall")?.addEventListener("click", async () => {
            if (!confirm(`Remove mod ${mod.title} from library tracking?`)) return;
            try {
              setStatus(`Removing ${mod.title}…`);
              await window.playbound.uninstallMod(mod.slug);
              setStatus(`Removed ${mod.title}`);
              api.renderGameDetailView(slug);
            } catch (err) {
              setStatus(err.message || String(err), true);
            }
          });
        } else {
          const btn = row.querySelector("button");
          if (!mod.installed) {
            btn.addEventListener("click", async () => {
              setStatus(external ? `Opening download page for ${mod.title}…` : `Installing ${mod.title}…`);
              try {
                const res = await window.playbound.installMod(mod.slug);
                if (res?.status === "external") {
                  setStatus("Opened download page in browser.");
                  setProgress(null);
                } else if (res?.status === "waiting-base") {
                  setStatus("Installing base game first — finish the setup wizard…");
                  setProgress(null);
                } else {
                  setStatus("Mod install complete");
                  setProgress(null);
                  api.renderGameDetailView(slug);
                }
              } catch (err) {
                setStatus(err.message || String(err), true);
                setProgress(null);
              }
            });
          } else {
            btn.disabled = true;
          }
        }
      }
      modsList.appendChild(row);
      const titleEl = row.querySelector(".mod-row-title");
      if (titleEl) {
        titleEl.style.cursor = "pointer";
        titleEl.addEventListener("click", () => api.openModDetail(mod.slug, "gameDetail"));
      }
      void window.playbound.getLiveStats?.({ mod: mod.slug }).then((stats) => {
        if (!stats || !row.isConnected) return;
        const titleNode = row.querySelector(".mod-row-title");
        if (!titleNode) return;
        const chip = document.createElement("span");
        chip.className = "playing-now-chip";
        chip.style.marginLeft = "8px";
        chip.textContent = `${formatStatNumber(stats.playingNow)} playing now`;
        titleNode.appendChild(chip);
      });
    }
  } else {
    modsSec.innerHTML = `<p class="view-sub">No catalog mods for this title yet.</p>`;
  }

  async function loadDetailServers() {
    const sSec = document.getElementById("detail-servers-sec");
    if (!sSec) return;
    sSec.innerHTML = `<p class="view-sub">Loading live servers…</p>`;
    const serversRes = await window.playbound.getServers(slug);
    if (serversRes.supported && serversRes.servers?.length > 0) {
      const allServers = serversRes.servers.slice(0, 40);

      function paintDetailServers() {
        const { sort, sortDir } = detailServersSort;
        const dir = sortDir === "asc" ? 1 : -1;
        const sorted = allServers.slice().sort((a, b) => {
          if (sort === "players") {
            return dir * ((Number(a.players) || 0) - (Number(b.players) || 0));
          }
          const av = sort === "map" ? a.map || "" : a.name || "";
          const bv = sort === "map" ? b.map || "" : b.name || "";
          return dir * String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
        });
        const totalPlayers = sorted.reduce((n, s) => n + (Number(s.players) || 0), 0);
        const header = (key, label) => {
          const active = detailServersSort.sort === key;
          const arrow = active ? (detailServersSort.sortDir === "asc" ? " ↑" : " ↓") : "";
          return `<th class="sortable${active ? " sorted" : ""}" data-sort="${key}">${escapeHtml(label)}${arrow}</th>`;
        };
        sSec.innerHTML = `
          <div class="detail-servers-header">
            <p class="servers-stats">${totalPlayers} player${totalPlayers === 1 ? "" : "s"} · ${sorted.length} server${sorted.length === 1 ? "" : "s"}</p>
            <button class="btn-secondary btn-sm" id="detail-servers-refresh" type="button">Refresh</button>
          </div>
          <table class="server-table">
            <thead>
              <tr>
                ${header("name", "Server Name")}
                ${header("players", "Players")}
                ${header("map", "Map")}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${sorted
                .map(
                  (s) => `
                <tr>
                  <td><strong>${escapeHtml(s.name)}</strong></td>
                  <td>${s.players == null ? "—" : `${s.players}/${s.maxPlayers ?? "—"}`}</td>
                  <td>${escapeHtml(s.map || "Standard")}</td>
                  <td>
                    <button class="btn-primary btn-sm btn-join-s" data-host="${escapeHtml(s.host)}" data-port="${Number(s.port) || 0}">Join</button>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        `;
        document.getElementById("detail-servers-refresh")?.addEventListener("click", () => {
          loadDetailServers();
        });
        sSec.querySelectorAll("th.sortable").forEach((th) => {
          th.addEventListener("click", () => {
            const key = th.dataset.sort;
            if (detailServersSort.sort === key) {
              detailServersSort.sortDir = detailServersSort.sortDir === "asc" ? "desc" : "asc";
            } else {
              detailServersSort.sort = key;
              detailServersSort.sortDir = state.SERVER_SORT_DEFAULT_DIR[key] || "asc";
            }
            paintDetailServers();
          });
        });
        sSec.querySelectorAll(".btn-join-s").forEach((b) => {
          b.addEventListener("click", async () => {
            await window.playbound.play(slug, { host: b.dataset.host, port: Number(b.dataset.port) });
            startGameSession(slug, detail.title || slug);
          });
        });
      }

      paintDetailServers();
    } else if (detail.hasServerBrowser ?? detail.multiplayer) {
      sSec.innerHTML = `
        <div class="detail-servers-header">
          <p class="view-sub" style="margin:0">No live servers listed right now.</p>
          <button class="btn-secondary btn-sm" id="detail-servers-refresh" type="button">Refresh</button>
        </div>
      `;
      document.getElementById("detail-servers-refresh")?.addEventListener("click", () => {
        loadDetailServers();
      });
    } else {
      sSec.innerHTML = `<p class="view-sub">This title doesn't list dedicated servers.</p>`;
    }
  }

  void loadDetailServers();
  markViewReady(container, slug);
}

async function renderModDetailView(slug) {
  state.currentModDetailSlug = slug;
  const container = views.modDetail;
  if (!container) return;
  if (!cachePeek(`mod:${slug}`, CACHE_TTL.modDetail)) {
    container.innerHTML = `<p class="view-sub">Loading mod details...</p>`;
  }

  const detail = await cacheInvoke(`mod:${slug}`, CACHE_TTL.modDetail, () =>
    window.playbound.getModDetail?.(slug)
  );
  if (!detail) {
    container.innerHTML = `<p class="view-sub">Mod not found.</p>`;
    return;
  }

  const bgGrad =
    Array.isArray(detail.art) && detail.art.length >= 2
      ? `linear-gradient(135deg, ${detail.art[0]}, ${detail.art[1]})`
      : `linear-gradient(135deg, #312e81, #a78bfa)`;
  const coverUrl = detail.coverImage || detail.baseGame?.coverImage || "";
  const coverHtml = coverUrl
    ? `<div class="detail-cover"><img src="${escapeHtml(coverUrl)}" alt="" loading="lazy" /></div>`
    : `<div class="detail-cover detail-cover-fallback" style="background:${bgGrad}"><span>${escapeHtml(
        (detail.title || "?").charAt(0)
      )}</span></div>`;

  const faqHtml = (detail.faq || [])
    .map(
      (item) =>
        `<div class="faq-card"><h3>${escapeHtml(item.q || item.question || "FAQ")}</h3><p>${escapeHtml(item.a || item.answer || "")}</p></div>`
    )
    .join("");

  const installSteps = (detail.installSteps || [])
    .map(
      (step, i) =>
        `<div class="faq-card"><h3>Step ${i + 1}</h3><p>${escapeHtml(step.text || "")}${
          step.command ? `<br/><code>${escapeHtml(step.command)}</code>` : ""
        }</p></div>`
    )
    .join("");

  const shots = (detail.screenshots || [])
    .slice(0, 12)
    .map(
      (src) =>
        `<a class="shot-thumb" href="${escapeHtml(src)}" data-ext="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="" loading="lazy" /></a>`
    )
    .join("");

  const external = detail.downloadKind === "external";
  const baseTitle = detail.baseGame?.title || detail.baseGame?.slug || "";

  container.innerHTML = `
    <button class="btn-secondary btn-sm" id="mod-detail-back" style="margin-bottom: 12px">← Back</button>

    <section class="detail-hero">
      ${coverHtml}
      <div class="detail-hero-copy">
        <div class="chip-row"><span class="chip chip-accent">Mod</span>${
          baseTitle ? `<span class="chip">For ${escapeHtml(baseTitle)}</span>` : ""
        }</div>
        <h1 class="view-title detail-hero-title">${escapeHtml(detail.title)}</h1>
        <p class="view-sub detail-hero-sub">${escapeHtml(detail.tagline || "")}${
          detail.approxSize ? ` · ${escapeHtml(detail.approxSize)}` : ""
        }${detail.version ? ` · v${escapeHtml(detail.version)}` : ""}</p>
        <div class="detail-hero-actions" id="mod-detail-actions"></div>
      </div>
    </section>

    <nav class="detail-tabs" id="mod-detail-tabs">
      <button type="button" class="detail-tab ${state.modDetailActiveTab === "overview" ? "active" : ""}" data-tab="overview">Overview</button>
      <button type="button" class="detail-tab ${state.modDetailActiveTab === "install" ? "active" : ""}" data-tab="install">Install</button>
      <button type="button" class="detail-tab ${state.modDetailActiveTab === "media" ? "active" : ""}" data-tab="media">Media</button>
      <button type="button" class="detail-tab ${state.modDetailActiveTab === "faq" ? "active" : ""}" data-tab="faq">FAQ</button>
      <button type="button" class="detail-tab ${state.modDetailActiveTab === "guides" ? "active" : ""}" data-tab="guides">Guides</button>
    </nav>

    <div class="detail-tab-panels">
      <div class="detail-tab-panel ${state.modDetailActiveTab === "overview" ? "active" : ""}" data-panel="overview">
        ${
          detail.whatItChanges
            ? `<section class="detail-section"><h2 class="detail-section-title">What it changes</h2><p>${escapeHtml(
                detail.whatItChanges
              )}</p></section>`
            : ""
        }
        <section class="detail-section">
          <h2 class="detail-section-title">About</h2>
          <p style="white-space:pre-wrap">${escapeHtml(
            detail.longDescription || detail.description || detail.tagline || ""
          )}</p>
        </section>
        ${
          detail.compatibility
            ? `<section class="detail-section"><h2 class="detail-section-title">Compatibility</h2><p>${escapeHtml(
                detail.compatibility
              )}</p></section>`
            : ""
        }
        <div class="detail-hero-actions" style="margin-top:12px">
          <button type="button" class="btn-secondary btn-sm" data-web-tab="reviews">Reviews on site</button>
          <button type="button" class="btn-secondary btn-sm" data-web-tab="discussion">Discussion on site</button>
          <button type="button" class="btn-secondary btn-sm" id="mod-detail-open-site">Open on playbound.club</button>
        </div>
      </div>
      <div class="detail-tab-panel ${state.modDetailActiveTab === "install" ? "active" : ""}" data-panel="install">
        <section class="detail-section">
          <h2 class="detail-section-title">${external ? "Download" : "Install"}</h2>
          <p class="view-sub">${
            external
              ? "This mod opens an external download page. Place files in the game mods folder afterward."
              : `Installs into ${escapeHtml(detail.installRelativePath || "mods")} for ${escapeHtml(
                  baseTitle || "the base game"
                )}.`
          }</p>
          ${installSteps || "<p class=\"view-sub\">No extra install steps listed.</p>"}
        </section>
      </div>
      <div class="detail-tab-panel ${state.modDetailActiveTab === "media" ? "active" : ""}" data-panel="media">
        ${
          shots
            ? `<section class="detail-section"><h2 class="detail-section-title">Screenshots</h2><div class="shot-row">${shots}</div></section>`
            : `<p class="view-sub">No media yet.</p>`
        }
      </div>
      <div class="detail-tab-panel ${state.modDetailActiveTab === "faq" ? "active" : ""}" data-panel="faq">
        ${faqHtml || `<p class="view-sub">No FAQ yet.</p>`}
      </div>
      <div class="detail-tab-panel ${state.modDetailActiveTab === "guides" ? "active" : ""}" data-panel="guides" id="mod-detail-guides-sec"><p class="view-sub">Loading guides…</p></div>
    </div>
  `;

  const guidesSec = document.getElementById("mod-detail-guides-sec");
  void (async () => {
    const guidesRes =
      (await window.playbound.getModGuides?.(slug)) || { guides: [] };
    const guides = guidesRes?.guides || [];
    if (!guidesSec) return;
    if (!guides.length) {
      guidesSec.innerHTML = `<p class="view-sub">No guides yet. <a href="#" id="mod-guides-open-site">Write one on playbound.club</a></p>`;
      document.getElementById("mod-guides-open-site")?.addEventListener("click", (e) => {
        e.preventDefault();
        window.playbound.openExternal(
          `https://playbound.club/mods/${encodeURIComponent(slug)}?tab=guides`
        );
      });
    } else {
      guidesSec.innerHTML = `<div class="guide-list">${guides
        .map(
          (g) =>
            `<a class="guide-card" href="#" data-url="${escapeHtml(g.url || "")}"><strong>${escapeHtml(
              g.title
            )}</strong><span class="view-sub">${escapeHtml(g.username || "")}${
              g.createdAt ? ` · ${escapeHtml(String(g.createdAt).slice(0, 10))}` : ""
            }</span><p>${escapeHtml(g.excerpt || "")}</p></a>`
        )
        .join("")}</div>`;
      guidesSec.querySelectorAll("[data-url]").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          if (el.dataset.url) window.playbound.openExternal(el.dataset.url);
        });
      });
    }
  })();

  document.getElementById("mod-detail-back")?.addEventListener("click", () => {
    const back = ["mods", "library", "home", "games", "gameDetail", "servers"].includes(
      state.detailReturnView
    )
      ? state.detailReturnView
      : "mods";
    if (back === "gameDetail" && state.currentDetailSlug) {
      api.navigateTo("gameDetail", { slug: state.currentDetailSlug });
    } else {
      api.navigateTo(back);
    }
  });

  document.getElementById("mod-detail-open-site")?.addEventListener("click", () => {
    window.playbound.openExternal(`https://playbound.club/mods/${encodeURIComponent(slug)}`);
  });
  container.querySelectorAll("[data-web-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.playbound.openExternal(
        `https://playbound.club/mods/${encodeURIComponent(slug)}?tab=${encodeURIComponent(
          btn.dataset.webTab
        )}`
      );
    });
  });
  container.querySelectorAll("a.shot-thumb").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      window.playbound.openExternal(a.dataset.ext);
    });
  });
  document.getElementById("mod-detail-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    state.modDetailActiveTab = btn.dataset.tab;
    container.querySelectorAll(".detail-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === state.modDetailActiveTab);
    });
    container.querySelectorAll(".detail-tab-panel").forEach((p) => {
      p.classList.toggle("active", p.dataset.panel === state.modDetailActiveTab);
    });
  });

  const actions = document.getElementById("mod-detail-actions");
  if (!actions) return;

  if (detail.installed && !external) {
    actions.innerHTML = `
      <button class="btn-success" id="mod-act-play">Play</button>
      ${
        detail.installedPath
          ? `<button class="btn-secondary" id="mod-act-folder">${
              window.playbound.platform.getOS() === "macos" ? "Open in Finder" : "Open Folder"
            }</button>`
          : ""
      }
      <button class="btn-danger" id="mod-act-uninstall">Uninstall</button>
      <button class="btn-secondary" id="mod-act-reinstall">Reinstall</button>
    `;
    document.getElementById("mod-act-play")?.addEventListener("click", async () => {
      try {
        setStatus(`Launching ${detail.title}…`);
        await window.playbound.playMod(slug);
        setStatus(`Launched ${detail.title}`);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    document.getElementById("mod-act-folder")?.addEventListener("click", () => {
      if (detail.installedPath) window.playbound.openFolder(detail.installedPath);
    });
    document.getElementById("mod-act-uninstall")?.addEventListener("click", async () => {
      if (!confirm(`Remove mod ${detail.title}?`)) return;
      try {
        setStatus(`Removing ${detail.title}…`);
        await window.playbound.uninstallMod(slug);
        setStatus(`Removed ${detail.title}`);
        api.renderModDetailView(slug);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    document.getElementById("mod-act-reinstall")?.addEventListener("click", async () => {
      try {
        setStatus(`Installing ${detail.title}…`);
        await window.playbound.installMod(slug);
        setStatus(`Installed ${detail.title}`);
        setProgress(null);
        api.renderModDetailView(slug);
      } catch (err) {
        setStatus(err.message || String(err), true);
        setProgress(null);
      }
    });
  } else {
    actions.innerHTML = `
      <button class="btn-primary" id="mod-act-install">${
        external ? "Open download page" : "Install"
      }</button>
      ${
        detail.baseGame?.slug
          ? `<button class="btn-secondary" id="mod-act-base">View base game</button>`
          : ""
      }
    `;
    document.getElementById("mod-act-install")?.addEventListener("click", async () => {
      try {
        setStatus(external ? `Opening download page for ${detail.title}…` : `Installing ${detail.title}…`);
        const result = await window.playbound.installMod(slug);
        if (result?.status === "external") {
          setStatus("Opened download page in browser.");
          setProgress(null);
        } else if (result?.status === "waiting-base") {
          setStatus("Installing base game first — finish the setup wizard…");
          setProgress(null);
        } else {
          setStatus(`Installed ${detail.title}`);
          setProgress(null);
          api.renderModDetailView(slug);
        }
      } catch (err) {
        setStatus(err.message || String(err), true);
        setProgress(null);
      }
    });
    document.getElementById("mod-act-base")?.addEventListener("click", () => {
      if (detail.baseGame?.slug) api.openGameDetail(detail.baseGame.slug, "modDetail");
    });
  }
  markViewReady(container, slug);
}

async function renderEditionDetailView(gameSlug, editionSlug) {
  const container = views.editionDetail;
  if (!container) return;
  container.innerHTML = `<p class="view-sub">Loading edition…</p>`;

  const [editionsRes, liveStats, gameDetail] = await Promise.all([
    window.playbound.getEditions?.(gameSlug) || Promise.resolve({ editions: [] }),
    window.playbound.getLiveStats?.({ game: gameSlug, edition: editionSlug }) ||
      Promise.resolve(null),
    window.playbound.getGameDetail(gameSlug),
  ]);
  const edition = (editionsRes?.editions || []).find((e) => e.editionSlug === editionSlug);
  if (!edition) {
    container.innerHTML = `
      <button class="btn-secondary btn-sm" id="edition-back">← Back to game</button>
      <p class="view-sub" style="margin-top:12px">Edition not found.</p>
    `;
    document.getElementById("edition-back")?.addEventListener("click", () =>
      api.openGameDetail(gameSlug, state.detailReturnView)
    );
    return;
  }

  const cover = edition.coverImage || gameDetail?.coverImage || "";
  const coverHtml = cover
    ? `<div class="detail-cover"><img src="${escapeHtml(cover)}" alt="" loading="lazy" /></div>`
    : `<div class="detail-cover detail-cover-fallback"><span>${escapeHtml(
        (edition.editionName || "?").charAt(0)
      )}</span></div>`;

  const links = edition.links || {};
  const linkButtons = [
    ["Website", links.website],
    ["Discord", links.discord],
    ["Wiki", links.wiki],
    ["GitHub", links.github],
    ["Forum", links.forum],
  ]
    .filter(([, url]) => url)
    .map(
      ([label, url]) =>
        `<button type="button" class="btn-secondary btn-sm" data-ext="${escapeHtml(url)}">${escapeHtml(label)}</button>`
    )
    .join("");

  const editionInstalled = Boolean(
    (gameDetail?.installedEditions || []).some(
      (e) => e.editionSlug === editionSlug && e.exe
    )
  );

  const playSteps = Array.isArray(edition.installAction?.steps)
    ? edition.installAction.steps
    : Array.isArray(edition.installConfig?.playbound_installer?.steps)
      ? edition.installConfig.playbound_installer.steps
      : [];
  const playStepsHtml = playSteps.length
    ? `<ol class="edition-play-steps">${playSteps
        .map(
          (step, i) =>
            `<li><span class="edition-step-n">${i + 1}</span><div><p>${escapeHtml(
              step.text || ""
            )}</p>${
              step.command
                ? `<code class="edition-step-cmd">${escapeHtml(step.command)}</code>`
                : ""
            }</div></li>`
        )
        .join("")}</ol>`
    : "";
  const installNote =
    edition.installAction?.note || edition.installConfig?.playbound_installer?.note || "";
  const reqNotes = edition.requirements?.notes || "";
  const faqHtml = (edition.faq || [])
    .map(
      (item) =>
        `<div class="faq-card"><h3>${escapeHtml(item.q || "FAQ")}</h3><p>${escapeHtml(
          item.a || ""
        )}</p></div>`
    )
    .join("");

  container.innerHTML = `
    <button class="btn-secondary btn-sm" id="edition-back" style="margin-bottom:12px">← ${escapeHtml(
      edition.gameTitle || gameSlug
    )}</button>
    <section class="detail-hero">
      ${coverHtml}
      <div class="detail-hero-copy">
        <div class="chip-row">
          <span class="chip">${escapeHtml(edition.editionType || "edition")}</span>
          ${
            liveStats
              ? `<span class="playing-now-chip">${formatStatNumber(liveStats.playingNow)} playing now</span>`
              : ""
          }
        </div>
        <h1 class="view-title detail-hero-title">${escapeHtml(edition.editionName)}</h1>
        <p class="view-sub detail-hero-sub">${escapeHtml(edition.shortDescription || "")}</p>
        <div class="detail-hero-actions">
          <button class="btn-primary" id="edition-install">${
            editionInstalled ? "Reinstall this edition" : "Install this edition"
          }</button>
          ${
            editionInstalled
              ? `<button class="btn-success" id="edition-play">Play</button>
                 <button class="btn-danger" id="edition-uninstall">Uninstall</button>
                 ${gamePlayHintHtml(gameSlug)}`
              : ""
          }
        </div>
      </div>
    </section>
    ${buildActivityPanelHtml(liveStats, "Edition activity")}
    <section class="detail-section">
      <h2 class="detail-section-title">About</h2>
      ${(edition.description || edition.shortDescription || "")
        .split(/\n\n+/)
        .filter(Boolean)
        .map((para) => `<p class="detail-prose">${escapeHtml(para)}</p>`)
        .join("")}
    </section>
    ${
      playStepsHtml
        ? `<section class="detail-section"><h2 class="detail-section-title">How to get playing</h2>${playStepsHtml}${
            installNote ? `<p class="view-sub" style="margin-top:10px">${escapeHtml(installNote)}</p>` : ""
          }${
            reqNotes
              ? `<p class="edition-req-note">${escapeHtml(reqNotes)}</p>`
              : ""
          }</section>`
        : ""
    }
    ${
      edition.requirements && (edition.requirements.min || edition.requirements.recommended)
        ? `<section class="detail-section"><h2 class="detail-section-title">System Requirements</h2>
        <div class="req-grid">
          <div class="req-card"><div class="req-label">Minimum</div><p>${escapeHtml(edition.requirements.min || "—")}</p></div>
          <div class="req-card"><div class="req-label">Recommended</div><p>${escapeHtml(edition.requirements.recommended || "—")}</p></div>
        </div></section>`
        : ""
    }
    ${
      faqHtml
        ? `<section class="detail-section"><h2 class="detail-section-title">FAQ</h2><div class="faq-list">${faqHtml}</div></section>`
        : ""
    }
    ${
      linkButtons
        ? `<section class="detail-section"><h2 class="detail-section-title">Community</h2><div class="detail-web-tabs">${linkButtons}</div></section>`
        : ""
    }
  `;

  document.getElementById("edition-back")?.addEventListener("click", () =>
    api.openGameDetail(gameSlug, state.detailReturnView)
  );
  document.getElementById("edition-install")?.addEventListener("click", async () => {
    setStatus("Starting install...");
    try {
      const res = await window.playbound.install(gameSlug, null, editionSlug);
      if (res.status === "installed") {
        setStatus(res.note || "Install complete!");
        setProgress(null);
        api.renderEditionDetailView(gameSlug, editionSlug);
      } else if (res.status === "installer-opened") {
        setStatus("Installer opened — waiting for installer to finish…");
        setProgress(null);
        api.openGameDetail(gameSlug, "editionDetail");
      } else if (res.status === "external") {
        setStatus("Opened download page.");
        setProgress(null);
      } else if (res.status === "cancelled") {
        setStatus(res.note || "Install cancelled.");
        setProgress(null);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
      setProgress(null);
    }
  });
  document.getElementById("edition-play")?.addEventListener("click", async () => {
    try {
      setStatus("Checking Java / launching…");
      await window.playbound.play(gameSlug, null, editionSlug);
      startGameSession(gameSlug, edition.gameTitle || gameSlug);
      setStatus(`Launched ${edition.editionName || edition.gameTitle || gameSlug}`);
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });
  document.getElementById("edition-uninstall")?.addEventListener("click", async () => {
    if (!confirm(`Uninstall ${edition.editionName}? Other editions stay installed.`)) return;
    try {
      await window.playbound.uninstall(gameSlug, editionSlug);
      setStatus(`Uninstalled ${edition.editionName}`);
      api.renderEditionDetailView(gameSlug, editionSlug);
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });
  container.querySelectorAll("[data-ext]").forEach((btn) => {
    btn.addEventListener("click", () =>
      window.playbound.openExternal(btn.dataset.ext, {
        campaign: "launcher_edition_link",
        content: `${gameSlug}:${editionSlug}`,
      })
    );
  });
  markViewReady(container, `${gameSlug}:${editionSlug}`);
}

api.renderGameDetailView = renderGameDetailView;
api.renderModDetailView = renderModDetailView;
api.renderEditionDetailView = renderEditionDetailView;
api.fillGameHardwareCompat = fillGameHardwareCompat;
