import { createFreeOfferCard, createGameCard } from "../cards.js";
import {
  api,
  buildActivityPanelHtml,
  CACHE_TTL,
  cacheInvalidate,
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
  updateGamesFamilyNav,
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

function buildOverviewSidebarHtml(detail, slug, liveStats = null) {
  const dev = detail.developer || detail.developerName || "Independent";
  const pub = detail.publisher || "—";
  const release = detail.releaseYear || detail.releaseDate || "—";
  const license = detail.license || "Free";
  const platforms = Array.isArray(detail.platforms)
    ? detail.platforms.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ")
    : "Windows";
  const mp = (detail.isMultiplayer ?? detail.multiplayer) ? "Yes (Multiplayer)" : "Singleplayer";
  const controller = detail.controllerSupport || "Supported";
  const cloudSaves = detail.cloudSaves ? "Supported" : "Local Backup";

  return `
    <aside class="detail-overview-sidebar">
      <!-- Activity leads the sidebar: it is the only part that changes while
           you are looking at the page, and it fills in after the paint. -->
      <div id="detail-activity-slot">${liveStats ? buildActivityPanelHtml(liveStats) : ""}</div>
      <div class="detail-sidebar-card">
        <div class="detail-sidebar-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent-light)"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>
          <span>Game Details</span>
        </div>
        <div class="detail-sidebar-row">
          <span class="detail-sidebar-label">Developer</span>
          <span class="detail-sidebar-val">${escapeHtml(dev)}</span>
        </div>
        ${pub !== "—" ? `
        <div class="detail-sidebar-row">
          <span class="detail-sidebar-label">Publisher</span>
          <span class="detail-sidebar-val">${escapeHtml(pub)}</span>
        </div>` : ""}
        <div class="detail-sidebar-row">
          <span class="detail-sidebar-label">Release</span>
          <span class="detail-sidebar-val">${escapeHtml(String(release))}</span>
        </div>
        <div class="detail-sidebar-row">
          <span class="detail-sidebar-label">License</span>
          <span class="detail-sidebar-val">${escapeHtml(license)}</span>
        </div>
        <div class="detail-sidebar-row">
          <span class="detail-sidebar-label">Platforms</span>
          <span class="detail-sidebar-val">${escapeHtml(platforms)}</span>
        </div>
        <div class="detail-sidebar-row">
          <span class="detail-sidebar-label">Multiplayer</span>
          <span class="detail-sidebar-val">${escapeHtml(mp)}</span>
        </div>
        <div class="detail-sidebar-row">
          <span class="detail-sidebar-label">Controller</span>
          <span class="detail-sidebar-val">${escapeHtml(controller)}</span>
        </div>
        <div class="detail-sidebar-row">
          <span class="detail-sidebar-label">Save Backups</span>
          <span class="detail-sidebar-val">${escapeHtml(cloudSaves)}</span>
        </div>
      </div>

      <div class="detail-sidebar-card">
        <div class="detail-sidebar-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent-light)"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          <span>Links & Community</span>
        </div>
        <div class="detail-sidebar-links">
          ${detail.website ? `
          <button class="detail-sidebar-link-btn" type="button" id="sidebar-link-website">
            <span>🌐 Official Website</span>
            <span>↗</span>
          </button>` : ""}
          ${detail.discord || detail.discordInvite ? `
          <button class="detail-sidebar-link-btn" type="button" id="sidebar-link-discord">
            <span>💬 Discord Community</span>
            <span>↗</span>
          </button>` : ""}
          ${detail.githubRepo ? `
          <button class="detail-sidebar-link-btn" type="button" id="sidebar-link-github">
            <span>💻 GitHub Repository</span>
            <span>↗</span>
          </button>` : ""}
          <button class="detail-sidebar-link-btn" type="button" id="sidebar-link-playbound">
            <span>🚀 View on playbound.club</span>
            <span>↗</span>
          </button>
        </div>
      </div>
    </aside>
  `;
}

function buildInstallStepsHtml(detail) {
  let steps = Array.isArray(detail.installSteps) && detail.installSteps.length > 0 ? detail.installSteps : null;
  if (!steps) {
    steps = [
      {
        platform: "all",
        text: `Click "Install Game" in the PlayBound Launcher to automatically download and verify all required packages for ${detail.title || "this title"}.`,
      },
      {
        platform: "all",
        text: `PlayBound will safely extract and configure the installation folder in your chosen games directory.`,
      },
      {
        platform: "all",
        text: `Once setup finishes, the button switches to "Play Now" so you can jump straight into the game.`,
      },
    ];
  }
  return `
    <div class="install-steps-list">
      ${steps.map((step, i) => `
        <div class="install-step-card">
          <div class="install-step-num">${i + 1}</div>
          <div class="install-step-content">
            ${step.platform && step.platform !== "all" ? `<div class="install-step-platform">${escapeHtml(step.platform)}</div>` : ""}
            <div class="install-step-text">${escapeHtml(step.text || "")}</div>
            ${step.command ? `<pre class="install-step-cmd"><code>${escapeHtml(step.command)}</code></pre>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

/**
 * Guards against a superseded render painting last.
 *
 * Finishing an install fires two forced re-renders — one from the
 * install-detected event, one when the install call returns — and they race.
 * Whichever resolves last writes the DOM, so without this the older render
 * could repaint the pre-install hero over the correct one.
 */
let detailRenderToken = 0;

async function renderGameDetailView(slug, opts = {}) {
  const renderToken = ++detailRenderToken;
  // Clear the previous game's count first: carrying it over flashes an
  // Editions nav entry on a game that turns out to have none.
  if (state.currentDetailSlug !== slug) state.currentDetailEditionCount = 0;
  state.currentDetailSlug = slug;
  const container = views.gameDetail;
  const force = Boolean(opts?.force);
  if (force) {
    cacheInvalidate(`game:${slug}`);
    cacheInvalidate(`editions:${slug}`);
  }
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


  /*
   * Only editions gate the paint — the hero button depends on how many there
   * are. Live stats used to be awaited alongside it, which meant a slow
   * counting query held the whole page on "Loading game details…"; it is
   * started here and folded in when it lands, the same way the games grid
   * paints first and fills counts in after.
   */
  const livePromise = cacheInvoke(`live:${slug}`, CACHE_TTL.liveStatsGame, () =>
    window.playbound.getLiveStats?.({ game: slug })
  ).catch(() => null);

  const editionsRes = await cacheInvoke(`editions:${slug}`, CACHE_TTL.editions, () =>
    window.playbound.getEditions?.(slug)
  ).catch(() => null);
  const editions = Array.isArray(editionsRes?.editions) ? editionsRes.editions : [];
  // Drives whether the Editions nav entry appears for this game.
  state.currentDetailEditionCount = editions.length;
  updateGamesFamilyNav();

  // Cached stats paint immediately; anything still in flight arrives below.
  const cachedLive = cachePeek(`live:${slug}`, CACHE_TTL.liveStatsGame)?.data || null;
  const playingChip = cachedLive
    ? `<span class="playing-now-chip" id="detail-playing-chip">${formatStatNumber(
        Number(cachedLive.playingNow) || 0
      )} playing now</span>`
    : `<span class="playing-now-chip" id="detail-playing-chip" hidden></span>`;
  const liveStats = cachedLive;

  const faqHtml = (detail.faq || [])
    .map(
      (item) =>
        `<div class="faq-card"><h3>${escapeHtml(item.q || item.question || "FAQ")}</h3><p>${escapeHtml(item.a || item.answer || "")}</p></div>`
    )
    .join("");

  const whyHtml = detail.whyWePickedIt
    ? `<section class="detail-section">
        <div class="detail-why-card">
          <div class="detail-why-title">Why we picked it</div>
          <p class="detail-prose">${escapeHtml(detail.whyWePickedIt)}</p>
        </div>
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
          <h2 class="detail-section-title">Who it's for</h2>
          <div class="fit-grid">
            ${
              bestForItems
                ? `<div class="fit-card great"><div class="fit-card-label">✓ Great when…</div><ul>${bestForItems}</ul></div>`
                : ""
            }
            ${
              notForItems
                ? `<div class="fit-card skip"><div class="fit-card-label">✕ Skip if…</div><ul>${notForItems}</ul></div>`
                : ""
            }
          </div>
        </section>`
      : "";

  const editionPickerOptions = [
    `<option value="" selected>Choose an edition…</option>`,
    ...editions.map(
      (ed) =>
        `<option value="${escapeHtml(ed.editionSlug)}">${escapeHtml(ed.editionName)}${
          ed.isDefault ? " (recommended)" : ""
        }</option>`
    ),
  ].join("");

  const genreFirst = (detail.genres || ["game"])[0]?.toLowerCase() || "game";
  const reqGridHtml = detail.systemRequirements
    ? `<div class="req-grid">
        <div class="req-card"><div class="req-label">Minimum</div><p>${escapeHtml(detail.systemRequirements.min || "—")}</p></div>
        <div class="req-card"><div class="req-label">Recommended</div><p>${escapeHtml(detail.systemRequirements.recommended || "—")}</p></div>
      </div>`
    : "";

  // A newer render started while this one was fetching — let it win rather
  // than painting stale state over it.
  if (renderToken !== detailRenderToken) return;

  container.innerHTML = `

    <!--
      Mirrors the website's game hero: the art fills the band, a scrim keeps
      the type readable over it, and the copy sits bottom-left with the
      actions bottom-right. Kept structurally identical to the web page so
      the two can be changed together rather than drifting apart.
    -->
    <section class="detail-hero" style="${
      coverUrl ? `background-image:url('${escapeHtml(coverUrl)}')` : `background:${bgGrad}`
    }">
      <div class="detail-hero-scrim"></div>
      <div class="detail-hero-inner">
        <div class="detail-hero-copy">
          <div class="chip-row">${genreChips}${(detail.isMultiplayer ?? detail.multiplayer) ? '<span class="chip chip-accent">Multiplayer</span>' : ""}${detail.testing ? '<span class="chip chip-accent">Testing</span>' : ""}${playingChip}</div>
          <h1 class="detail-hero-title">${escapeHtml(detail.title)}</h1>
          <p class="detail-hero-sub">${escapeHtml(detail.blurb || "")} · ${escapeHtml(detail.approxSize || "")}${detail.version ? ` · v${escapeHtml(detail.version)}` : ""}</p>
        </div>
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
      <!-- ── Overview Tab ────────────────────────────────────── -->
      <div class="detail-tab-panel ${state.detailActiveTab === "overview" ? "active" : ""}" data-panel="overview">
        <div class="detail-overview-grid">
          <div class="detail-overview-main">
            ${
              editions.length > 1
                ? `<section class="detail-section" id="detail-editions-sec">
                     <h2 class="detail-section-title">Available Editions</h2>
                     <p class="view-sub" style="margin-top:-6px;margin-bottom:12px">${editions.length} ways to play ${escapeHtml(detail.title)}. Each has its own install and community.</p>
                     <div class="detail-editions-grid" id="detail-editions-list"></div>
                   </section>`
                : ""
            }

            <section class="detail-section">
              <h2 class="detail-section-title">About ${escapeHtml(detail.title)}</h2>
              <p class="detail-prose">${escapeHtml(detail.description || detail.blurb || "")}</p>
            </section>

            ${whyHtml}
            ${fitHtml}

            ${
              featureItems
                ? `<section class="detail-section"><h2 class="detail-section-title">Key Features</h2><ul class="feature-list">${featureItems}</ul></section>`
                : ""
            }

            <section class="detail-section" id="detail-hw-compat">
              <h2 class="detail-section-title">Will this run on your PC?</h2>
              <p class="view-sub" id="detail-hw-compat-body">Checking compatibility with your hardware…</p>
            </section>

            ${
              reqGridHtml
                ? `<section class="detail-section"><h2 class="detail-section-title">System Requirements</h2>${reqGridHtml}</section>`
                : ""
            }

            ${shots ? `<section class="detail-section"><h2 class="detail-section-title">Screenshots</h2><div class="shot-row">${shots}</div></section>` : ""}
          </div>

          ${buildOverviewSidebarHtml(detail, slug, liveStats)}
        </div>
      </div>

      <!-- ── Install Tab ─────────────────────────────────────── -->
      <div class="detail-tab-panel ${state.detailActiveTab === "install" ? "active" : ""}" data-panel="install">
        <div class="tab-panel-header"><h2>How to install ${escapeHtml(detail.title)} for free</h2></div>
        <div class="install-header-card">
          <p class="install-header-prose">
            ${escapeHtml(detail.title)} is a free ${escapeHtml(genreFirst)} game released under ${escapeHtml(detail.license || "an open license")}. It runs on ${escapeHtml((detail.platforms || ["Windows"]).join(", "))}, needs about ${escapeHtml(detail.approxSize || "disk space")}, and requires no account or payment.
          </p>
        </div>

        <div class="detail-sidebar-card" style="margin-bottom:24px">
          ${
            editions.length > 1
              ? `<label class="view-sub" for="detail-edition-pick" style="font-weight:700;color:var(--text-main);display:block;margin-bottom:6px">Select Edition to Install</label>
                 <select class="input-text" id="detail-edition-pick" style="max-width:360px;margin-bottom:8px">${editionPickerOptions}</select>
                 <p class="view-sub edition-gate-hint" id="detail-edition-hint" style="margin:0 0 14px">This game has ${editions.length} editions — pick one to install.</p>`
              : ""
          }
          ${
            detail.addons && detail.addons.length > 0
              ? `<div class="detail-addons-picker" style="margin: 12px 0 16px;">
                 <p style="font-weight:700; margin-bottom:0.5rem; font-size:13px; color:var(--text-main);">Optional Downloads & Addons</p>
                 ${detail.addons
                   .map(
                     (a) =>
                       `<label style="display:block; font-size:13px; margin-bottom:0.35rem; color:#e2e8f0; display:flex; align-items:flex-start; gap:0.6rem; cursor:pointer;">
                          <input type="checkbox" class="addon-checkbox" value="${escapeHtml(a.id)}" checked style="margin-top:3px;" />
                          <div>
                            <div style="font-weight:600">${escapeHtml(a.name)}</div>
                            <div style="font-size:11px; color:#a1a1aa;">${escapeHtml(a.description || "")}</div>
                          </div>
                        </label>`
                   )
                   .join("")}
               </div>`
              : ""
          }
          <div class="detail-hero-actions" style="margin:0">
            <button class="btn-primary" type="button" id="install-tab-install">${editions.length > 1 ? "Install Selected Edition" : "Install Game"}</button>
            <button class="btn-secondary" type="button" id="install-tab-locate">Already installed? Add to Library</button>
            ${detail.website ? `<button class="btn-secondary" type="button" id="install-tab-website">Official website</button>` : ""}
          </div>
          ${gamePlayHintHtml(slug)}
        </div>

        <section class="detail-section">
          <h3 class="detail-section-title">Installation Steps</h3>
          ${buildInstallStepsHtml(detail)}
        </section>

        ${
          reqGridHtml
            ? `<section class="detail-section"><h3 class="detail-section-title">System Requirements</h3>${reqGridHtml}</section>`
            : ""
        }

        <section class="detail-section">
          <h3 class="detail-section-title">Frequently Asked Questions</h3>
          ${faqHtml ? `<div class="faq-list">${faqHtml}</div>` : `<p class="view-sub">No FAQ yet for this title.</p>`}
        </section>
      </div>

      <!-- ── Dynamic Subnav Tabs ─────────────────────────────── -->
      <div class="detail-tab-panel ${state.detailActiveTab === "servers" ? "active" : ""}" data-panel="servers" id="detail-servers-sec"></div>
      <div class="detail-tab-panel ${state.detailActiveTab === "mods" ? "active" : ""}" data-panel="mods" id="detail-mods-sec"></div>
      <div class="detail-tab-panel ${state.detailActiveTab === "guides" ? "active" : ""}" data-panel="guides" id="detail-guides-sec"><p class="view-sub">Loading guides…</p></div>
      <div class="detail-tab-panel ${state.detailActiveTab === "achievements" ? "active" : ""}" data-panel="achievements" id="detail-achievements-sec">
        <div class="tab-panel-header">
          <h2>Achievements</h2>
          <button class="btn-secondary btn-sm" id="achievements-open-site">View on playbound.club</button>
        </div>
        <!--
          The website says plainly that these are not tracked yet. Four cards
          with no state behind them read as a working feature, so the status
          leads and the list is labelled as what it is.
        -->
        <div class="tab-empty">
          <div class="tab-empty-icon">🏆</div>
          <h3>Not tracked yet</h3>
          <p>Platform-wide achievements are planned but not tracked yet.</p>
        </div>
        <p class="tab-panel-subhead">Planned milestones</p>
        <div class="achievements-grid">
          <div class="achievement-card"><div class="achievement-icon">🎮</div><div><div class="achievement-name">First Launch</div><div class="achievement-desc">Launch the game from PlayBound</div></div></div>
          <div class="achievement-card"><div class="achievement-icon">⏱️</div><div><div class="achievement-name">Time Well Spent</div><div class="achievement-desc">Log 5+ hours of playtime</div></div></div>
          <div class="achievement-card"><div class="achievement-icon">⚔️</div><div><div class="achievement-name">Community Hero</div><div class="achievement-desc">Join an online community match</div></div></div>
          <div class="achievement-card"><div class="achievement-icon">💾</div><div><div class="achievement-name">Safekeeper</div><div class="achievement-desc">Sync or back up your save files</div></div></div>
        </div>
      </div>
      <div class="detail-tab-panel ${state.detailActiveTab === "news" ? "active" : ""}" data-panel="news" id="detail-news-sec"><p class="view-sub">Loading releases…</p></div>
      <div class="detail-tab-panel ${state.detailActiveTab === "discussion" ? "active" : ""}" data-panel="discussion" id="detail-discussion-sec"><p class="view-sub">Loading discussion…</p></div>
      <div class="detail-tab-panel ${state.detailActiveTab === "reviews" ? "active" : ""}" data-panel="reviews" id="detail-reviews-sec"><p class="view-sub">Loading reviews…</p></div>
      <div class="detail-tab-panel ${state.detailActiveTab === "media" ? "active" : ""}" data-panel="media" id="detail-media-sec"></div>
    </div>

    ${
      editions.length > 1
        ? `<!--
             Edition chooser. The hero's install button opens this rather than
             bouncing the player to the Install tab with an error, which is
             what it used to do: the button says install, so it should lead to
             installing something.
           -->
           <div class="modal-overlay" id="modal-edition-pick">
             <div class="modal-card">
               <div class="modal-header">
                 <h2 class="modal-title">Choose an edition</h2>
                 <button type="button" class="modal-close" id="btn-close-edition-pick">✕</button>
               </div>
               <div class="modal-body">
                 <p class="view-sub" style="margin:0 0 14px">
                   ${editions.length} ways to play ${escapeHtml(detail.title)}. Each installs separately, so you can keep more than one.
                 </p>
                 <div class="edition-choice-list">
                   ${editions
                     .map(
                       (ed) => `
                     <div class="edition-choice" data-edition="${escapeHtml(ed.editionSlug)}">
                       <div class="edition-choice-main">
                         <div class="edition-choice-head">
                           <span class="edition-choice-title">${escapeHtml(ed.editionName)}</span>
                           ${ed.isDefault ? `<span class="chip chip-accent edition-choice-chip">Recommended</span>` : ""}
                         </div>
                         ${
                           ed.shortDescription || ed.description
                             ? `<p class="edition-choice-desc">${escapeHtml(ed.shortDescription || ed.description)}</p>`
                             : ""
                         }
                       </div>
                       <div class="edition-choice-actions">
                         <button type="button" class="btn-secondary btn-sm" data-edition-details="${escapeHtml(ed.editionSlug)}">Details</button>
                         <button type="button" class="btn-primary btn-sm" data-edition-install="${escapeHtml(ed.editionSlug)}">Install</button>
                       </div>
                     </div>`
                     )
                     .join("")}
                 </div>
               </div>
             </div>
           </div>`
        : ""
    }
  `;

  const editionsList = document.getElementById("detail-editions-list");
  if (editionsList && editions.length > 1) {
    for (const ed of editions) {
      const card = document.createElement("div");
      card.className = "detail-edition-card";
      const cover = ed.coverImage || ed.heroImage || detail.coverImage || "";
      const banner = cover
        ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" />`
        : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:32px;font-weight:900;color:rgba(255,255,255,0.8)">${escapeHtml((ed.editionName || "?").charAt(0))}</div>`;
      
      card.innerHTML = `
        <div class="detail-edition-card-banner">${banner}</div>
        <div class="detail-edition-card-body">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span class="detail-edition-card-title">${escapeHtml(ed.editionName)}</span>
            ${ed.isDefault ? `<span class="chip chip-accent" style="font-size:10px;padding:2px 8px">Default</span>` : ""}
          </div>
          <div class="detail-edition-card-desc">${escapeHtml(ed.shortDescription || ed.description || "")}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:8px">
            <span class="chip" style="font-size:11px">${escapeHtml(ed.editionType || "edition")}</span>
            <button type="button" class="btn-secondary btn-sm">View Edition</button>
          </div>
        </div>
      `;
      card.addEventListener("click", () => {
        api.openEditionDetail(slug, ed.editionSlug);
      });
      editionsList.appendChild(card);
    }
  }

  // Sidebar link handlers
  document.getElementById("sidebar-link-website")?.addEventListener("click", () => {
    if (detail.website) window.playbound.openExternal(detail.website, { campaign: "launcher_sidebar", content: slug });
  });
  document.getElementById("sidebar-link-discord")?.addEventListener("click", () => {
    const d = detail.discord || detail.discordInvite;
    if (d) window.playbound.openExternal(d, { campaign: "launcher_sidebar", content: slug });
  });
  document.getElementById("sidebar-link-github")?.addEventListener("click", () => {
    if (detail.githubRepo) window.playbound.openExternal(`https://github.com/${detail.githubRepo}`, { campaign: "launcher_sidebar", content: slug });
  });
  document.getElementById("sidebar-link-playbound")?.addEventListener("click", () => {
    window.playbound.openExternal(`https://playbound.club/games/${encodeURIComponent(slug)}`);
  });

  /**
   * Which edition to install, or null when the player has not chosen yet.
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
      cacheInvalidate(`game:${slug}`);
      cacheInvalidate(`editions:${slug}`);
      const addons = selectedAddons();
      const res = await window.playbound.install(slug, null, editionSlug || null, addons);
      cacheInvalidate(`game:${slug}`);
      cacheInvalidate(`editions:${slug}`);
      if (res.status === "installed") {
        setStatus("Install complete!");
        setProgress(null);
        api.renderGameDetailView(slug, { force: true });
      } else if (res.status === "installer-opened") {
        setStatus("Installer opened — waiting for installer to finish…");
        setProgress(null);
        api.renderGameDetailView(slug, { force: true });
      } else if (res.status === "external") {
        setStatus("Opened download page.");
        setProgress(null);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
      setProgress(null);
    }
  }

  function openEditionPicker() {
    document.getElementById("modal-edition-pick")?.classList.add("open");
  }

  function closeEditionPicker() {
    document.getElementById("modal-edition-pick")?.classList.remove("open");
  }

  /**
   * Install, asking which edition first when there is a real choice.
   *
   * `fromPicker` is how the modal's own buttons skip the prompt they just
   * answered — without it, choosing an edition would reopen the chooser.
   */
  async function runInstallGated(editionSlug = null, fromPicker = false) {
    if (editionSlug) {
      await runInstall(editionSlug);
      return;
    }
    const ed = selectedEditionSlug();
    if (editions.length > 1 && !ed && !fromPicker) {
      openEditionPicker();
      return;
    }
    await runInstall(ed);
  }

  document.getElementById("detail-edition-pick")?.addEventListener("change", syncInstallGate);
  syncInstallGate();

  // ── Edition chooser ──────────────────────────────────────────────────────
  document.getElementById("btn-close-edition-pick")?.addEventListener("click", closeEditionPicker);
  document.getElementById("modal-edition-pick")?.addEventListener("click", (e) => {
    // Backdrop only — a click inside the card must not dismiss it.
    if (e.target.id === "modal-edition-pick") closeEditionPicker();
  });
  document.querySelectorAll("[data-edition-install]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ed = btn.dataset.editionInstall;
      closeEditionPicker();
      // Keep the Install tab's picker in step, so the two never disagree
      // about which edition the player chose.
      const pick = document.getElementById("detail-edition-pick");
      if (pick) {
        pick.value = ed;
        syncInstallGate();
      }
      await runInstallGated(ed, true);
    });
  });
  document.querySelectorAll("[data-edition-details]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeEditionPicker();
      api.openEditionDetail(slug, btn.dataset.editionDetails);
    });
  });

  document.getElementById("install-tab-install")?.addEventListener("click", () => {
    void runInstallGated();
  });
  document.getElementById("install-tab-locate")?.addEventListener("click", () => {
    document.getElementById("act-locate")?.click();
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

  /*
   * Live stats, folded in whenever they land. The page has already painted by
   * now, so a slow counting query costs a late-appearing number rather than a
   * page that never arrives.
   */
  void livePromise.then((stats) => {
    if (!stats || renderToken !== detailRenderToken) return;
    const chip = document.getElementById("detail-playing-chip");
    if (chip) {
      chip.textContent = `${formatStatNumber(Number(stats.playingNow) || 0)} playing now`;
      chip.hidden = false;
    }
    const slot = document.getElementById("detail-activity-slot");
    if (slot) slot.innerHTML = buildActivityPanelHtml(stats);
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
        guidesSec.innerHTML = `
          <div class="tab-panel-header"><h2>Community Guides</h2></div>
          <div class="tab-empty">
            <div class="tab-empty-icon">📖</div>
            <h3>No guides published yet</h3>
            <p>Share your tips, walkthroughs, and strategies with the PlayBound community.</p>
            <button class="btn-primary btn-sm" id="guides-open-site">Write a guide on playbound.club</button>
          </div>
        `;
        document.getElementById("guides-open-site")?.addEventListener("click", (e) => {
          e.preventDefault();
          window.playbound.openExternal(
            `https://playbound.club/games/${encodeURIComponent(slug)}?tab=guides`
          );
        });
      } else {
        guidesSec.innerHTML = `
          <div class="tab-panel-header">
            <h2>Community Guides</h2>
            <button class="btn-secondary btn-sm" id="guides-top-open-site">Write a Guide ↗</button>
          </div>
          <div class="guide-cards-grid">${guides
            .map(
              (g) =>
                `<div class="guide-full-card" data-url="${escapeHtml(g.url)}">
                  <div class="guide-card-title">📖 ${escapeHtml(g.title)}</div>
                  <div class="guide-card-excerpt">${escapeHtml(g.excerpt || "")}</div>
                  <div class="guide-card-footer">
                    <span>${escapeHtml(g.username || "Community")} · ${escapeHtml(
                  g.createdAt ? new Date(g.createdAt).toLocaleDateString() : ""
                )}</span>
                    <span style="color:var(--accent-light);font-weight:600">Read guide ↗</span>
                  </div>
                </div>`
            )
            .join("")}</div>`;
        guidesSec.querySelectorAll("[data-url]").forEach((el) => {
          el.addEventListener("click", () => window.playbound.openExternal(el.dataset.url));
        });
        document.getElementById("guides-top-open-site")?.addEventListener("click", (e) => {
          e.preventDefault();
          window.playbound.openExternal(`https://playbound.club/games/${encodeURIComponent(slug)}?tab=guides`);
        });
      }
    }
    const releases = releasesRes?.releases || [];
    if (newsSec) {
      if (!releases.length) {
        newsSec.innerHTML = `
          <div class="tab-panel-header"><h2>Updates &amp; Changelogs</h2></div>
          <div class="tab-empty">
            <div class="tab-empty-icon">📰</div>
            <h3>No GitHub release notes found</h3>
            <p>Check the official project website for development news and update history.</p>
            ${
              detail.website
                ? `<button class="btn-secondary btn-sm" id="news-website">Visit official site ↗</button>`
                : ""
            }
          </div>
        `;
        document.getElementById("news-website")?.addEventListener("click", (e) => {
          e.preventDefault();
          window.playbound.openExternal(detail.website, {
            campaign: "launcher_game_website",
            content: slug,
          });
        });
      } else {
        newsSec.innerHTML = `
          <div class="tab-panel-header">
            <h2>Updates &amp; Changelogs</h2>
            ${detail.website ? `<button class="btn-secondary btn-sm" id="news-website">Official Site ↗</button>` : ""}
          </div>
          <div class="releases-feed">${releases
            .map(
              (r) =>
                `<div class="release-full-card">
                  <div class="release-header">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span class="chip chip-accent">${escapeHtml(r.tagName || "update")}</span>
                      <span class="release-title">${escapeHtml(r.name || r.tagName)}</span>
                    </div>
                    <span class="release-date">${
                      r.publishedAt ? escapeHtml(new Date(r.publishedAt).toLocaleDateString()) : ""
                    }</span>
                  </div>
                  <div class="release-body">${escapeHtml(r.body || "No changelog text provided.")}</div>
                  <div style="margin-top:auto;padding-top:10px">
                    <button class="btn-secondary btn-sm" data-ext="${escapeHtml(r.url)}" type="button">View Release on GitHub ↗</button>
                  </div>
                </div>`
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
        document.getElementById("news-website")?.addEventListener("click", (e) => {
          e.preventDefault();
          window.playbound.openExternal(detail.website, {
            campaign: "launcher_game_website",
            content: slug,
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
        discussionSec.innerHTML = `
          <div class="tab-panel-header"><h2>Community Discussion</h2></div>
          <div class="tab-empty">
            <div class="tab-empty-icon">💬</div>
            <h3>No discussions yet</h3>
            <p>Start the conversation with other players on the PlayBound discussion board.</p>
            <button class="btn-primary btn-sm" id="discussion-open-site">Start a discussion on playbound.club</button>
          </div>
        `;
      } else {
        discussionSec.innerHTML = `
          <div class="tab-panel-header">
            <h2>Community Discussion</h2>
            <button class="btn-secondary btn-sm" id="discussion-top-open-site">Start Discussion ↗</button>
          </div>
          <div class="discussions-list">${topics
            .map(
              (t) =>
                `<div class="discussion-full-card" data-url="${escapeHtml(t.url)}">
                  <div class="discussion-main">
                    <div style="display:flex;align-items:center;gap:8px">
                      ${t.isPinned ? '<span style="font-size:12px">📌</span>' : ""}
                      ${t.category ? `<span class="chip" style="font-size:10px;padding:2px 6px">${escapeHtml(t.category)}</span>` : ""}
                      <span class="discussion-title">${escapeHtml(t.title)}</span>
                    </div>
                    <div class="discussion-meta">
                      <span>${escapeHtml(t.username || "Player")}</span>
                      ${t.isSolved ? `<span style="color:#34d27b;font-weight:700">· Solved</span>` : ""}
                    </div>
                  </div>
                  <div class="chip" style="flex-shrink:0">💬 ${Number(t.replyCount) || 0}</div>
                </div>`
            )
            .join(
              ""
            )}</div>`;
        discussionSec.querySelectorAll("[data-url]").forEach((el) => {
          el.addEventListener("click", () => window.playbound.openExternal(el.dataset.url));
        });
        document.getElementById("discussion-top-open-site")?.addEventListener("click", (e) => {
          e.preventDefault();
          window.playbound.openExternal(boardUrl);
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
        reviewsSec.innerHTML = `
          <div class="tab-panel-header"><h2>Player Reviews</h2></div>
          <div class="tab-empty">
            <div class="tab-empty-icon">⭐</div>
            <h3>No reviews written yet</h3>
            <p>Be the first to review ${escapeHtml(detail.title || "this game")} and let other players know what you think.</p>
            <button class="btn-primary btn-sm" id="reviews-open-site">Write a review on playbound.club</button>
          </div>
        `;
      } else {
        const avgScore = (reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / reviews.length).toFixed(1);
        reviewsSec.innerHTML = `
          <div class="tab-panel-header">
            <h2>Player Reviews</h2>
            <button class="btn-secondary btn-sm" id="reviews-top-open-site">Write a Review ↗</button>
          </div>
          <div class="reviews-summary-card">
            <div class="reviews-summary-score">
              <span>★ ${avgScore}</span>
              <span class="reviews-summary-outof">/ 5.0 (${reviews.length} ${reviews.length === 1 ? "review" : "reviews"})</span>
            </div>
          </div>
          <div class="reviews-list">${reviews
            .map(
              (r) =>
                `<div class="review-full-card" data-url="${escapeHtml(r.url)}">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span class="review-rating-stars">${"★".repeat(Math.max(0, Math.min(5, Number(r.rating) || 0)))}${"☆".repeat(
                        Math.max(0, 5 - (Number(r.rating) || 0))
                      )}</span>
                      <strong style="font-size:15px">${escapeHtml(r.title || "Review")}</strong>
                    </div>
                    <span style="font-size:11.5px;color:var(--text-dim)">${
                      r.createdAt ? escapeHtml(new Date(r.createdAt).toLocaleDateString()) : ""
                    }</span>
                  </div>
                  <p class="detail-prose" style="font-size:13.5px">${escapeHtml(r.body || "")}</p>
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;font-size:12px;color:var(--text-muted)">
                    <span>${escapeHtml(r.username || "Verified Player")}</span>
                    <span style="color:var(--accent-light);font-weight:600">Read on site ↗</span>
                  </div>
                </div>`
            )
            .join(
              ""
            )}</div>`;
        reviewsSec.querySelectorAll("[data-url]").forEach((el) => {
          el.addEventListener("click", () => window.playbound.openExternal(el.dataset.url));
        });
        document.getElementById("reviews-top-open-site")?.addEventListener("click", (e) => {
          e.preventDefault();
          window.playbound.openExternal(`https://playbound.club/games/${encodeURIComponent(slug)}?tab=reviews`);
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
          <div class="tab-empty">
            <div class="tab-empty-icon">🖼️</div>
            <h3>No media yet</h3>
            <p>No screenshots or trailers have been uploaded for ${escapeHtml(detail.title || "this game")}.</p>
          </div>
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
        <div class="tab-panel-header">
          <h2>Media</h2>
          <span class="tab-panel-meta">${escapeHtml(countText)}</span>
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
      if (!confirm(`Uninstall ${detail.title}? This also removes PlayBound mods for this game.`)) return;
      setStatus("Uninstalling...");
      try {
        cacheInvalidate(`game:${slug}`);
        cacheInvalidate(`editions:${slug}`);
        const res = await window.playbound.uninstall(slug);
        cacheInvalidate(`game:${slug}`);
        cacheInvalidate(`editions:${slug}`);
        if (res?.warning) setStatus(`Removed ${detail.title || slug} from your library. ${res.warning}`, true);
        else setStatus(`Uninstalled ${detail.title || slug}`);
        api.renderGameDetailView(slug, { force: true });
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
        cacheInvalidate(`game:${slug}`);
        cacheInvalidate(`editions:${slug}`);
        const res = await window.playbound.locateExe(slug);
        cacheInvalidate(`game:${slug}`);
        cacheInvalidate(`editions:${slug}`);
        if (res?.status === "cancelled") {
          setStatus("Locate cancelled.");
          return;
        }
        setStatus("Install located — added to library.");
        setProgress(null);
        api.renderGameDetailView(slug, { force: true });
        if (state.currentView === "library") api.renderLibraryView();
      } catch (err) {
        setStatus(err.message || String(err), true);
        setProgress(null);
      }
    });
    document.getElementById("act-dismiss-pending").addEventListener("click", async () => {
      if (!confirm(`Remove ${detail.title} from Library? (Does not delete game files.)`)) return;
      cacheInvalidate(`game:${slug}`);
      cacheInvalidate(`editions:${slug}`);
      await window.playbound.dismissPendingInstall?.(slug);
      cacheInvalidate(`game:${slug}`);
      cacheInvalidate(`editions:${slug}`);
      api.renderGameDetailView(slug, { force: true });
      if (state.currentView === "library") api.renderLibraryView();
    });
    document.getElementById("act-install").addEventListener("click", async () => {
      await runInstallGated();
    });
  } else {
    /*
     * Label matches the website's hero for the same condition. There it links
     * to the editions section; here the button can do the whole job, so it
     * opens the chooser and installs from it.
     */
    const choosable = editions.length > 1;
    actions.innerHTML = `
      <button class="btn-primary" id="act-install">${choosable ? "Choose an edition" : "Install Game"}</button>
      <button class="btn-secondary" id="act-locate" title="Find or select an existing installation on your computer">Already installed? Add to Library</button>
      ${state.accountState.connected ? `<button class="btn-secondary" id="act-create-party">Create Party</button>` : ""}
    `;
    document.getElementById("act-install").addEventListener("click", async () => {
      await runInstallGated();
    });
    document.getElementById("act-locate")?.addEventListener("click", async () => {
      setStatus("Looking for install…");
      try {
        cacheInvalidate(`game:${slug}`);
        cacheInvalidate(`editions:${slug}`);
        const res = await window.playbound.locateExe(slug);
        cacheInvalidate(`game:${slug}`);
        cacheInvalidate(`editions:${slug}`);
        if (res?.status === "cancelled") {
          setStatus("Locate cancelled.");
          return;
        }
        setStatus("Install located — added to library.");
        setProgress(null);
        api.renderGameDetailView(slug, { force: true });
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
    modsSec.innerHTML = `
      <div class="tab-panel-header">
        <h2>Available Mods &amp; Addons</h2>
        <span class="tab-panel-meta">${mods.length} ${mods.length === 1 ? "mod" : "mods"}</span>
      </div>
      <div class="mod-cards-grid"></div>
    `;
    const modsList = modsSec.querySelector(".mod-cards-grid");
    for (const mod of mods) {
      const card = document.createElement("div");
      card.className = "mod-full-card";
      const external = mod.downloadKind === "external";
      const modCover = mod.coverImage || detail.coverImage || "";
      const modBanner = modCover
        ? `<img src="${escapeHtml(modCover)}" alt="" loading="lazy" />`
        : `<span style="font-size:32px;font-weight:900;color:rgba(255,255,255,0.8)">${escapeHtml((mod.title || "?").charAt(0))}</span>`;
      
      const meta = [
        mod.approxSize || (mod.sizeMB ? `~${mod.sizeMB} MB` : null),
        mod.version ? `v${mod.version}` : null,
      ].filter(Boolean).join(" · ");

      card.innerHTML = `
        <div class="mod-card-banner">${modBanner}</div>
        <div class="mod-card-body">
          <div class="mod-card-title">${escapeHtml(mod.title)}</div>
          <div class="mod-card-tagline">${escapeHtml(mod.tagline || mod.description || "")}</div>
          <div class="card-tags">
            ${mod.category ? `<span class="chip">${escapeHtml(mod.category)}</span>` : ""}
            ${mod.tags?.slice(0, 2).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("") || ""}
            ${meta ? `<span class="chip chip-accent">${escapeHtml(meta)}</span>` : ""}
          </div>
        </div>
        <div class="mod-card-actions">
          ${
            mod.installed && !external
              ? `
                <div style="display:flex;gap:6px;width:100%;align-items:center;justify-content:space-between">
                  <div style="display:flex;gap:6px">
                    <button class="btn-primary btn-sm btn-mod-play" type="button">Play</button>
                    ${mod.installedPath ? `<button class="btn-secondary btn-sm btn-mod-folder" type="button">Folder</button>` : ""}
                  </div>
                  <div style="display:flex;gap:6px">
                    <button class="btn-secondary btn-sm btn-mod-details" type="button">Details</button>
                    <button class="btn-danger btn-sm btn-mod-uninstall" type="button">Remove</button>
                  </div>
                </div>
              `
              : mod.installed && mod.installedPath
              ? `
                <div style="display:flex;gap:6px;width:100%;align-items:center;justify-content:space-between">
                  <div style="display:flex;gap:6px">
                    <button class="btn-secondary btn-sm btn-mod-folder" type="button">Folder</button>
                    <button class="btn-danger btn-sm btn-mod-uninstall" type="button">Remove</button>
                  </div>
                  <button class="btn-secondary btn-sm btn-mod-details" type="button">Details</button>
                </div>
              `
              : `
                <div style="display:flex;gap:6px;width:100%;align-items:center;justify-content:space-between">
                  <button class="btn-primary btn-sm btn-mod-install" type="button">${external ? "Download" : "Install"}</button>
                  <button class="btn-secondary btn-sm btn-mod-details" type="button">Details</button>
                </div>
              `
          }
        </div>
      `;

      card.querySelector(".mod-card-title")?.addEventListener("click", () => api.openModDetail(mod.slug, "gameDetail"));
      card.querySelector(".btn-mod-details")?.addEventListener("click", () => api.openModDetail(mod.slug, "gameDetail"));
      card.querySelector(".btn-mod-play")?.addEventListener("click", async () => {
        try {
          setStatus(`Launching ${mod.title}…`);
          await window.playbound.playMod(mod.slug);
          setStatus(`Launched ${mod.title}`);
        } catch (err) {
          setStatus(err.message || String(err), true);
        }
      });
      card.querySelector(".btn-mod-folder")?.addEventListener("click", () => {
        window.playbound.openFolder(mod.installedPath);
      });
      card.querySelector(".btn-mod-uninstall")?.addEventListener("click", async () => {
        if (!confirm(`Uninstall ${mod.title}? This removes the mod from this PC.`)) return;
        try {
          setStatus(`Removing ${mod.title}…`);
          await window.playbound.uninstallMod(mod.slug);
          setStatus(`Removed ${mod.title}`);
          api.renderGameDetailView(slug, { force: true });
        } catch (err) {
          setStatus(err.message || String(err), true);
        }
      });
      card.querySelector(".btn-mod-install")?.addEventListener("click", async () => {
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
            api.renderGameDetailView(slug, { force: true });
          }
        } catch (err) {
          setStatus(err.message || String(err), true);
          setProgress(null);
        }
      });

      void window.playbound.getLiveStats?.({ mod: mod.slug }).then((stats) => {
        if (!stats || !card.isConnected) return;
        const titleNode = card.querySelector(".mod-card-title");
        if (!titleNode) return;
        const chip = document.createElement("span");
        chip.className = "playing-now-chip";
        chip.style.marginLeft = "8px";
        chip.textContent = `${formatStatNumber(stats.playingNow)} playing now`;
        titleNode.appendChild(chip);
      });

      modsList.appendChild(card);
    }
  } else {
    modsSec.innerHTML = `
      <div class="tab-panel-header"><h2>Available Mods &amp; Addons</h2></div>
      <div class="tab-empty">
        <div class="tab-empty-icon">🔧</div>
        <h3>No mods listed yet</h3>
        <p>Community mods, maps, and texture packs for ${escapeHtml(detail.title || "this game")} will appear here.</p>
        <button class="btn-secondary btn-sm" id="mods-empty-site">Check playbound.club</button>
      </div>
    `;
    document.getElementById("mods-empty-site")?.addEventListener("click", (e) => {
      e.preventDefault();
      window.playbound.openExternal(`https://playbound.club/games/${encodeURIComponent(slug)}?tab=mods`);
    });
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
          <div class="tab-panel-header">
            <h2>Live Servers</h2>
            <span class="tab-panel-meta">${totalPlayers} player${totalPlayers === 1 ? "" : "s"} · ${sorted.length} server${sorted.length === 1 ? "" : "s"}</span>
          </div>
          <div class="detail-servers-header">
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
        <div class="tab-panel-header">
          <h2>Live Servers</h2>
          <button class="btn-secondary btn-sm" id="detail-servers-refresh" type="button">Refresh</button>
        </div>
        <div class="tab-empty">
          <div class="tab-empty-icon">🛰️</div>
          <h3>No live servers listed right now</h3>
          <p>Community servers come and go. Refresh in a moment, or start a party and let PlayBound host one.</p>
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
    <!-- Same hero as the game and edition pages; see renderGameDetailView. -->
    <section class="detail-hero" style="${
      coverUrl ? `background-image:url('${escapeHtml(coverUrl)}')` : `background:${bgGrad}`
    }">
      <div class="detail-hero-scrim"></div>
      <div class="detail-hero-inner">
        <div class="detail-hero-copy">
          <div class="chip-row"><span class="chip chip-accent">Mod</span>${
            baseTitle ? `<span class="chip">For ${escapeHtml(baseTitle)}</span>` : ""
          }</div>
          <h1 class="detail-hero-title">${escapeHtml(detail.title)}</h1>
          <p class="detail-hero-sub">${escapeHtml(detail.tagline || "")}${
            detail.approxSize ? ` · ${escapeHtml(detail.approxSize)}` : ""
          }${detail.version ? ` · v${escapeHtml(detail.version)}` : ""}</p>
        </div>
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
      if (!confirm(`Uninstall ${detail.title}? This removes the mod from this PC.`)) return;
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

async function renderEditionDetailView(gameSlug, editionSlug, opts = {}) {
  const container = views.editionDetail;
  if (!container) return;
  const force = Boolean(opts?.force);
  if (force) {
    cacheInvalidate(`game:${gameSlug}`);
    cacheInvalidate(`editions:${gameSlug}`);
  }
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
      <p class="view-sub" style="margin-top:12px">Edition not found.</p>
    `;
    return;
  }

  // heroImage first, like the website's edition hero — a wide banner suits a
  // full-bleed band, where a portrait cover gets cropped to its middle.
  const coverUrl =
    edition.heroImage || edition.coverImage || gameDetail?.heroImage || gameDetail?.coverImage || "";
  const art = Array.isArray(gameDetail?.art) ? gameDetail.art : null;
  const bgGrad =
    art && art.length >= 2
      ? `linear-gradient(135deg, ${art[0]}, ${art[1]})`
      : `linear-gradient(135deg, #312e81, #a78bfa)`;

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
    <!--
      Same hero as the website's edition page: the art fills the band, a scrim
      keeps the type readable, edition name and tagline bottom-left, actions
      bottom-right. Structurally identical to the game hero above so the three
      pages can be changed together.
    -->
    <section class="detail-hero" style="${
      coverUrl ? `background-image:url('${escapeHtml(coverUrl)}')` : `background:${bgGrad}`
    }">
      <div class="detail-hero-scrim"></div>
      <div class="detail-hero-inner">
        <div class="detail-hero-copy">
          <div class="chip-row">
            <span class="chip">${escapeHtml(edition.editionType || "edition")}</span>
            ${
              edition.verificationLevel
                ? `<span class="chip chip-accent">${escapeHtml(edition.verificationLevel.replace(/_/g, " "))}</span>`
                : ""
            }
            ${
              liveStats
                ? `<span class="playing-now-chip">${formatStatNumber(liveStats.playingNow)} playing now</span>`
                : ""
            }
          </div>
          <h1 class="detail-hero-title">${escapeHtml(edition.editionName)}</h1>
          <p class="detail-hero-sub">${escapeHtml(edition.shortDescription || "")}</p>
        </div>
        <div class="detail-hero-actions">
          <button class="btn-primary" id="edition-install">${
            editionInstalled ? "Reinstall this edition" : "Install this edition"
          }</button>
          ${
            editionInstalled
              ? `<button class="btn-success" id="edition-play">Play</button>
                 <button class="btn-danger" id="edition-uninstall">Uninstall</button>`
              : `<button class="btn-secondary" id="edition-locate" title="Find or select an existing installation on your computer">Already installed? Add to Library</button>`
          }
        </div>
      </div>
    </section>
    ${editionInstalled ? gamePlayHintHtml(gameSlug) : ""}
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

  document.getElementById("edition-install")?.addEventListener("click", async () => {
    setStatus("Starting install...");
    try {
      cacheInvalidate(`game:${gameSlug}`);
      cacheInvalidate(`editions:${gameSlug}`);
      const res = await window.playbound.install(gameSlug, null, editionSlug);
      cacheInvalidate(`game:${gameSlug}`);
      cacheInvalidate(`editions:${gameSlug}`);
      if (res.status === "installed") {
        setStatus(res.note || "Install complete!");
        setProgress(null);
        api.renderEditionDetailView(gameSlug, editionSlug, { force: true });
      } else if (res.status === "installer-opened") {
        setStatus("Installer opened — waiting for the install to finish…");
        setProgress(null);
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
  document.getElementById("edition-locate")?.addEventListener("click", async () => {
    setStatus("Looking for install…");
    try {
      cacheInvalidate(`game:${gameSlug}`);
      cacheInvalidate(`editions:${gameSlug}`);
      const res = await window.playbound.locateExe(gameSlug);
      cacheInvalidate(`game:${gameSlug}`);
      cacheInvalidate(`editions:${gameSlug}`);
      if (res?.status === "cancelled") {
        setStatus("Locate cancelled.");
        return;
      }
      setStatus("Install located — added to library.");
      setProgress(null);
      api.renderEditionDetailView(gameSlug, editionSlug, { force: true });
      if (state.currentView === "library") api.renderLibraryView();
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
    if (!confirm(`Uninstall ${edition.editionName}? Other editions stay installed. Mods for this game will also be removed.`)) return;
    try {
      cacheInvalidate(`game:${gameSlug}`);
      cacheInvalidate(`editions:${gameSlug}`);
      const res = await window.playbound.uninstall(gameSlug, editionSlug);
      cacheInvalidate(`game:${gameSlug}`);
      cacheInvalidate(`editions:${gameSlug}`);
      if (res?.warning) setStatus(`Removed ${edition.editionName} from your library. ${res.warning}`, true);
      else setStatus(`Uninstalled ${edition.editionName}`);
      api.renderEditionDetailView(gameSlug, editionSlug, { force: true });
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
