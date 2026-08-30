import { createFreeOfferCard, createGameCard } from "../cards.js";
import { maybeShowLaunchGuidance } from "../guidanceModal.js";
import {
  api,
  buildActivityPanelHtml,
  cacheInvoke,
  CACHE_TTL,
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
  markViewReady,
  startGameSession,
  state,
  views,
} from "../shared.js";
import { maybeOfferPhoneControllerThenPlay } from "../phoneController.js";

function ensureLibraryShell() {
  const container = views.library;
  if (container.querySelector("#library-list")) return false;

  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Library</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Games and mods on this ${isMacOS() ? "Mac" : "PC"} — install or add an existing ${executableNoun()}.</p>
      </div>
      <button class="btn-primary btn-sm" type="button" id="btn-library-add">Add game</button>
    </div>
    <div id="library-add-panel" class="library-add-panel hidden"></div>
    <div id="library-list" class="library-grid" style="margin-top: 20px"></div>
  `;

  document.getElementById("btn-library-add")?.addEventListener("click", () => {
    void toggleLibraryAddPanel();
  });

  document.getElementById("btn-sync-lib-settings")?.addEventListener("click", () => {
    void window.playbound.syncLibraryNow?.();
  });

  return true;
}

function catalogListFrom(raw) {
  return Array.isArray(raw) ? raw : raw?.games || [];
}

async function loadLibraryLocalData() {
  const catalog =
    state.catalogCache.length > 0
      ? state.catalogCache
      : (await window.playbound.getCatalog?.()) || [];
  if (!state.catalogCache.length && Array.isArray(catalog)) {
    state.catalogCache = catalog;
  }

  const [installed, installedMods] = await Promise.all([
    cacheInvoke("installed", CACHE_TTL.installed, () => window.playbound.getInstalled()),
    cacheInvoke("installedMods", CACHE_TTL.installedMods, () =>
      window.playbound.getInstalledMods?.() || Promise.resolve([])
    ),
  ]);

  return {
    catalog,
    installed: installed || [],
    installedMods: installedMods || [],
  };
}

function paintLibraryLoading(list) {
  // No columns while loading; the redistribute listener keys off this being
  // empty, so it must not hold cards that are no longer on the page.
  libraryCards = [];
  list.innerHTML = `<p class="view-sub" style="text-align:center;padding:40px 0">Loading library…</p>`;
}

function paintLibraryList(list, { installed, installedMods, modTitles, catalog, cloudLib }) {
  const hasLocalGames = installed.length > 0;
  const hasMods = installedMods.length > 0;

  const catalogList = catalogListFrom(catalog);
  const catalogBySlug = new Map(catalogList.map((g) => [g.slug, g]));

  const installedSlugs = new Set(installed.map((g) => g.slug));
  const cloudEntries = Array.isArray(cloudLib?.entries) ? cloudLib.entries : [];
  const otherDeviceSlugs = cloudEntries
    .filter((e) => !installedSlugs.has(e.gameSlug))
    .map((e) => e.gameSlug);

  const hasAnyGames = hasLocalGames || hasMods || otherDeviceSlugs.length > 0;

  if (!hasAnyGames) {
    libraryCards = [];
    list.innerHTML = `
      <div style="text-align: center; padding: 40px 0;">
        <p class="view-sub">No games yet. Browse the catalog or add one you already installed.</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px">
          <button class="btn-primary" id="btn-go-games" type="button">Browse Games</button>
          <button class="btn-secondary" id="btn-empty-add" type="button">Add existing game</button>
        </div>
      </div>
    `;
    document.getElementById("btn-go-games")?.addEventListener("click", () => api.navigateTo("games"));
    document.getElementById("btn-empty-add")?.addEventListener("click", () => {
      void toggleLibraryAddPanel(true);
    });
    return;
  }

  // Built as a flat, ordered list and distributed into columns at the end —
  // see layoutLibraryColumns for why the columns are not a CSS grid.
  const cards = [];

  for (const game of installed) {
    const gameMods = installedMods.filter((m) => m.baseGameSlug === game.slug);
    cards.push(
      buildLibraryGameBlock(game, gameMods, modTitles, {
        catalogEntry: catalogBySlug.get(game.slug),
      })
    );
  }

  // Games installed on other devices or saved in account library
  for (const slug of otherDeviceSlugs) {
    const catEntry = catalogBySlug.get(slug);
    const title =
      catEntry?.title ||
      slug.replace(/^custom-/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const cloudGame = {
      slug,
      title,
      blurb: catEntry?.blurb || "",
      art: catEntry?.art || ["#1e1b4b", "#6366f1"],
      coverImage: catEntry?.coverImage || null,
      genres: catEntry?.genres || [],
      approxSize: catEntry?.approxSize || "",
      testing: Boolean(catEntry?.testing || catEntry?.status === "testing"),
    };
    cards.push(buildLibraryGameBlock(cloudGame, [], modTitles, { ownedElsewhere: true }));
  }

  const orphanMods = installedMods.filter(
    (m) =>
      m.baseGameSlug &&
      !installedSlugs.has(m.baseGameSlug) &&
      !otherDeviceSlugs.includes(m.baseGameSlug)
  );
  const orphansByBase = new Map();
  for (const mod of orphanMods) {
    const key = mod.baseGameSlug;
    if (!orphansByBase.has(key)) orphansByBase.set(key, []);
    orphansByBase.get(key).push(mod);
  }
  for (const [baseSlug, mods] of orphansByBase) {
    const title = baseSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    const fakeGame = {
      slug: baseSlug,
      title,
      blurb: "",
      art: ["#312e81", "#a78bfa"],
      coverImage: null,
      dir: null,
      exe: null,
    };
    cards.push(buildLibraryGameBlock(fakeGame, mods, modTitles, { orphan: true }));
  }

  layoutLibraryColumns(list, cards);
}

/**
 * Two columns that scroll past each other, rather than a grid.
 *
 * A CSS grid aligns rows, so the taller of two side-by-side cards sets the
 * height of both: expanding one game's editions pushed the game beside it down
 * the page and left a gap under it. Each column is its own stack here, so
 * expanding a card only moves what is below it in that column.
 *
 * Round-robin rather than first-half/second-half, because it keeps the
 * left-right reading order the grid had — splitting in halves would move every
 * card to a different place the first time this shipped.
 */
const LIBRARY_TWO_COLUMN_QUERY = "(min-width: 1540px)";

/** The ordered cards, kept so a breakpoint change can redistribute them. */
let libraryCards = [];

function layoutLibraryColumns(list, cards) {
  libraryCards = cards;
  const count = window.matchMedia(LIBRARY_TWO_COLUMN_QUERY).matches ? 2 : 1;
  const columns = [];
  for (let i = 0; i < count; i += 1) {
    const column = document.createElement("div");
    column.className = "library-column";
    columns.push(column);
  }
  cards.forEach((card, i) => columns[i % count].appendChild(card));
  list.replaceChildren(...columns);
}

/*
 * Redistribute on the breakpoint rather than re-rendering. The same card
 * elements are moved between columns, so an expanded editions panel — and any
 * open menu or save-backups panel — survives the window being resized.
 */
if (typeof window !== "undefined" && window.matchMedia) {
  const mq = window.matchMedia(LIBRARY_TWO_COLUMN_QUERY);
  const onChange = () => {
    const list = document.getElementById("library-list");
    if (!list || libraryCards.length === 0) return;
    if (!list.isConnected) return;
    layoutLibraryColumns(list, libraryCards);
  };
  if (mq.addEventListener) mq.addEventListener("change", onChange);
  else if (mq.addListener) mq.addListener(onChange);
}

async function enrichLibraryList(list, local) {
  const needsMods = local.installedMods.length > 0;
  const [modsCat, cloudLib] = await Promise.all([
    needsMods
      ? cacheInvoke("mods", CACHE_TTL.mods, () => window.playbound.getModsCatalog())
      : Promise.resolve({ mods: [] }),
    cacheInvoke("cloudLibrary", CACHE_TTL.cloudLibrary, () =>
      window.playbound.getCloudLibrary?.() || Promise.resolve(null)
    ),
  ]);

  if (state.currentView !== "library" || !document.getElementById("library-list")) return;

  const modTitles = new Map((modsCat?.mods || []).map((m) => [m.slug, m.title]));
  paintLibraryList(list, {
    ...local,
    modTitles,
    cloudLib,
  });
}

async function renderLibraryList() {
  const list = document.getElementById("library-list");
  if (!list) return;

  const local = await loadLibraryLocalData();
  const hasLocal = local.installed.length > 0 || local.installedMods.length > 0;

  if (hasLocal) {
    paintLibraryList(list, {
      ...local,
      modTitles: new Map(),
      cloudLib: null,
    });
  } else {
    paintLibraryLoading(list);
  }

  await enrichLibraryList(list, local);
}

async function renderLibraryView() {
  const container = views.library;
  ensureLibraryShell();
  const list = document.getElementById("library-list");
  const local = await loadLibraryLocalData();
  const hasLocal = local.installed.length > 0 || local.installedMods.length > 0;

  // Before painting: the menu item's label depends on this, and it cannot wait
  // on IPC while the menu is opening.
  await loadRunAsAdminState(local.installed.map((g) => g.slug).filter(Boolean));

  if (hasLocal) {
    paintLibraryList(list, {
      ...local,
      modTitles: new Map(),
      cloudLib: null,
    });
  } else {
    paintLibraryLoading(list);
  }

  markViewReady(container);
  void enrichLibraryList(list, local);
}

async function toggleLibraryAddPanel(forceOpen = false) {
  const panel = document.getElementById("library-add-panel");
  if (!panel) return;
  const willOpen = forceOpen || panel.classList.contains("hidden");
  if (!willOpen) {
    panel.classList.add("hidden");
    panel.replaceChildren();
    return;
  }

  panel.classList.remove("hidden");
  panel.innerHTML = `<p class="view-sub">Scanning this ${isMacOS() ? "Mac" : "PC"} for installed games…</p>`;

  const [catalog, installed, scanned] = await Promise.all([
    window.playbound.getCatalog(),
    window.playbound.getInstalled(),
    window.playbound.scanLibraryCandidates
      ? window.playbound.scanLibraryCandidates().catch(() => [])
      : Promise.resolve([]),
  ]);
  const ready = new Set(
    (installed || []).filter((g) => g.exe && !g.pending).map((g) => g.slug)
  );
  const catalogList = Array.isArray(catalog) ? catalog : catalog?.games || [];
  const games = catalogList
    .filter((g) => g?.slug && !ready.has(g.slug))
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));
  const candidates = (Array.isArray(scanned) ? scanned : []).filter((g) => g?.slug && !ready.has(g.slug));

  panel.innerHTML = `
    <div class="library-add-header">
      <strong style="font-size:14px">Add game</strong>
      <button type="button" class="btn-secondary btn-sm" id="library-add-close">Close</button>
    </div>
    <div id="library-scan-block" style="margin: 12px 0; padding: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 8px;">
      <strong style="display:block;font-size:13px;color:var(--text,#fff)">Found on this ${isMacOS() ? "Mac" : "PC"}</strong>
      <p class="view-sub" style="margin:4px 0 8px;font-size:11px;">Select catalog games the scanner located, then add them to your library.</p>
      <div id="library-scan-list"></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
        <button type="button" class="btn-primary btn-sm" id="btn-add-scanned" ${candidates.length ? "" : "disabled"}>Add selected</button>
      </div>
    </div>
    <div class="library-add-manual">
      <div>
        <strong style="display: block; font-size: 13px; color: var(--text, #fff);">Or locate a ${executableNoun()} manually</strong>
        <span class="view-sub" style="font-size: 11px; margin: 0;">Browse for any installed game, including Steam, Epic, or a custom folder.</span>
      </div>
      <button type="button" class="btn-secondary btn-sm" id="btn-add-custom-exe">Browse ${executableNoun()}</button>
    </div>
    <input type="search" id="library-add-search" class="library-add-search" placeholder="Search catalog games to locate…" autocomplete="off" />
    <p class="view-sub" style="margin:8px 0">Pick a catalog game if the scanner missed it:</p>
    <div id="library-add-list" class="library-add-list"></div>
  `;

  const scanList = document.getElementById("library-scan-list");
  if (scanList) {
    if (!candidates.length) {
      scanList.innerHTML = `<p class="view-sub" style="margin:0;font-size:12px;">No catalog installs found automatically.</p>`;
    } else {
      scanList.innerHTML = candidates
        .map(
          (g) => `
        <label class="filter-check" style="display:flex;align-items:center;gap:8px;margin:4px 0;">
          <input type="checkbox" class="library-scan-pick" value="${escapeHtml(g.slug)}" checked />
          <span>${escapeHtml(g.title || g.slug)}</span>
        </label>`
        )
        .join("");
    }
  }

  document.getElementById("btn-add-scanned")?.addEventListener("click", async () => {
    const slugs = [...panel.querySelectorAll(".library-scan-pick:checked")].map((el) => el.value);
    if (!slugs.length) {
      setStatus("Select at least one game to add.");
      return;
    }
    try {
      setStatus(`Adding ${slugs.length} game${slugs.length === 1 ? "" : "s"}…`);
      const res = await window.playbound.addScannedGames(slugs);
      const added = res?.added?.length || slugs.length;
      setStatus(`Added ${added} game${added === 1 ? "" : "s"} to your library.`);
      toggleLibraryAddPanel(false);
      api.renderLibraryView();
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  document.getElementById("btn-add-custom-exe")?.addEventListener("click", async () => {
    try {
      setStatus("Selecting game executable…");
      const res = await window.playbound.addCustomGame();
      if (res?.status === "cancelled") {
        setStatus("Locate cancelled.");
        return;
      }
      setStatus(`${res?.title || "Game"} added to library.`);
      toggleLibraryAddPanel(false);
      api.renderLibraryView();
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  const listEl = document.getElementById("library-add-list");
  const searchEl = document.getElementById("library-add-search");

  function paint(filter = "") {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? games.filter(
          (g) =>
            String(g.title).toLowerCase().includes(q) ||
            String(g.slug).toLowerCase().includes(q)
        )
      : games;
    listEl.replaceChildren();
    if (!filtered.length) {
      listEl.innerHTML = `<p class="view-sub">No matching games.</p>`;
      return;
    }
    for (const game of filtered) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "library-add-row";
      row.innerHTML = `<span class="library-add-row-title">${escapeHtml(game.title)}</span>
        <span class="library-add-row-hint">${selectExecutableLabel()}</span>`;
      row.addEventListener("click", async () => {
        try {
          setStatus(`Locate ${game.title}…`);
          const res = await window.playbound.locateExe(game.slug);
          if (res?.status === "cancelled") {
            setStatus("Locate cancelled.");
            return;
          }
          setStatus(`${game.title} added to library.`);
          api.renderLibraryView();
        } catch (err) {
          setStatus(err.message || String(err), true);
        }
      });
      listEl.appendChild(row);
    }
  }

  paint();
  searchEl?.addEventListener("input", () => paint(searchEl.value));
  document.getElementById("library-add-close")?.addEventListener("click", () => {
    panel.classList.add("hidden");
    panel.replaceChildren();
  });
  searchEl?.focus();
}

/**
 * A "⋯" button that reveals secondary actions.
 *
 * Library cards had every action as a peer button — Play, Folder, Saves,
 * Display, Remove — so a game with three editions showed sixteen buttons of
 * identical weight, and Remove sat directly beside Play. Collapsing everything
 * except the primary action leaves one obvious thing to click and puts the
 * destructive one behind a deliberate second step.
 *
 * @param {{label: string, onClick: function, danger?: boolean}[]} items
 */
function buildOverflowMenu(items) {
  const wrap = document.createElement("div");
  wrap.className = "action-menu";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "btn-secondary btn-sm action-menu-trigger";
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "More actions");
  trigger.textContent = "⋯";

  const menu = document.createElement("div");
  menu.className = "action-menu-panel hidden";
  menu.setAttribute("role", "menu");

  for (const item of items) {
    if (!item) continue;
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = `action-menu-item${item.danger ? " danger" : ""}`;
    entry.setAttribute("role", "menuitem");
    entry.textContent = item.label;
    entry.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
      item.onClick(e);
    });
    menu.appendChild(entry);
  }

  function close() {
    menu.classList.add("hidden");
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }
  function onOutside(e) {
    if (!wrap.contains(e.target)) close();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = menu.classList.contains("hidden");
    // Only one menu open at a time, or stale popovers stack up over cards.
    document
      .querySelectorAll(".action-menu-panel:not(.hidden)")
      .forEach((p) => p.classList.add("hidden"));
    if (!opening) {
      close();
      return;
    }
    menu.classList.remove("hidden");
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  });

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  return wrap;
}

/**
 * The artwork thumbnail for a library row.
 *
 * Falls back to the game's gradient and initial, and does the same if the
 * image fails to load, so a dead cover never leaves an empty rectangle.
 */
/**
 * Whether an edition name tells the player anything.
 *
 * "Official", "Official Vanilla Edition" and friends are what almost every
 * game reports, so showing them adds a line of text to every row that carries
 * no information. Anything else — Project Quarm, Rat King Adventure — is
 * precisely what someone needs to see.
 */
/*
 * Which games have their editions expanded.
 *
 * Kept outside the render because the library re-renders itself after every
 * install, uninstall and edition action — without this, expanding a game's
 * editions and then removing one would collapse the panel under the player
 * mid-task. Persisted so it also survives a restart, and read through a
 * try/catch because a renderer with storage disabled must still work.
 */
const EXPANDED_EDITIONS_KEY = "playbound_library_expanded_editions";

function loadExpandedEditions() {
  try {
    const raw = localStorage.getItem(EXPANDED_EDITIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

const expandedEditions = loadExpandedEditions();

function setEditionsExpanded(slug, open) {
  if (!slug) return;
  if (open) expandedEditions.add(slug);
  else expandedEditions.delete(slug);
  try {
    localStorage.setItem(EXPANDED_EDITIONS_KEY, JSON.stringify([...expandedEditions]));
  } catch {
    /* storage unavailable — the panel still toggles for this session */
  }
}

function isMeaningfulEditionName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return false;
  return !/^(official|default|standard|base|vanilla)\b/i.test(trimmed);
}

function buildLibraryThumb(game) {
  const thumb = document.createElement("div");
  thumb.className = "library-thumb";
  const grad =
    Array.isArray(game.art) && game.art.length >= 2
      ? `linear-gradient(135deg, ${game.art[0]}, ${game.art[1]})`
      : `linear-gradient(135deg, #312e81, #a78bfa)`;
  thumb.style.background = grad;
  thumb.textContent = (game.title || "?").charAt(0);

  if (game.coverImage) {
    const img = document.createElement("img");
    img.src = game.coverImage;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("load", () => {
      thumb.textContent = "";
      thumb.appendChild(img);
    });
    img.addEventListener("error", () => img.remove());
  }
  return thumb;
}

/**
 * One installed game, as a single horizontal card.
 *
 * Previously this was a 192px-wide column holding a vertical cover card, then
 * a strip of buttons, then a mods disclosure — three separate boxes that read
 * as unrelated, with no width left for a row of controls. Everything now lives
 * inside one bordered card: art and title on the left, the action for that
 * game on the right, and editions and mods nested beneath a divider so they
 * clearly belong to the game above them rather than floating alongside it.
 */
function buildLibraryGameBlock(game, gameMods, modTitles, opts = {}) {
  const block = document.createElement("div");
  block.className = "library-game-block";
  // State drives the dimming and cursor that used to live on the old card
  // classes, which this layout no longer emits.
  if (opts.orphan) block.classList.add("is-orphan");
  if (game.pending) block.classList.add("is-pending");

  const head = document.createElement("div");
  head.className = "library-card-head";
  head.appendChild(buildLibraryThumb(game));

  const copy = document.createElement("div");
  copy.className = "library-card-copy";

  const subtitle = opts.orphan
    ? "Installed mods only"
    : opts.ownedElsewhere
      ? [game.genres?.[0], `In your Library · Not on this ${isMacOS() ? "Mac" : "PC"}`].filter(Boolean).join(" · ")
      : game.pending
        ? game.scanning
          ? "Scanning for install…"
          : `Install not found yet — ${selectExecutableLabel().toLowerCase()}`
        : [game.genres?.[0], game.approxSize].filter(Boolean).join(" · ");

  const isTesting = Boolean(game.testing || game.status === "testing");
  const testingBadge = isTesting
    ? `<span class="badge card-testing-badge" style="margin-left: 6px; font-size: 10px; vertical-align: middle;">Testing</span>`
    : "";

  copy.innerHTML = `
    <div class="library-card-title">${escapeHtml(game.title)}${testingBadge}</div>
    <div class="library-card-sub">${escapeHtml(subtitle || "")}</div>
  `;
  head.appendChild(copy);
  block.appendChild(head);

  if (!opts.orphan) {
    copy.querySelector(".library-card-title")?.addEventListener("click", () =>
      api.openGameDetail(game.slug, "library")
    );
    copy.querySelector(".library-card-title")?.classList.add("linkish");
  }

  const actions = document.createElement("div");
  actions.className = "library-card-actions";

  if (game.pending && !(game.exe || (game.installedEditions || []).some((e) => e.exe))) {
    actions.innerHTML = `
      <button class="btn-primary btn-sm btn-lib-locate" type="button">${selectExecutableLabel()}</button>
      <button class="btn-secondary btn-sm btn-lib-dismiss" type="button">Dismiss</button>
    `;
    actions.querySelector(".btn-lib-locate")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        setStatus(`Locate ${game.title}…`);
        const res = await window.playbound.locateExe(game.slug);
        if (res?.status === "cancelled") {
          setStatus("Locate cancelled.");
          return;
        }
        setStatus(`${game.title} added to library.`);
        api.renderLibraryView();
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    actions.querySelector(".btn-lib-dismiss")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove ${game.title} from Library? (Does not delete game files.)`)) return;
      await window.playbound.dismissPendingInstall?.(game.slug);
      api.renderLibraryView();
    });
    head.appendChild(actions);
  } else if (!opts.orphan) {
    const catalogEntry = opts.catalogEntry;
    const catalogEditions = Array.isArray(catalogEntry?.editions) ? catalogEntry.editions : [];

    const editions = Array.isArray(game.installedEditions)
      ? game.installedEditions.filter((e) => e.exe || e.dir)
      : [];

    const installedMap = new Map();
    for (const ed of editions) {
      if (ed.editionSlug && (ed.exe || ed.dir)) {
        installedMap.set(ed.editionSlug, ed);
      }
    }
    if (installedMap.size === 0 && (game.exe || game.dir)) {
      const s = game.editionSlug || "official";
      installedMap.set(s, {
        editionSlug: s,
        editionName: game.editionName || "Official",
        exe: game.exe,
        dir: game.dir,
      });
    }

    const allEditions = [];
    const seenSlugs = new Set();

    if (catalogEditions.length > 0) {
      for (const catEd of catalogEditions) {
        const inst = installedMap.get(catEd.slug);
        allEditions.push({
          slug: catEd.slug,
          name: catEd.name || catEd.slug,
          type: catEd.type || "official",
          isDefault: Boolean(catEd.isDefault),
          isInstalled: Boolean(inst),
          installedRecord: inst || null,
          catalogRecord: catEd,
        });
        seenSlugs.add(catEd.slug);
      }
    }

    /*
     * An install whose slug does not match the catalog is still that edition.
     *
     * Matching on slug alone produced two rows with the same label whenever the
     * two sides disagreed on the slug — which is exactly what the synthesised
     * fallback above does when a game has no per-edition install records: it
     * invents "official" and names it after `game.editionName`. YSoccer showed
     * as two editions both called "Ysoccer" that way, one from the catalog and
     * one invented, with no way for a player to tell them apart.
     *
     * So fall back to the display name before deciding an install is a
     * separate edition, and when it matches, mark the catalog row installed
     * rather than adding a second one.
     */
    const canonicalName = (value) => String(value || "").trim().toLowerCase();
    const catalogByName = new Map();
    for (const row of allEditions) {
      const key = canonicalName(row.name);
      if (key && !catalogByName.has(key)) catalogByName.set(key, row);
    }

    for (const [s, inst] of installedMap.entries()) {
      if (seenSlugs.has(s)) continue;

      const sameName = catalogByName.get(canonicalName(inst.editionName));
      if (sameName) {
        // Same edition, recorded under a different slug. Adopt the install so
        // Play and the folder actions work, and do not add a duplicate row.
        if (!sameName.isInstalled) {
          sameName.isInstalled = true;
          sameName.installedRecord = inst;
        }
        seenSlugs.add(s);
        continue;
      }

      allEditions.push({
        slug: s,
        name: inst.editionName || s,
        type: inst.editionType || "custom",
        isDefault: false,
        isInstalled: true,
        installedRecord: inst,
        catalogRecord: null,
      });
      seenSlugs.add(s);
    }

    if (allEditions.length === 0) {
      const isInstalled = Boolean(game.exe || game.dir);
      allEditions.push({
        slug: game.editionSlug || "official",
        name: game.editionName || "Official",
        type: "official",
        isDefault: true,
        isInstalled,
        installedRecord: isInstalled ? game : null,
        catalogRecord: null,
      });
    }

    const launchEdition = async (ed) => {
      const curEd = ed.installedRecord;
      const catEd = ed.catalogRecord;
      const pickList = (...cands) => {
        for (const c of cands) {
          if (Array.isArray(c) && c.length > 0) return c;
        }
        return [];
      };
      const detail = {
        title: game.title,
        slug: game.slug,
        gameSlug: game.slug,
        editionName: curEd?.editionName || catEd?.name || game.editionName || null,
        features: pickList(curEd?.features, catEd?.features, catalogEntry?.features, game.features),
        tags: pickList(curEd?.tags, catEd?.tags, catalogEntry?.tags, game.tags),
        gameFeatures: pickList(catalogEntry?.features, game.features),
        gameTags: pickList(catalogEntry?.tags, game.tags),
        controllerSupport: curEd?.controllerSupport || catEd?.controllerSupport || catalogEntry?.controllerSupport || game.controllerSupport,
        hasControllerSupport: curEd?.hasControllerSupport ?? catEd?.hasControllerSupport ?? catalogEntry?.hasControllerSupport ?? game.hasControllerSupport,
      };
      try {
        const launched = await maybeOfferPhoneControllerThenPlay(
          detail,
          async () => {
            setStatus(`Checking Java / launching ${game.title} (${ed.name})…`);
            const res = await window.playbound.play(game.slug, null, ed.slug);
            startGameSession(game.slug, game.title);
            maybeShowLaunchGuidance(res, {
              title: game.title,
              slug: game.slug,
            });
            setStatus(`Launched ${game.title} (${ed.name})`);
          },
          game.slug
        );
        if (!launched) return;
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    };

    if (allEditions.length > 1) {
      const editionsPanel = document.createElement("div");
      editionsPanel.className = "library-card-extra library-card-editions";

      /*
       * Collapsed by default, and independently per game.
       *
       * A library of games each listing every edition is mostly rows nobody
       * asked for, and in the two-column layout a long list used to decide how
       * tall the whole row was. The count stays visible while collapsed so the
       * panel is still worth opening.
       */
      const installedCount = allEditions.filter((e) => e.isInstalled).length;
      const open = expandedEditions.has(game.slug);

      const editionsToggle = document.createElement("button");
      editionsToggle.type = "button";
      editionsToggle.className = "library-editions-toggle";
      editionsToggle.setAttribute("aria-expanded", String(open));
      editionsToggle.innerHTML = `
        <span class="library-editions-title">Editions (${allEditions.length})</span>
        <span class="library-editions-toggle-right">
          <span class="library-editions-summary">${installedCount} installed</span>
          <span class="chevron${open ? " open" : ""}">▾</span>
        </span>
      `;
      editionsPanel.appendChild(editionsToggle);

      const editionsList = document.createElement("div");
      editionsList.className = `library-editions-list${open ? "" : " hidden"}`;

      editionsToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const nowHidden = editionsList.classList.toggle("hidden");
        const isOpen = !nowHidden;
        editionsToggle.setAttribute("aria-expanded", String(isOpen));
        editionsToggle.querySelector(".chevron")?.classList.toggle("open", isOpen);
        setEditionsExpanded(game.slug, isOpen);
      });

      for (const ed of allEditions) {
        const row = document.createElement("div");
        row.className = "library-edition-row";

        const infoDiv = document.createElement("div");
        infoDiv.className = "library-edition-row-info";
        infoDiv.innerHTML = `
          <span class="library-edition-row-name">${escapeHtml(ed.name)}</span>
          ${ed.isDefault ? `<span class="library-edition-status-badge official">Official</span>` : ""}
          ${
            ed.isInstalled
              ? `<span class="library-edition-status-badge installed">Installed</span>`
              : `<span class="library-edition-status-badge not-installed">Not Installed</span>`
          }
        `;
        row.appendChild(infoDiv);

        const rowActions = document.createElement("div");
        rowActions.className = "library-edition-row-actions";

        if (ed.isInstalled) {
          const playBtn = document.createElement("button");
          playBtn.type = "button";
          playBtn.className = "btn-success btn-xs btn-lib-play";
          playBtn.textContent = "Play";
          playBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            launchEdition(ed);
          });
          rowActions.appendChild(playBtn);

          const rowMenuItems = [];
          rowMenuItems.push({
            label: "Open folder",
            onClick: () => {
              const dir = ed.installedRecord?.dir || game.dir;
              if (dir) window.playbound.openFolder(dir);
              else setStatus("No folder recorded for this install.", true);
            },
          });
          rowMenuItems.push({
            label: "Save backups",
            onClick: () => toggleSavesPanel(block, game, ed.slug),
          });
          if (game.slug === "openciv3") {
            rowMenuItems.push({
              label: "Display settings",
              onClick: () => toggleOpenCiv3DisplayPanel(block, game),
            });
          }
          rowMenuItems.push({
            label: "Remove this edition",
            danger: true,
            onClick: async () => {
              const label = `${game.title} — ${ed.name}`;
              try {
                const res = await window.playbound.uninstall(game.slug, ed.slug);
                if (res?.status === "cancelled") return;
                if (res?.warning) setStatus(`Removed ${label} from your library. ${res.warning}`, true);
                else setStatus(`Uninstalled ${label}`);
                api.renderLibraryView();
              } catch (err) {
                setStatus(err.message || String(err), true);
              }
            },
          });
          rowActions.appendChild(buildOverflowMenu(rowMenuItems));
        } else {
          const installBtn = document.createElement("button");
          installBtn.type = "button";
          installBtn.className = "btn-primary btn-xs btn-lib-install";
          installBtn.textContent = "Install";
          installBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            api.openEditionDetail(game.slug, ed.slug, "library");
          });
          rowActions.appendChild(installBtn);
        }

        row.appendChild(rowActions);
        editionsList.appendChild(row);
      }

      editionsPanel.appendChild(editionsList);
      block.appendChild(editionsPanel);
    } else {
      const ed = allEditions[0];
      if (isMeaningfulEditionName(ed.name)) {
        const label = document.createElement("span");
        label.className = "library-edition-label";
        label.title = ed.name;
        label.textContent = ed.name;
        copy.appendChild(label);
      }

      const group = document.createElement("div");
      group.className = "library-action-group";

      if (ed.isInstalled) {
        const play = document.createElement("button");
        play.type = "button";
        play.className = "btn-success btn-sm btn-lib-play";
        play.textContent = "Play";
        play.addEventListener("click", (e) => {
          e.stopPropagation();
          launchEdition(ed);
        });
        group.appendChild(play);

        const joinBtn = buildJoinMultiplayerButton(game, ed);
        if (joinBtn) group.appendChild(joinBtn);

        const menuItems = [
          {
            label: "Open folder",
            onClick: () => {
              const dir = ed.installedRecord?.dir || game.dir;
              if (dir) window.playbound.openFolder(dir);
              else setStatus("No folder recorded for this install.", true);
            },
          },
          {
            label: "Save backups",
            onClick: () => toggleSavesPanel(block, game, ed.slug),
          },
        ];
        if (game.slug === "openciv3") {
          menuItems.push({
            label: "Display settings",
            onClick: () => toggleOpenCiv3DisplayPanel(block, game),
          });
        }
        const adminItem = buildRunAsAdminMenuItem(game);
        if (adminItem) menuItems.push(adminItem);
        menuItems.push({
          label: "Uninstall",
          danger: true,
          onClick: async () => {
            try {
              const res = await window.playbound.uninstall(game.slug, ed.slug);
              if (res?.status === "cancelled") return;
              if (res?.warning) setStatus(`Removed ${game.title}. ${res.warning}`, true);
              else setStatus(`Uninstalled ${game.title}`);
              api.renderLibraryView();
            } catch (err) {
              setStatus(err.message || String(err), true);
            }
          },
        });
        group.appendChild(buildOverflowMenu(menuItems));
      } else {
        const install = document.createElement("button");
        install.type = "button";
        install.className = "btn-primary btn-sm btn-lib-install";
        install.textContent = "Install";
        install.addEventListener("click", (e) => {
          e.stopPropagation();
          if (ed.catalogRecord) {
            api.openEditionDetail(game.slug, ed.slug, "library");
          } else {
            api.openGameDetail(game.slug, "library");
          }
        });
        group.appendChild(install);
      }
      actions.appendChild(group);
      head.appendChild(actions);
    }
  }

  if (gameMods.length) {
    // Nested inside the card, under a divider, so mods read as belonging to
    // the game above them rather than as a separate floating panel.
    const extra = document.createElement("div");
    extra.className = "library-card-extra";
    extra.appendChild(buildModsDisclosure(gameMods, modTitles));
    block.appendChild(extra);
  }
  return block;
}

/* ── save backups ──────────────────────────────────────────── */

function formatSaveBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatSaveWhen(iso) {
  if (!iso) return "unknown time";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "unknown time";
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return then.toLocaleDateString();
}

/**
 * Why a snapshot was taken, in words a player recognises.
 *
 * "pre-restore" matters most: it is the copy taken automatically before a
 * restore replaced things, and it is what makes a wrong restore undoable — so
 * it should read as a safety net rather than as noise in the list.
 */
function describeSaveReason(reason) {
  if (!reason) return "";
  if (reason === "after-play") return "after playing";
  if (reason === "manual") return "backed up manually";
  if (reason === "cloud-upload") return "before syncing";
  if (String(reason).startsWith("pre-restore")) return "before a restore";
  return String(reason);
}

/**
 * The cloud row inside the saves panel.
 *
 * Sync is presented as a decision the player makes, never one taken for them.
 * When both this machine and another have moved on since the last sync there is
 * no correct automatic answer — picking the newer one would throw away someone's
 * session on the other device — so that case offers both directions and says
 * what each will do.
 */
async function renderCloudRow(panel, game, editionSlug, refresh) {
  const row = panel.querySelector(".saves-cloud");
  if (!row) return;

  let status;
  try {
    status = await window.playbound.savesSyncStatus(game.slug, editionSlug);
  } catch (err) {
    row.dataset.state = "error";
    row.textContent = `Cloud saves unavailable: ${err.message || err}`;
    return;
  }

  if (!status?.supported) {
    row.remove();
    return;
  }
  if (!status.signedIn) {
    row.dataset.state = "signed-out";
    row.textContent = "Sign in to PlayBound to sync these saves to your other devices.";
    return;
  }
  if (status.error) {
    row.dataset.state = "error";
    row.textContent = `Cloud saves unavailable: ${status.error}`;
    return;
  }

  const action = status.decision?.action || "noop";
  const reason = status.decision?.reason || "";

  const buttons =
    action === "conflict"
      ? `<button class="btn-secondary btn-sm btn-cloud-up" type="button">Upload this PC's</button>
         <button class="btn-secondary btn-sm btn-cloud-down" type="button">Use the cloud copy</button>`
      : action === "upload"
        ? `<button class="btn-secondary btn-sm btn-cloud-up" type="button">Upload</button>`
        : action === "download"
          ? `<button class="btn-secondary btn-sm btn-cloud-down" type="button">Download</button>`
          : `<button class="btn-secondary btn-sm btn-cloud-up" type="button">Upload anyway</button>`;

  row.dataset.state = action;
  row.innerHTML = `
    <div class="saves-cloud-main">
      <span class="saves-cloud-title">${
        action === "conflict" ? "Saves differ between devices" : "Cloud saves"
      }</span>
      <span class="saves-cloud-sub">${escapeHtml(reason)}</span>
    </div>
    <div class="library-action-group">${buttons}</div>`;

  row.querySelector(".btn-cloud-up")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      setStatus(`Uploading ${game.title} saves…`);
      const res = await window.playbound.savesUpload(game.slug, editionSlug);
      if (res?.status === "too-large") {
        setStatus(res.message || "Saves are too large to sync.", true);
      } else if (res?.status === "no-saves") {
        setStatus("No save files found to upload yet.", true);
      } else {
        setStatus("Saves uploaded.");
      }
      refresh();
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  row.querySelector(".btn-cloud-down")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (
      !confirm(
        `Replace this PC's ${game.title} saves with the cloud copy?\n\n` +
          `Your current saves will be backed up first, so you can undo this.`
      )
    ) {
      return;
    }
    try {
      setStatus(`Downloading ${game.title} saves…`);
      const res = await window.playbound.savesDownload(game.slug, editionSlug, null);
      setStatus(
        res?.status === "none"
          ? "No cloud saves stored for this game yet."
          : "Cloud saves restored. Your previous saves are still in the list."
      );
      refresh();
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });
}

/**
 * Show a game's save history, and let the player put one back.
 *
 * Saves are the one thing PlayBound touches that a player cannot replace, so
 * this deliberately explains what will happen before it happens, and says
 * plainly that the current saves are kept.
 */
async function toggleSavesPanel(block, game, editionSlug) {
  const existing = block.querySelector(".library-saves-panel");
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement("div");
  panel.className = "library-saves-panel";
  panel.innerHTML = `<div class="saves-empty">Loading save history…</div>`;
  block.appendChild(panel);

  let data;
  try {
    data = await window.playbound.savesList(game.slug, editionSlug);
  } catch (err) {
    panel.innerHTML = `<div class="saves-empty">Couldn't read save history: ${escapeHtml(
      err.message || String(err)
    )}</div>`;
    return;
  }

  if (!data?.supported) {
    panel.innerHTML = data?.noLocalSaves
      ? `<div class="saves-empty">
           ${escapeHtml(game.title)} has nothing to back up on this PC. ${escapeHtml(
             data.noLocalSaves
           )}
         </div>`
      : `<div class="saves-empty">
           PlayBound doesn't back up saves for ${escapeHtml(game.title)} yet — we only do it for
           games whose save location we've confirmed, so we never copy or overwrite the wrong folder.
         </div>`;
    return;
  }

  const render = (snapshots) => {
    const rows = snapshots.length
      ? snapshots
          .map(
            (s) => `
        <div class="saves-row">
          <div class="saves-row-main">
            <span class="saves-when">${escapeHtml(formatSaveWhen(s.createdAt))}</span>
            <span class="saves-meta">${escapeHtml(
              [
                s.files ? `${s.files} file${s.files === 1 ? "" : "s"}` : "",
                formatSaveBytes(s.bytes),
                describeSaveReason(s.reason),
              ]
                .filter(Boolean)
                .join(" · ")
            )}</span>
          </div>
          <button class="btn-secondary btn-sm btn-saves-restore" type="button" data-id="${escapeHtml(
            s.id
          )}">Restore</button>
        </div>`
          )
          .join("")
      : `<div class="saves-empty">No backups yet. PlayBound takes one automatically each time you finish playing.</div>`;

    panel.innerHTML = `
      <div class="saves-header">
        <div>
          <div class="saves-title">Save backups</div>
          <div class="saves-sub">Kept on this PC. Restoring always keeps a copy of your current saves first.</div>
        </div>
        <div class="library-action-group">
          <button class="btn-secondary btn-sm btn-saves-now" type="button">Back up now</button>
          <button class="btn-secondary btn-sm btn-saves-folder" type="button">Folder</button>
        </div>
      </div>
      <div class="saves-cloud" data-state="loading">Checking cloud saves…</div>
      <div class="saves-list">${rows}</div>`;

    void renderCloudRow(panel, game, editionSlug, () => render(snapshots));

    panel.querySelector(".btn-saves-now")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        setStatus(`Backing up ${game.title} saves…`);
        const res = await window.playbound.savesSnapshot(game.slug, editionSlug);
        if (res?.status === "no-saves") {
          setStatus("No save files found to back up yet.", true);
        } else if (res?.status === "too-large") {
          setStatus(
            `Saves are ${formatSaveBytes(res.bytes)} — too large to back up automatically.`,
            true
          );
        } else {
          setStatus(`Backed up ${res.files} save file${res.files === 1 ? "" : "s"}.`);
        }
        const fresh = await window.playbound.savesList(game.slug, editionSlug);
        render(fresh.snapshots || []);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });

    panel.querySelector(".btn-saves-folder")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      // Backups are plain copied files, so a player can always recover by hand.
      await window.playbound.savesOpenFolder(game.slug, editionSlug);
    });

    panel.querySelectorAll(".btn-saves-restore").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const when = snapshots.find((s) => s.id === id)?.createdAt;
        if (
          !confirm(
            `Restore ${game.title} saves from ${formatSaveWhen(when)}?\n\n` +
              `Your current saves will be backed up first, so you can undo this.`
          )
        ) {
          return;
        }
        try {
          setStatus(`Restoring ${game.title} saves…`);
          const res = await window.playbound.savesRestore(game.slug, editionSlug, id);
          setStatus(
            res?.safetySnapshot
              ? `Restored ${res.files} file${res.files === 1 ? "" : "s"}. Your previous saves are still in the list.`
              : `Restored ${res?.files ?? 0} file(s).`
          );
          const fresh = await window.playbound.savesList(game.slug, editionSlug);
          render(fresh.snapshots || []);
        } catch (err) {
          setStatus(err.message || String(err), true);
        }
      });
    });
  };

  render(data.snapshots || []);
}

async function toggleOpenCiv3DisplayPanel(block, game) {
  const existing = block.querySelector(".openciv3-display-panel");
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement("div");
  panel.className = "openciv3-display-panel";
  panel.innerHTML = `<p class="view-sub" style="margin:0">Loading display settings…</p>`;
  block.appendChild(panel);

  let settings;
  try {
    settings = await window.playbound.getOpenCiv3Display();
  } catch (err) {
    panel.innerHTML = `<p class="view-sub" style="margin:0;color:var(--danger,#f87171)">${escapeHtml(err.message || String(err))}</p>`;
    return;
  }

  const presets = Array.isArray(settings?.presets) ? settings.presets : [];
  const width = Number(settings?.width) || 1920;
  const height = Number(settings?.height) || 1080;
  const presetMatch = presets.find((p) => p.width === width && p.height === height);
  const presetOptions = [
    ...presets.map(
      (p) =>
        `<option value="${p.width}x${p.height}" ${
          presetMatch && p.width === width && p.height === height ? "selected" : ""
        }>${escapeHtml(p.label)}</option>`
    ),
    `<option value="custom" ${presetMatch ? "" : "selected"}>Custom…</option>`,
  ].join("");

  panel.innerHTML = `
    <div class="openciv3-display-title">Window resolution</div>
    <p class="view-sub openciv3-display-hint">OpenCiv3 starts small by default. Pick a size — applied on next launch.</p>
    <div class="openciv3-display-label">Preset
      <select id="openciv3-preset" class="openciv3-display-select">${presetOptions}</select>
    </div>
    <div class="openciv3-display-custom">
      <label class="openciv3-display-label">Width
        <input type="number" id="openciv3-width" class="openciv3-display-input" min="640" max="7680" step="1" value="${width}" />
      </label>
      <label class="openciv3-display-label">Height
        <input type="number" id="openciv3-height" class="openciv3-display-input" min="640" max="7680" step="1" value="${height}" />
      </label>
    </div>
    <div class="openciv3-display-actions">
      <button type="button" class="btn-primary btn-sm" id="openciv3-apply">Apply</button>
      <button type="button" class="btn-secondary btn-sm" id="openciv3-close">Close</button>
    </div>
  `;

  const presetEl = panel.querySelector("#openciv3-preset");
  const widthEl = panel.querySelector("#openciv3-width");
  const heightEl = panel.querySelector("#openciv3-height");

  function syncCustomFromPreset() {
    const v = presetEl?.value || "";
    if (v === "custom") return;
    const [w, h] = v.split("x").map(Number);
    if (widthEl && Number.isFinite(w)) widthEl.value = String(w);
    if (heightEl && Number.isFinite(h)) heightEl.value = String(h);
  }

  presetEl?.addEventListener("change", () => {
    syncCustomFromPreset();
  });
  widthEl?.addEventListener("input", () => {
    if (presetEl) presetEl.value = "custom";
  });
  heightEl?.addEventListener("input", () => {
    if (presetEl) presetEl.value = "custom";
  });

  panel.querySelector("#openciv3-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.remove();
  });

  panel.querySelector("#openciv3-apply")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const w = Number(widthEl?.value);
    const h = Number(heightEl?.value);
    try {
      await window.playbound.setOpenCiv3Display({ width: w, height: h });
      setStatus(`OpenCiv3 display set to ${w}×${h} — restart the game if it’s running.`);
      panel.remove();
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });
}

/**
 * Elevation state, read once per render so the menu label is right.
 *
 * Populated by the same pass that builds the cards, because a menu item cannot
 * wait on IPC to decide its own label without the menu opening blank.
 */
const runAsAdminState = new Map();

async function loadRunAsAdminState(slugs) {
  runAsAdminState.clear();
  if (!window.playbound?.getRunAsAdmin) return;
  await Promise.all(
    slugs.map(async (slug) => {
      try {
        runAsAdminState.set(slug, await window.playbound.getRunAsAdmin(slug));
      } catch {
        /* leave unset; the item just does not render */
      }
    })
  );
}

/**
 * "Always run as administrator", per game.
 *
 * Some games ship a loader that Windows will not start without elevation.
 * The launcher offers this after a launch fails, but that means failing once
 * to configure it — and a game added by hand has no catalog row to carry the
 * `needsAdmin` flag, so a failure was the *only* way to set it. This is the
 * way to say so up front.
 *
 * Windows-only: elevation is a Windows concept, and ShellExecute's runas verb
 * is what implements it.
 */
function buildRunAsAdminMenuItem(game) {
  if (!/win/i.test(navigator.platform || "") && navigator.userAgent.indexOf("Windows") === -1) {
    return null;
  }
  const state = runAsAdminState.get(game.slug);
  if (!state) return null;

  // Set by the catalog rather than by this player — showing a toggle that
  // cannot turn it off would just look broken.
  if (state.fromCatalog && state.enabled) {
    return {
      label: "Runs as administrator (required)",
      onClick: () =>
        setStatus(`${game.title} is set to run as administrator because it needs it.`),
    };
  }

  return {
    label: state.enabled ? "Don't run as administrator" : "Always run as administrator",
    onClick: async () => {
      const next = !state.enabled;
      try {
        await window.playbound.setRunAsAdmin(game.slug, next);
        setStatus(
          next
            ? `${game.title} will run as administrator. Windows will ask you to confirm each launch.`
            : `${game.title} will run normally.`
        );
        api.renderLibraryView();
      } catch (err) {
        setStatus(err?.message || String(err), true);
      }
    },
  };
}

/**
 * "Join Multiplayer" — one click into a server worth playing on.
 *
 * Only rendered for games the launcher can actually join from the command
 * line. A button that launches the game and leaves the player to find the
 * server themselves is not the thing being offered, so games that join from an
 * in-game menu do not get one.
 *
 * The server is chosen when the button is pressed, not when the library is
 * rendered: deciding it up front would mean polling every provider in the
 * catalog on every visit to this page, and the answer goes stale in seconds
 * anyway. The button therefore starts optimistic and reports honestly when
 * nothing good is available, which is the same shape as Play failing.
 */
function buildJoinMultiplayerButton(game, ed) {
  const slug = game?.slug;
  if (!slug) return null;
  const caps = window.playbound?.joinCapability?.(slug);
  if (!caps?.canCommandLineJoin) return null;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-secondary btn-sm btn-lib-join";
  btn.textContent = "Join Multiplayer";
  btn.title = "Find a server with players on it and join";

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (btn.disabled) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Finding…";
    try {
      const best = await window.playbound.findBestServer(slug);
      if (!best?.server) {
        // Each reason needs different words: "nobody is on" and "we could not
        // judge these servers" are not the same problem for the player.
        const message =
          best?.reason === "no-servers"
            ? `No ${game.title} servers are listed right now.`
            : best?.reason === "unsupported"
              ? `PlayBound does not track ${game.title} servers.`
              : `No ${game.title} server has enough players and a good connection right now.`;
        setStatus(message, true);
        return;
      }
      const s = best.server;
      setStatus(`Joining ${s.name || `${s.host}:${s.port}`} — ${s.players}/${s.maxPlayers} players`);
      await window.playbound.play(
        slug,
        { host: s.host, port: s.port, name: s.name, mod: s.mod || undefined },
        ed?.slug || undefined
      );
    } catch (err) {
      setStatus(err?.message || String(err), true);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  return btn;
}

function buildModsDisclosure(gameMods, modTitles) {
  const wrap = document.createElement("div");
  wrap.className = "library-mods-disclosure";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "library-mods-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = `<span>Mods (${gameMods.length})</span><span class="chevron">▾</span>`;

  const panel = document.createElement("div");
  panel.className = "library-mods-panel hidden";

  for (const mod of gameMods) {
    const title = modTitles.get(mod.slug) || mod.title || mod.slug;
    const row = document.createElement("div");
    row.className = "library-mod-row";
    // Same shape as the game row above it: name, one action, then a menu.
    row.innerHTML = `
      <button type="button" class="library-mod-title linkish" title="${escapeHtml(title)}">${escapeHtml(title)}</button>
      <div class="library-action-group library-mod-actions"></div>
    `;
    row.querySelector(".library-mod-title")?.addEventListener("click", (e) => {
      e.stopPropagation();
      api.openModDetail(mod.slug, "library");
    });

    const modActions = row.querySelector(".library-mod-actions");
    const modPlay = document.createElement("button");
    modPlay.type = "button";
    modPlay.className = "btn-primary btn-sm btn-mod-play";
    modPlay.textContent = "Play";
    modPlay.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        setStatus(`Launching ${title}…`);
        await window.playbound.playMod(mod.slug);
        setStatus(`Launched ${title}`);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    modActions.appendChild(modPlay);

    modActions.appendChild(
      buildOverflowMenu([
        mod.dir
          ? { label: "Open folder", onClick: () => window.playbound.openFolder(mod.dir) }
          : null,
        {
          label: "Remove",
          danger: true,
          onClick: async () => {
            if (!confirm(`Uninstall ${title}? This removes the mod from this PC.`)) return;
            await window.playbound.uninstallMod(mod.slug);
            api.renderLibraryView();
          },
        },
      ])
    );
    panel.appendChild(row);
  }

  toggle.addEventListener("click", () => {
    const nowHidden = panel.classList.toggle("hidden");
    const open = !nowHidden;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector(".chevron")?.classList.toggle("open", open);
  });

  wrap.appendChild(toggle);
  wrap.appendChild(panel);
  return wrap;
}

api.renderLibraryView = renderLibraryView;
