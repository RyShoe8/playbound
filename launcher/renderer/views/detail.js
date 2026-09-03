import { createFreeOfferCard, createGameCard, createModCard } from "../cards.js";
import { maybeShowLaunchGuidance } from "../guidanceModal.js";
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
  formatCents,
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
  toggleQueuePopover,
} from "../shared.js";
import { maybeOfferPhoneControllerThenPlay } from "../phoneController.js";

/** Sort state for game-detail servers table */
const detailServersSort = { sort: "players", sortDir: "desc" };

/** Prevents a second Install click (or a re-render) from starting another download of the same edition. */
const installingKeys = new Set();

const HW_VERDICT_LABEL = {
  excellent: "Runs Great",
  good: "Runs Well",
  playable: "Playable",
  limited: "Limited",
  unsupported: "Unsupported",
  unknown: "Unknown",
};

function getFeatureIcon(featureText) {
  const text = String(featureText || "").toLowerCase();
  // Singleplayer / Campaign / Solo / Story
  if (text.includes("singleplayer") || text.includes("single player") || text.includes("single-player") || text.includes("solo") || text.includes("campaign") || text.includes("story")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
  // Multiplayer / Co-op / Online / PvP / Teams
  if (text.includes("multiplayer") || text.includes("multi-player") || text.includes("co-op") || text.includes("coop") || text.includes("online") || text.includes("pvp")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  }
  // Dedicated Servers / Server Browser / Server / Hosting / Network / LAN
  if (text.includes("server") || text.includes("host") || text.includes("lan") || text.includes("network") || text.includes("lobby")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>`;
  }
  // 64-bit Engine / Engine / CPU / Architecture / Performance / Framerate / 60fps / 120fps
  if (text.includes("64-bit") || text.includes("32-bit") || text.includes("engine") || text.includes("cpu") || text.includes("fps") || text.includes("performance") || text.includes("speed") || text.includes("optimized") || text.includes("fast")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`;
  }
  // Widescreen Support / Resolution / 4K / HD / Display / Graphics / Visuals / Ultrawide / FOV
  if (text.includes("widescreen") || text.includes("resolution") || text.includes("display") || text.includes("graphics") || text.includes("visual") || text.includes("ultrawide") || text.includes("4k") || text.includes("hd") || text.includes("fov") || text.includes("monitor") || text.includes("texture")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`;
  }
  // Cross-Platform / Linux / macOS / Windows / Steam Deck / Platform / Port
  if (text.includes("cross-platform") || text.includes("crossplatform") || text.includes("platform") || text.includes("linux") || text.includes("mac") || text.includes("windows") || text.includes("deck") || text.includes("steam deck") || text.includes("portable")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`;
  }
  // Controller Support / Gamepad / Keyboard / Mouse / Controls
  if (text.includes("controller") || text.includes("gamepad") || text.includes("input") || text.includes("keyboard") || text.includes("mouse") || text.includes("control")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>`;
  }
  // Audio / Sound / Music / Soundtrack / Voice / Speech
  if (text.includes("audio") || text.includes("sound") || text.includes("music") || text.includes("ost") || text.includes("voice") || text.includes("speech") || text.includes("stereo")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
  }
  // Mods / Modding / Addon / Add-on / Community / Workshop / Custom Content
  if (text.includes("mod") || text.includes("addon") || text.includes("pack") || text.includes("workshop") || text.includes("custom") || text.includes("editor") || text.includes("tool")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>`;
  }
  // Save / Cloud / Cloud Saves / Backup / Checkpoint
  if (text.includes("save") || text.includes("cloud") || text.includes("backup") || text.includes("sync")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
  }
  // Bugfixes / QoL / Patch / Fixes / Stability / Quality
  if (text.includes("fix") || text.includes("patch") || text.includes("qol") || text.includes("stability") || text.includes("quality")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  }
  // Default: Sparkles
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>`;
}

function formatHwRam(mb) {
  if (mb == null) return null;
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB`;
  return `${mb} MB`;
}

async function fillGameHardwareCompat(slug, targetId = "detail-hw-compat-body") {
  const body = document.getElementById(targetId);
  if (!body) return;
  if (!state.accountState.connected) {
    body.innerHTML = `
      <div class="hardware-compat-empty">
        <span class="hardware-compat-empty-icon" aria-hidden="true">⌁</span>
        <div><strong>Sign in to check your PC</strong><p>Sync hardware from Settings after signing in to see how this game will run.</p></div>
      </div>`;
    return;
  }
  try {
    const data = await window.playbound.getHardwareCompatibility?.(slug);
    if (!data || data.error) {
      body.textContent = data?.error || "Couldn’t check compatibility.";
      return;
    }
    if (!data.hasProfile || !data.result || data.result.verdict === "unknown") {
      body.innerHTML = `
        <div class="hardware-compat-empty">
          <span class="hardware-compat-empty-icon" aria-hidden="true">⌁</span>
          <div><strong>Set up your hardware profile</strong><p>${escapeHtml(
            data.result?.summary ||
              "Sync your hardware from Settings (Your Gaming PC) to see whether this game will run well."
          )}</p></div>
          <button type="button" class="btn-secondary btn-sm" id="detail-hw-sync">Sync now</button>
        </div>`;
      document.getElementById("detail-hw-sync")?.addEventListener("click", async () => {
        body.textContent = "Syncing…";
        await window.playbound.syncHardwareProfile?.();
        api.fillGameHardwareCompat(slug, targetId);
      });
      return;
    }
    const r = data.result;
    const label = HW_VERDICT_LABEL[r.verdict] || "Unknown";
    const rec = r.compared?.required?.recommended || r.compared?.required?.min || {};
    const reasons = (r.reasons || [])
      .slice(0, 5)
      .map((x) => `<li><span aria-hidden="true">✓</span>${escapeHtml(x.message)}</li>`)
      .join("");
    const ram = formatHwRam(r.compared?.user?.ramMB);
    body.innerHTML = `
      <div class="hardware-compat-card verdict-${escapeHtml(r.verdict || "unknown")}">
        <div class="hardware-compat-heading">
          <span class="hardware-verdict-mark" aria-hidden="true">${r.verdict === "unsupported" ? "!" : "✓"}</span>
          <div><span class="hardware-compat-kicker">PlayBound PC check</span><strong>${escapeHtml(label)}</strong></div>
        </div>
        ${r.summary ? `<p class="hardware-compat-summary">${escapeHtml(r.summary)}</p>` : ""}
        ${reasons ? `<ul class="hardware-compat-reasons">${reasons}</ul>` : ""}
      </div>
      <div class="req-grid hardware-spec-grid">
        <div class="req-card hardware-spec-card">
          <div class="req-label"><span aria-hidden="true">▣</span>Your PC</div>
          <p>${escapeHtml([r.compared?.user?.gpu, r.compared?.user?.cpu, ram ? `${ram} RAM` : null].filter(Boolean).join(" · ") || "—")}</p>
        </div>
        <div class="req-card hardware-spec-card">
          <div class="req-label"><span aria-hidden="true">◆</span>Game target</div>
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
    return {
      kind: "youtube",
      src: url,
      embedUrl: `https://www.youtube.com/embed/${yt}?rel=0&widget_referrer=${encodeURIComponent("https://playbound.club/launcher/")}`,
    };
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

function paintMasterCopyUnlocks(detail) {
  const root = document.getElementById("detail-unlocks-body");
  if (!root) return;
  const unlocks = detail.unlocks || {};
  const games = Array.isArray(unlocks.games) ? unlocks.games : [];
  const editions = Array.isArray(unlocks.editions) ? unlocks.editions : [];
  const mods = Array.isArray(unlocks.mods) ? unlocks.mods : [];
  root.replaceChildren();

  if (!games.length && !editions.length && !mods.length) {
    const empty = document.createElement("p");
    empty.className = "view-sub";
    empty.textContent =
      "Nothing is wired to this copy yet. Games, editions, and mods that require owning it will appear here.";
    root.appendChild(empty);
    return;
  }

  const titleCount = games.length + editions.length;
  const sectionTitle = document.querySelector("#detail-unlocks-sec .detail-section-title");
  if (sectionTitle && titleCount > 0) {
    sectionTitle.textContent = `What this copy unlocks (${titleCount})`;
  }

  if (games.length) {
    const grid = document.createElement("div");
    grid.className = "unlocks-game-grid";
    grid.style.marginTop = "12px";
    grid.style.marginBottom = "18px";
    for (const game of games) {
      const wrap = document.createElement("div");
      wrap.className = "unlock-game-wrap";
      wrap.appendChild(createGameCard(game));
      const buy = game.commerce?.buy;
      const paid = Boolean(game.commerce?.requiresPurchase);
      if (buy?.url) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-primary btn-sm";
        btn.textContent = `Get Game — ${formatCents(buy.priceCents)}`;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          window.playbound.openExternal(buy.url, { skipUtm: true, campaign: "game_get" });
        });
        wrap.appendChild(btn);
      } else if (!paid) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-primary btn-sm";
        btn.textContent = "Get It Free";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          api.openGameDetail?.(game.slug, state.currentView);
        });
        wrap.appendChild(btn);
      }
      grid.appendChild(wrap);
    }
    root.appendChild(grid);
  }

  if (editions.length) {
    const grid = document.createElement("div");
    grid.className = "detail-editions-grid unlocks-editions-grid";
    grid.style.marginBottom = "18px";
    for (const ed of editions) {
      const card = document.createElement("div");
      card.className = "detail-edition-card";
      const cover = ed.coverImage || "";
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
          <div class="detail-edition-card-desc">${escapeHtml(ed.shortDescription || "")}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:8px">
            <span class="chip" style="font-size:11px">${escapeHtml(ed.editionType || "edition")}</span>
            <button type="button" class="btn-secondary btn-sm">View Edition</button>
          </div>
        </div>
      `;
      card.addEventListener("click", () => {
        api.openEditionDetail(ed.gameSlug, ed.editionSlug);
      });
      grid.appendChild(card);
    }
    root.appendChild(grid);
  }

  if (mods.length) {
    const heading = document.createElement("h3");
    heading.className = "detail-section-title";
    heading.textContent = `Mods (${mods.length})`;
    const grid = document.createElement("div");
    grid.className = "game-grid";
    grid.style.marginTop = "12px";
    for (const mod of mods) grid.appendChild(createModCard(mod));
    root.appendChild(heading);
    root.appendChild(grid);
  }
}

function openStoreUrl(url) {
  if (!url) return;
  window.playbound.openExternal(url, { skipUtm: true, campaign: "game_get" });
}

function gameRequiresPurchase(detail) {
  return Boolean(detail?.commerce?.requiresPurchase);
}

function buildGameCommerceHtml(detail) {
  const c = detail?.commerce;
  if (!c?.requiresPurchase) return "";
  const buy = c.buy;
  const usual =
    typeof c.regularPriceCents === "number" &&
    buy &&
    c.regularPriceCents > buy.priceCents
      ? c.regularPriceCents
      : null;
  const priceHtml = buy
    ? `<div class="detail-commerce-price">
         <p class="detail-commerce-amount">${escapeHtml(formatCents(buy.priceCents))}</p>
         ${usual ? `<p class="detail-commerce-usual">Usually ${escapeHtml(formatCents(usual))}</p>` : ""}
       </div>`
    : typeof c.qualifyingPriceCents === "number"
      ? `<p class="detail-commerce-amount">${escapeHtml(formatCents(c.qualifyingPriceCents))}</p>`
      : "";
  const required = Array.isArray(c.requires) ? c.requires : [];
  const requiresHtml = required.length
    ? `<ul class="detail-commerce-requires">${required
        .map(
          (dep) =>
            `<li>Requires ${
              dep.slug
                ? `<button type="button" data-require-slug="${escapeHtml(dep.slug)}">${escapeHtml(dep.label)}</button>`
                : escapeHtml(dep.label)
            }${
              dep.currentPriceCents != null ? ` — ${escapeHtml(formatCents(dep.currentPriceCents))}` : ""
            }</li>`
        )
        .join("")}</ul>`
    : "";
  const ctaHtml = buy?.url
    ? `<div class="detail-commerce-cta"><button type="button" class="btn-primary" id="detail-commerce-buy">Get Game — ${escapeHtml(
        formatCents(buy.priceCents)
      )}</button></div>`
    : "";
  const sources = Array.isArray(c.sources) ? c.sources : [];
  const sourcesHtml = sources.length
    ? `<ul class="detail-commerce-sources">${sources
        .map(
          (source) =>
            `<li><button type="button" class="detail-commerce-source" data-commerce-url="${escapeHtml(
              source.url
            )}"><span>${escapeHtml(source.retailer)}${
              source.affiliate
                ? `<span class="detail-commerce-partner">Partner</span>`
                : ""
            }</span><span>${escapeHtml(formatCents(source.priceCents))}</span></button></li>`
        )
        .join("")}</ul>`
    : "";
  return `
    <section class="detail-section detail-commerce" id="detail-commerce">
      <h2 class="detail-section-title">${buy ? `Get ${escapeHtml(detail.title)}` : `To play ${escapeHtml(detail.title)}`}</h2>
      ${priceHtml}
      ${requiresHtml}
      ${ctaHtml}
      ${sourcesHtml}
      <p class="detail-commerce-note">PlayBound does not sell this game. Once you own it, install the PlayBound edition from the header or the Install tab.</p>
    </section>
  `;
}

function bindGameCommerce(detail) {
  const buyUrl = detail?.commerce?.buy?.url;
  document.getElementById("detail-commerce-buy")?.addEventListener("click", () => openStoreUrl(buyUrl));
  document.querySelectorAll("[data-commerce-url]").forEach((btn) => {
    btn.addEventListener("click", () => openStoreUrl(btn.dataset.commerceUrl));
  });
  document.querySelectorAll("[data-require-slug]").forEach((btn) => {
    btn.addEventListener("click", () => api.openGameDetail?.(btn.dataset.requireSlug, state.currentView));
  });
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

  const thatOneThingHtml = detail.thatOneThing
    ? `<section class="detail-section">
        <div class="detail-one-thing-card">
          <div class="detail-one-thing-mark" aria-hidden="true">✦</div>
          <div>
            <div class="detail-one-thing-kicker">That One Thing</div>
            <h2>Why ${escapeHtml(detail.title)} sticks with us</h2>
            <p>${escapeHtml(detail.thatOneThing)}</p>
          </div>
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
  const paid = gameRequiresPurchase(detail);
  const commerceHtml = buildGameCommerceHtml(detail);
  const reqGridHtml = detail.systemRequirements
    ? `<div class="req-grid">
        <div class="req-card"><div class="req-label">Minimum</div><p>${escapeHtml(detail.systemRequirements.min || "—")}</p></div>
        <div class="req-card"><div class="req-label">Recommended</div><p>${escapeHtml(detail.systemRequirements.recommended || "—")}</p></div>
      </div>`
    : "";
  const featureItems = (detail.features || [])
    .map(
      (f) => `<li class="edition-feature-card">
        <span class="edition-feature-icon" aria-hidden="true">${getFeatureIcon(f)}</span>
        <span class="edition-feature-text">${escapeHtml(f)}</span>
      </li>`
    )
    .join("");

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
            ${commerceHtml}
            ${thatOneThingHtml}
            ${
              detail.masterCopy
                ? `<section class="detail-section" id="detail-unlocks-sec">
                     <h2 class="detail-section-title">What this copy unlocks</h2>
                     <p class="view-sub" style="margin-top:-6px;margin-bottom:12px">Owning ${escapeHtml(detail.title)} unlocks the games, editions, and mods below.</p>
                     <div id="detail-unlocks-body"></div>
                   </section>`
                : ""
            }
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
                ? `<section class="detail-section detail-features-section"><div class="detail-section-heading"><div><h2 class="detail-section-title">Key Features</h2><p>What makes ${escapeHtml(detail.title)} worth playing.</p></div><span class="detail-section-count">${detail.features.length}</span></div><ul class="feature-list">${featureItems}</ul></section>`
                : ""
            }

            <section class="detail-section" id="detail-hw-compat">
              <div class="detail-section-heading"><div><h2 class="detail-section-title">Will this run on your PC?</h2><p>A quick comparison with the gaming PC saved in your settings.</p></div></div>
              <div class="hardware-compat-panel" id="detail-hw-compat-body"><span class="hardware-compat-loading" aria-hidden="true"></span>Checking compatibility with your hardware…</div>
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
        <div class="tab-panel-header"><h2>How to install ${escapeHtml(detail.title)}${paid ? "" : " for free"}</h2></div>
        <div class="install-header-card">
          <p class="install-header-prose">
            ${
              paid
                ? `PlayBound does not sell ${escapeHtml(detail.title)}. After you buy it, add your existing install to Library or install the PlayBound edition below.`
                : `${escapeHtml(detail.title)} is a free ${escapeHtml(genreFirst)} game released under ${escapeHtml(detail.license || "an open license")}. It runs on ${escapeHtml((detail.platforms || ["Windows"]).join(", "))}, needs about ${escapeHtml(detail.approxSize || "disk space")}, and requires no account or payment.`
            }
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

  paintMasterCopyUnlocks(detail);
  bindGameCommerce(detail);

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
    const lockKey = `${slug}::${editionSlug || ""}`;
    if (installingKeys.has(lockKey)) return;
    installingKeys.add(lockKey);
    const btn = document.getElementById("install-tab-install");
    if (btn) btn.disabled = true;
    setStatus("Starting install…");
    setProgress("indeterminate");
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
      if (btn) btn.disabled = false;
    } finally {
      installingKeys.delete(lockKey);
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
        const launched = await maybeOfferPhoneControllerThenPlay(
          detail,
          async () => {
            setStatus("Checking Java / launching…");
            const res = await window.playbound.play(slug);
            startGameSession(slug, detail.title || slug);
            maybeShowLaunchGuidance(res, {
              title: detail.title || slug,
              slug,
            });
            setStatus(`Launched ${detail.title || slug}`);
          },
          slug
        );
        if (!launched) return;
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
      try {
        cacheInvalidate(`game:${slug}`);
        cacheInvalidate(`editions:${slug}`);
        const res = await window.playbound.uninstall(slug);
        if (res?.status === "cancelled") return;
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
     * Paid titles send the player to a store. Engines that need a paid
     * original still require purchase, so they do not get Install here either
     * — the overview buy box points at that original. Free titles install.
     * "Already installed?" stays in every case so a copy they own can still
     * be added to Library.
     */
    const choosable = editions.length > 1;
    const buy = detail.commerce?.buy;
    const paidHero = gameRequiresPurchase(detail);
    const getGameBtn =
      buy?.url
        ? `<button class="btn-primary" id="act-get-game">Get Game — ${escapeHtml(formatCents(buy.priceCents))}</button>`
        : "";
    
    const activeInstall = state.installQueue?.active?.slug === slug ? state.installQueue.active : null;
    const queuedInstall = state.installQueue?.queued?.find((q) => q.slug === slug);
    const inQueue = activeInstall || queuedInstall;
    let installBtnLabel = choosable ? "Choose an edition" : "Install Game";
    let installBtnClass = "btn-primary";
    if (activeInstall) {
      const verb =
        activeInstall.phase === "extracting"
          ? "Unpacking"
          : activeInstall.phase === "downloading"
          ? "Downloading"
          : activeInstall.phase === "resolving"
          ? "Preparing"
          : "Installing";
      installBtnLabel = `⚡ ${verb}${activeInstall.pct ? ` (${activeInstall.pct}%)` : "…"}`;
      installBtnClass = "btn-primary btn-install-active";
    } else if (queuedInstall) {
      installBtnLabel = `⚡ Queued (#${queuedInstall.queuePosition || 1} in queue)`;
      installBtnClass = "btn-secondary btn-install-queued";
    }

    /*
     * A game can require purchase and still have nowhere to buy it.
     *
     * getGameBtn is empty without a store URL, and Install is suppressed for
     * anything requiring purchase — so such an entry rendered with no primary
     * action and no reason for its absence, which reads as a broken page.
     * Wolfenstein 3D via ECWolf sits in exactly that state: tier VALUE, no
     * price, no buy link.
     *
     * Name what is needed instead of showing nothing. The requirement is
     * already resolved server-side, so say which game it is when we know.
     */
    const requiredTitles = (detail?.commerce?.requires || [])
      .map((dep) => String(dep?.label || "").trim())
      .filter((label) => label && label !== (detail.title || ""));
    const noStoreNoteHtml =
      paidHero && !buy?.url
        ? `<p class="detail-commerce-note">${escapeHtml(
            requiredTitles.length
              ? `This needs ${requiredTitles.join(" and ")}, which PlayBound does not sell. Own it already? Add it to your library below.`
              : "This one needs to be bought elsewhere and PlayBound has no store link for it yet. Own it already? Add it to your library below."
          )}</p>`
        : "";

    actions.innerHTML = paidHero
      ? `
      ${getGameBtn}
      ${noStoreNoteHtml}
      <button class="btn-secondary" id="act-locate" title="Find or select an existing installation on your computer">Already installed? Add to Library</button>
      ${state.accountState.connected ? `<button class="btn-secondary" id="act-create-party">Create Party</button>` : ""}
    `
      : `
      <button class="${installBtnClass}" id="act-install" title="${inQueue ? "Click to view queue" : ""}">${installBtnLabel}</button>
      <button class="btn-secondary" id="act-locate" title="Find or select an existing installation on your computer">Already installed? Add to Library</button>
      ${state.accountState.connected ? `<button class="btn-secondary" id="act-create-party">Create Party</button>` : ""}
    `;
    document.getElementById("act-get-game")?.addEventListener("click", () => openStoreUrl(buy?.url));
    document.getElementById("act-install")?.addEventListener("click", async () => {
      if (inQueue) {
        toggleQueuePopover();
        return;
      }
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
                    <button class="btn-primary btn-sm btn-join-s" data-host="${escapeHtml(s.host)}" data-port="${Number(s.port) || 0}" data-mod="${escapeHtml(s.mod || "")}">Join</button>
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
            const host = b.dataset.host;
            const port = Number(b.dataset.port);
            const res = await window.playbound.play(slug, {
              host,
              port,
              mod: b.dataset.mod || undefined,
            });
            startGameSession(slug, detail.title || slug);
            maybeShowLaunchGuidance(res, {
              title: detail.title || slug,
              slug,
              address: host && port ? `${host}:${port}` : host || null,
            });
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

  state.editionDetailActiveTab = state.editionDetailActiveTab || "overview";

  const [editionsRes, liveStats, gameDetail] = await Promise.all([
    window.playbound.getEditions?.(gameSlug) || Promise.resolve({ editions: [] }),
    window.playbound.getLiveStats?.({ game: gameSlug, edition: editionSlug }) ||
      Promise.resolve(null),
    window.playbound.getGameDetail(gameSlug),
  ]);
  const allEditions = editionsRes?.editions || [];
  const edition = allEditions.find((e) => e.editionSlug === editionSlug);
  if (!edition) {
    container.innerHTML = `
      <p class="view-sub" style="margin-top:12px">Edition not found.</p>
    `;
    return;
  }

  const siblings = allEditions.filter((e) => e.editionSlug !== editionSlug);

  const coverUrl =
    edition.heroImage || edition.coverImage || gameDetail?.heroImage || gameDetail?.coverImage || "";
  const art = Array.isArray(gameDetail?.art) ? gameDetail.art : null;
  const bgGrad =
    art && art.length >= 2
      ? `linear-gradient(135deg, ${art[0]}, ${art[1]})`
      : `linear-gradient(135deg, #312e81, #a78bfa)`;

  const links = edition.links || gameDetail?.links || {};
  const linkButtons = [
    ["Website", links.website || gameDetail?.website],
    ["Discord", links.discord || gameDetail?.discord || gameDetail?.discordInvite],
    ["Wiki", links.wiki],
    ["GitHub", links.github || (gameDetail?.githubRepo ? `https://github.com/${gameDetail.githubRepo}` : null)],
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

  const sizeText = edition.sizeMB
    ? edition.sizeMB >= 1000
      ? `~${(edition.sizeMB / 1000).toFixed(1)} GB`
      : `~${edition.sizeMB} MB`
    : gameDetail?.approxSize || "—";

  const featureItems = (edition.features || [])
    .map(
      (f) => `<li class="edition-feature-card">
        <span class="edition-feature-icon" aria-hidden="true">${getFeatureIcon(f)}</span>
        <span class="edition-feature-text">${escapeHtml(f)}</span>
      </li>`
    )
    .join("");

  const reqGridHtml =
    edition.requirements && (edition.requirements.min || edition.requirements.recommended)
      ? `<div class="req-grid">
          <div class="req-card"><div class="req-label">Minimum</div><p>${escapeHtml(edition.requirements.min || "—")}</p></div>
          <div class="req-card"><div class="req-label">Recommended</div><p>${escapeHtml(edition.requirements.recommended || "—")}</p></div>
        </div>`
      : "";

  const shots = (Array.isArray(edition.screenshots || gameDetail?.screenshots)
    ? edition.screenshots || gameDetail?.screenshots
    : []
  )
    .filter(Boolean)
    .slice(0, 6)
    .map(
      (src) =>
        `<div class="shot-card"><img src="${escapeHtml(src)}" alt="${escapeHtml(edition.editionName)} screenshot" loading="lazy" /></div>`
    )
    .join("");

  const thatOneThingHtml = gameDetail?.thatOneThing
    ? `<section class="detail-section">
        <div class="detail-one-thing-card">
          <div class="detail-one-thing-mark" aria-hidden="true">✦</div>
          <div>
            <div class="detail-one-thing-kicker">That One Thing</div>
            <h2>Why ${escapeHtml(edition.editionName || gameDetail?.title || "")} sticks with us</h2>
            <p>${escapeHtml(gameDetail.thatOneThing)}</p>
          </div>
        </div>
      </section>`
    : "";

  const hasMultiplayer = Boolean(edition.hasServerBrowser ?? gameDetail?.hasServerBrowser ?? gameDetail?.multiplayer);
  const hasMods = Boolean(gameDetail?.mods && gameDetail.mods.length > 0);

  container.innerHTML = `
    <!-- ── Hero ─────────────────────────────────────────────── -->
    <section class="detail-hero" style="${
      coverUrl ? `background-image:url('${escapeHtml(coverUrl)}')` : `background:${bgGrad}`
    }">
      <div class="detail-hero-scrim"></div>
      <div class="detail-hero-inner">
        <div class="detail-hero-copy">
          <a href="#" class="detail-back-link" id="edition-back-game" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);margin-bottom:8px;text-decoration:none;cursor:pointer;">
            ← Back to ${escapeHtml(gameDetail?.title || "Game")}
          </a>
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
          <p class="detail-hero-sub">${escapeHtml(edition.shortDescription || "")} · ${escapeHtml(sizeText)}${edition.releaseYear ? ` · ${escapeHtml(String(edition.releaseYear))}` : ""}</p>
        </div>
        <div class="detail-hero-actions">
          ${
            editionInstalled
              ? `<button class="btn-success" id="edition-play">Play</button>
                 <button class="btn-danger" id="edition-uninstall">Uninstall</button>`
              : `<button class="btn-primary" id="edition-install">Install this edition</button>
                 <button class="btn-secondary" id="edition-locate" title="Find or select an existing installation on your computer">Already installed? Add to Library</button>`
          }
          <button type="button" class="btn-secondary" id="edition-open-site" title="View this edition on playbound.club">View on Web ↗</button>
        </div>
      </div>
    </section>

    <!-- ── Sticky Tabs ──────────────────────────────────────── -->
    <nav class="detail-tabs" id="edition-detail-tabs">
      <button type="button" class="detail-tab ${state.editionDetailActiveTab === "overview" ? "active" : ""}" data-tab="overview">Overview</button>
      <button type="button" class="detail-tab ${state.editionDetailActiveTab === "install" ? "active" : ""}" data-tab="install">Install</button>
      ${hasMultiplayer ? `<button type="button" class="detail-tab ${state.editionDetailActiveTab === "servers" ? "active" : ""}" data-tab="servers">Servers</button>` : ""}
      ${hasMods ? `<button type="button" class="detail-tab ${state.editionDetailActiveTab === "mods" ? "active" : ""}" data-tab="mods">Mods</button>` : ""}
      <button type="button" class="detail-tab ${state.editionDetailActiveTab === "guides" ? "active" : ""}" data-tab="guides">Guides</button>
      <button type="button" class="detail-tab ${state.editionDetailActiveTab === "achievements" ? "active" : ""}" data-tab="achievements">Achievements</button>
      <button type="button" class="detail-tab ${state.editionDetailActiveTab === "news" ? "active" : ""}" data-tab="news">News</button>
      <button type="button" class="detail-tab ${state.editionDetailActiveTab === "discussion" ? "active" : ""}" data-tab="discussion">Discussion</button>
      <button type="button" class="detail-tab ${state.editionDetailActiveTab === "reviews" ? "active" : ""}" data-tab="reviews">Reviews</button>
      <button type="button" class="detail-tab ${state.editionDetailActiveTab === "media" ? "active" : ""}" data-tab="media">Media</button>
    </nav>

    <!-- ── Tab Panels ───────────────────────────────────────── -->
    <div class="detail-tab-panels">
      <!-- Overview Panel -->
      <div class="detail-tab-panel ${state.editionDetailActiveTab === "overview" ? "active" : ""}" data-panel="overview">
        <div class="detail-overview-grid">
          <div class="detail-overview-main">
            ${thatOneThingHtml}

            ${
              featureItems
                ? `<section class="detail-section detail-features-section">
                     <div class="detail-section-heading">
                       <div>
                         <h2 class="detail-section-title">What Makes It Different</h2>
                         <p>Unique enhancements and features in this edition.</p>
                       </div>
                       <span class="detail-section-count">${(edition.features || []).length}</span>
                     </div>
                     <ul class="feature-list">${featureItems}</ul>
                   </section>`
                : ""
            }

            <section class="detail-section">
              <h2 class="detail-section-title">About ${escapeHtml(edition.editionName)}</h2>
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
                    reqNotes ? `<p class="edition-req-note">${escapeHtml(reqNotes)}</p>` : ""
                  }</section>`
                : ""
            }

            <section class="detail-section" id="edition-hw-compat">
              <div class="detail-section-heading">
                <div>
                  <h2 class="detail-section-title">Will this run on your PC?</h2>
                  <p>A quick comparison with the gaming PC saved in your settings.</p>
                </div>
              </div>
              <div class="hardware-compat-panel" id="edition-hw-compat-body">
                <span class="hardware-compat-loading" aria-hidden="true"></span>Checking compatibility with your hardware…
              </div>
            </section>

            ${
              reqGridHtml
                ? `<section class="detail-section"><h2 class="detail-section-title">System Requirements</h2>${reqGridHtml}</section>`
                : ""
            }

            ${
              faqHtml
                ? `<section class="detail-section"><h2 class="detail-section-title">Frequently Asked Questions</h2><div class="faq-list">${faqHtml}</div></section>`
                : ""
            }

            <section class="detail-section">
              <h2 class="detail-section-title">PlayBound Certification</h2>
              <div class="detail-sidebar-card" style="padding:16px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <span class="chip chip-accent">${escapeHtml(edition.verificationLevel ? edition.verificationLevel.replace(/_/g, " ") : "Verified")}</span>
                  ${edition.verifiedAt ? `<span class="view-sub" style="font-size:12px">Last checked ${escapeHtml(edition.verifiedAt.slice(0, 10))}</span>` : ""}
                </div>
                ${edition.verificationNote ? `<p class="detail-prose" style="margin-top:6px">${escapeHtml(edition.verificationNote)}</p>` : ""}
              </div>
            </section>
          </div>

          <aside class="detail-overview-sidebar">
            <div id="edition-activity-slot">${liveStats ? buildActivityPanelHtml(liveStats, "Edition Activity") : ""}</div>

            <div class="detail-sidebar-card">
              <div class="detail-sidebar-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent-light)"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>
                <span>Edition Facts</span>
              </div>
              <div class="detail-sidebar-row">
                <span class="detail-sidebar-label">Base Game</span>
                <span class="detail-sidebar-val"><a href="#" id="sidebar-base-game-link" style="color:var(--accent-light);text-decoration:none;font-weight:600">${escapeHtml(gameDetail?.title || gameSlug)}</a></span>
              </div>
              <div class="detail-sidebar-row">
                <span class="detail-sidebar-label">Type</span>
                <span class="detail-sidebar-val">${escapeHtml(edition.editionType || "Community")}</span>
              </div>
              <div class="detail-sidebar-row">
                <span class="detail-sidebar-label">Install Method</span>
                <span class="detail-sidebar-val">${escapeHtml(edition.installMethod || "Direct Download")}</span>
              </div>
              <div class="detail-sidebar-row">
                <span class="detail-sidebar-label">Size</span>
                <span class="detail-sidebar-val">${escapeHtml(sizeText)}</span>
              </div>
              <div class="detail-sidebar-row">
                <span class="detail-sidebar-label">Release</span>
                <span class="detail-sidebar-val">${escapeHtml(String(edition.releaseYear || gameDetail?.releaseYear || "—"))}</span>
              </div>
              <div class="detail-sidebar-row">
                <span class="detail-sidebar-label">License</span>
                <span class="detail-sidebar-val">${escapeHtml(edition.license || gameDetail?.license || "Free")}</span>
              </div>
              <div class="detail-sidebar-row">
                <span class="detail-sidebar-label">Verification</span>
                <span class="detail-sidebar-val">${escapeHtml((edition.verificationLevel || "verified").replace(/_/g, " "))}</span>
              </div>
            </div>

            ${
              siblings.length > 0
                ? `<div class="detail-sidebar-card">
                     <div class="detail-sidebar-title">
                       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent-light)"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
                       <span>Other Editions (${siblings.length})</span>
                     </div>
                     <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
                       ${siblings
                         .slice(0, 4)
                         .map(
                           (sib) =>
                             `<div class="edition-sidebar-item" data-sibling-slug="${escapeHtml(sib.editionSlug)}" style="padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;cursor:pointer;">
                               <div style="font-weight:600;font-size:13px;color:var(--text-main);">${escapeHtml(sib.editionName)}</div>
                               <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(sib.editionType || "edition")}</div>
                             </div>`
                         )
                         .join("")}
                     </div>
                   </div>`
                : ""
            }

            ${
              linkButtons
                ? `<div class="detail-sidebar-card">
                     <div class="detail-sidebar-title">
                       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent-light)"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                       <span>Links & Community</span>
                     </div>
                     <div class="detail-web-tabs" style="margin-top:10px">${linkButtons}</div>
                   </div>`
                : ""
            }
          </aside>
        </div>
      </div>

      <!-- Install Panel -->
      <div class="detail-tab-panel ${state.editionDetailActiveTab === "install" ? "active" : ""}" data-panel="install">
        <div class="tab-panel-header"><h2>Installation &amp; Setup for ${escapeHtml(edition.editionName)}</h2></div>
        <div class="install-header-card">
          <p class="install-header-prose">
            ${escapeHtml(edition.editionName)} is a ${escapeHtml(edition.editionType || "community")} edition for ${escapeHtml(gameDetail?.title || gameSlug)}.
            ${edition.installMethod ? `It uses ${escapeHtml(edition.installMethod)}.` : ""}
          </p>
          <div style="display:flex;gap:10px;margin-top:16px;">
            ${
              editionInstalled
                ? `<button class="btn-success" id="install-tab-play">Play Now</button>
                   <button class="btn-danger" id="install-tab-uninstall">Uninstall</button>`
                : `<button class="btn-primary" id="install-tab-install-btn">Install Edition</button>
                   <button class="btn-secondary" id="install-tab-locate-btn">Already installed? Locate</button>`
            }
          </div>
        </div>
        ${
          playStepsHtml
            ? `<div class="detail-sidebar-card" style="margin-top:20px;padding:20px;">
                 <h3 style="font-size:16px;font-weight:700;margin-bottom:12px;">Step-by-Step Instructions</h3>
                 ${playStepsHtml}
                 ${installNote ? `<p class="view-sub" style="margin-top:12px">${escapeHtml(installNote)}</p>` : ""}
               </div>`
            : ""
        }
      </div>

      <!-- Other Panels -->
      <div class="detail-tab-panel ${state.editionDetailActiveTab === "servers" ? "active" : ""}" data-panel="servers" id="edition-servers-sec">
        <div class="tab-panel-header"><h2>${escapeHtml(edition.editionName)} Servers</h2></div>
        <p class="view-sub">Looking for dedicated servers for this edition...</p>
      </div>

      <div class="detail-tab-panel ${state.editionDetailActiveTab === "mods" ? "active" : ""}" data-panel="mods" id="edition-mods-sec">
        <div class="tab-panel-header"><h2>Compatible Mods &amp; Addons</h2></div>
        <p class="view-sub">Loading mods for this edition…</p>
      </div>

      <div class="detail-tab-panel ${state.editionDetailActiveTab === "guides" ? "active" : ""}" data-panel="guides" id="edition-guides-sec">
        <p class="view-sub">Loading guides…</p>
      </div>

      <div class="detail-tab-panel ${state.editionDetailActiveTab === "achievements" ? "active" : ""}" data-panel="achievements" id="edition-achievements-sec">
        <div class="tab-panel-header"><h2>Achievements</h2></div>
        <div class="tab-empty">
          <div class="tab-empty-icon">🏆</div>
          <h3>Achievements coming soon</h3>
          <p>Community and in-game achievement tracking for ${escapeHtml(edition.editionName)} is in active development.</p>
        </div>
      </div>

      <div class="detail-tab-panel ${state.editionDetailActiveTab === "news" ? "active" : ""}" data-panel="news" id="edition-news-sec">
        <p class="view-sub">Loading updates…</p>
      </div>

      <div class="detail-tab-panel ${state.editionDetailActiveTab === "discussion" ? "active" : ""}" data-panel="discussion" id="edition-discussion-sec">
        <p class="view-sub">Loading discussions…</p>
      </div>

      <div class="detail-tab-panel ${state.editionDetailActiveTab === "reviews" ? "active" : ""}" data-panel="reviews" id="edition-reviews-sec">
        <p class="view-sub">Loading reviews…</p>
      </div>

      <div class="detail-tab-panel ${state.editionDetailActiveTab === "media" ? "active" : ""}" data-panel="media" id="edition-media-sec">
        <div class="tab-panel-header"><h2>Media Gallery</h2></div>
        ${shots ? `<div class="shot-row" style="margin-top:16px;">${shots}</div>` : `<p class="view-sub">No media uploaded yet.</p>`}
      </div>
    </div>
  `;

  // ── Tab Switching ────────────────────────────────────────────────────────
  document.getElementById("edition-detail-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".detail-tab");
    if (!btn) return;
    const tabName = btn.dataset.tab;
    if (!tabName) return;
    state.editionDetailActiveTab = tabName;
    container.querySelectorAll("#edition-detail-tabs .detail-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === tabName);
    });
    container.querySelectorAll(".detail-tab-panel").forEach((p) => {
      p.classList.toggle("active", p.dataset.panel === tabName);
    });
  });

  // ── Hardware Compatibility ────────────────────────────────────────────────
  void fillGameHardwareCompat(gameSlug, "edition-hw-compat-body");

  // ── Sibling Edition Navigation ────────────────────────────────────────────
  container.querySelectorAll("[data-sibling-slug]").forEach((el) => {
    el.addEventListener("click", () => {
      api.openEditionDetail(gameSlug, el.dataset.siblingSlug);
    });
  });

  // ── Back Button & Base Game Links ────────────────────────────────────────
  document.getElementById("edition-back-game")?.addEventListener("click", (e) => {
    e.preventDefault();
    api.openGameDetail(gameSlug);
  });
  document.getElementById("sidebar-base-game-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    api.openGameDetail(gameSlug);
  });

  // ── Install Handlers ─────────────────────────────────────────────────────
  const triggerInstall = async () => {
    const lockKey = `${gameSlug}::${editionSlug || ""}`;
    if (installingKeys.has(lockKey)) return;
    installingKeys.add(lockKey);
    const btn = document.getElementById("edition-install") || document.getElementById("install-tab-install-btn");
    if (btn) btn.disabled = true;
    setStatus("Starting install…");
    setProgress("indeterminate");
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
      if (btn) btn.disabled = false;
    } finally {
      installingKeys.delete(lockKey);
    }
  };

  const triggerLocate = async () => {
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
  };

  const triggerPlay = async () => {
    try {
      const pickList = (...cands) => {
        for (const c of cands) {
          if (Array.isArray(c) && c.length > 0) return c;
        }
        return [];
      };
      const launched = await maybeOfferPhoneControllerThenPlay(
        {
          title: edition.gameTitle || edition.editionName,
          slug: gameSlug,
          gameSlug,
          editionName: edition.editionName,
          features: pickList(edition.features, gameDetail?.features),
          tags: pickList(edition.tags, gameDetail?.tags),
          gameFeatures: pickList(gameDetail?.features),
          gameTags: pickList(gameDetail?.tags),
          controllerSupport: edition.controllerSupport || gameDetail?.controllerSupport,
          hasControllerSupport:
            edition.hasControllerSupport ?? gameDetail?.hasControllerSupport,
        },
        async () => {
          setStatus("Checking Java / launching…");
          const res = await window.playbound.play(gameSlug, null, editionSlug);
          startGameSession(gameSlug, edition.gameTitle || gameSlug);
          maybeShowLaunchGuidance(res, {
            title: edition.editionName || edition.gameTitle || gameSlug,
            slug: gameSlug,
          });
          setStatus(`Launched ${edition.editionName || edition.gameTitle || gameSlug}`);
        },
        gameSlug
      );
      if (!launched) return;
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  };

  const triggerUninstall = async () => {
    try {
      cacheInvalidate(`game:${gameSlug}`);
      cacheInvalidate(`editions:${gameSlug}`);
      const res = await window.playbound.uninstall(gameSlug, editionSlug);
      if (res?.status === "cancelled") return;
      cacheInvalidate(`game:${gameSlug}`);
      cacheInvalidate(`editions:${gameSlug}`);
      if (res?.warning) setStatus(`Removed ${edition.editionName} from your library. ${res.warning}`, true);
      else setStatus(`Uninstalled ${edition.editionName}`);
      api.renderEditionDetailView(gameSlug, editionSlug, { force: true });
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  };

  document.getElementById("edition-install")?.addEventListener("click", triggerInstall);
  document.getElementById("install-tab-install-btn")?.addEventListener("click", triggerInstall);
  document.getElementById("edition-locate")?.addEventListener("click", triggerLocate);
  document.getElementById("install-tab-locate-btn")?.addEventListener("click", triggerLocate);
  document.getElementById("edition-play")?.addEventListener("click", triggerPlay);
  document.getElementById("install-tab-play")?.addEventListener("click", triggerPlay);
  document.getElementById("edition-uninstall")?.addEventListener("click", triggerUninstall);
  document.getElementById("install-tab-uninstall")?.addEventListener("click", triggerUninstall);

  document.getElementById("edition-open-site")?.addEventListener("click", () => {
    window.playbound.openExternal(`https://playbound.club/games/${encodeURIComponent(gameSlug)}/editions/${encodeURIComponent(editionSlug)}`);
  });

  container.querySelectorAll("[data-ext]").forEach((btn) => {
    btn.addEventListener("click", () =>
      window.playbound.openExternal(btn.dataset.ext, {
        campaign: "launcher_edition_link",
        content: `${gameSlug}:${editionSlug}`,
      })
    );
  });

  // ── Lazy Load Tabs (Guides, News, Discussions, Reviews) ──────────────────
  void (async () => {
    const guidesSec = document.getElementById("edition-guides-sec");
    const newsSec = document.getElementById("edition-news-sec");
    const discussionSec = document.getElementById("edition-discussion-sec");
    const reviewsSec = document.getElementById("edition-reviews-sec");
    const [guidesRes, releasesRes, discussionsRes, reviewsRes] = await Promise.all([
      window.playbound.getGameGuides?.(gameSlug) || Promise.resolve({ guides: [] }),
      window.playbound.getGameReleases?.(gameSlug) || Promise.resolve({ releases: [] }),
      window.playbound.getGameDiscussions?.(gameSlug) || Promise.resolve({ topics: [] }),
      window.playbound.getGameReviews?.(gameSlug) || Promise.resolve({ reviews: [] }),
    ]);

    if (guidesSec) {
      const guides = guidesRes?.guides || [];
      if (!guides.length) {
        guidesSec.innerHTML = `
          <div class="tab-panel-header"><h2>Community Guides for ${escapeHtml(edition.editionName)}</h2></div>
          <div class="tab-empty">
            <div class="tab-empty-icon">📖</div>
            <h3>No guides published yet</h3>
            <p>Share your tips, walkthroughs, and strategies with the PlayBound community.</p>
            <button class="btn-primary btn-sm" id="edition-guides-open-site">Write a guide on playbound.club</button>
          </div>
        `;
        document.getElementById("edition-guides-open-site")?.addEventListener("click", () => {
          window.playbound.openExternal(`https://playbound.club/games/${encodeURIComponent(gameSlug)}/editions/${encodeURIComponent(editionSlug)}?tab=guides`);
        });
      } else {
        guidesSec.innerHTML = `
          <div class="tab-panel-header"><h2>Community Guides</h2></div>
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
      }
    }

    if (newsSec) {
      const releases = releasesRes?.releases || [];
      if (!releases.length) {
        newsSec.innerHTML = `
          <div class="tab-panel-header"><h2>Updates &amp; Changelogs</h2></div>
          <div class="tab-empty">
            <div class="tab-empty-icon">📰</div>
            <h3>No release notes found</h3>
            <p>Check the project website or repository for development updates.</p>
          </div>
        `;
      } else {
        newsSec.innerHTML = `
          <div class="tab-panel-header"><h2>Updates &amp; Changelogs</h2></div>
          <div class="release-cards-list">${releases
            .map(
              (r) =>
                `<div class="release-full-card">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                    <strong style="font-size:15px;color:var(--text-main)">${escapeHtml(r.name || r.tag || "Release")}</strong>
                    <span style="font-size:12px;color:var(--text-dim)">${escapeHtml(r.publishedAt ? new Date(r.publishedAt).toLocaleDateString() : "")}</span>
                  </div>
                  <p class="detail-prose" style="margin-top:8px">${escapeHtml((r.body || "").slice(0, 300))}${(r.body || "").length > 300 ? "…" : ""}</p>
                </div>`
            )
            .join("")}</div>`;
      }
    }

    if (discussionSec) {
      const topics = discussionsRes?.topics || [];
      if (!topics.length) {
        discussionSec.innerHTML = `
          <div class="tab-panel-header"><h2>Community Discussion</h2></div>
          <div class="tab-empty">
            <div class="tab-empty-icon">💬</div>
            <h3>No topics yet</h3>
            <p>Start a conversation about ${escapeHtml(edition.editionName)} on the website.</p>
            <button class="btn-primary btn-sm" id="edition-discussion-open-site">Join Discussion on Site</button>
          </div>
        `;
        document.getElementById("edition-discussion-open-site")?.addEventListener("click", () => {
          window.playbound.openExternal(`https://playbound.club/games/${encodeURIComponent(gameSlug)}/editions/${encodeURIComponent(editionSlug)}?tab=discussion`);
        });
      } else {
        discussionSec.innerHTML = `
          <div class="tab-panel-header"><h2>Community Topics</h2></div>
          <div class="discussion-topics-list">${topics
            .map(
              (t) =>
                `<div class="topic-row-card" data-url="${escapeHtml(t.url)}">
                  <div style="font-weight:600;font-size:14px;color:var(--text-main);">${escapeHtml(t.title)}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:3px">${escapeHtml(t.username || "Community")} · ${escapeHtml(t.replyCount || 0)} replies</div>
                </div>`
            )
            .join("")}</div>`;
        discussionSec.querySelectorAll("[data-url]").forEach((el) => {
          el.addEventListener("click", () => window.playbound.openExternal(el.dataset.url));
        });
      }
    }

    if (reviewsSec) {
      const reviews = reviewsRes?.reviews || [];
      if (!reviews.length) {
        reviewsSec.innerHTML = `
          <div class="tab-panel-header"><h2>Reviews for ${escapeHtml(edition.editionName)}</h2></div>
          <div class="tab-empty">
            <div class="tab-empty-icon">⭐</div>
            <h3>No reviews yet</h3>
            <p>Be the first to review ${escapeHtml(edition.editionName)} on playbound.club!</p>
            <button class="btn-primary btn-sm" id="edition-reviews-open-site">Write a review on playbound.club</button>
          </div>
        `;
        document.getElementById("edition-reviews-open-site")?.addEventListener("click", () => {
          window.playbound.openExternal(`https://playbound.club/games/${encodeURIComponent(gameSlug)}/editions/${encodeURIComponent(editionSlug)}?tab=reviews`);
        });
      } else {
        reviewsSec.innerHTML = `
          <div class="tab-panel-header"><h2>Community Reviews</h2></div>
          <div class="reviews-list">${reviews
            .map(
              (r) =>
                `<div class="review-full-card" data-url="${escapeHtml(r.url)}">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span class="review-rating-stars">${"★".repeat(Math.max(0, Math.min(5, Number(r.rating) || 0)))}${"☆".repeat(Math.max(0, 5 - (Number(r.rating) || 0)))}</span>
                      <strong style="font-size:15px">${escapeHtml(r.title || "Review")}</strong>
                    </div>
                    <span style="font-size:11.5px;color:var(--text-dim)">${r.createdAt ? escapeHtml(new Date(r.createdAt).toLocaleDateString()) : ""}</span>
                  </div>
                  <p class="detail-prose" style="font-size:13.5px">${escapeHtml(r.body || "")}</p>
                </div>`
            )
            .join("")}</div>`;
        reviewsSec.querySelectorAll("[data-url]").forEach((el) => {
          el.addEventListener("click", () => window.playbound.openExternal(el.dataset.url));
        });
      }
    }
  })();

  markViewReady(container, `${gameSlug}:${editionSlug}`);
}

api.renderGameDetailView = renderGameDetailView;
api.renderModDetailView = renderModDetailView;
api.renderEditionDetailView = renderEditionDetailView;
api.fillGameHardwareCompat = fillGameHardwareCompat;
