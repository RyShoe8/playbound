import { createFreeOfferCard, createGameCard } from "./cards.js";
import { rankPlayableNow, scorePlayable } from "./homeRanking.js";
import {
  api,
  buildMultiplayerStatsHtml,
  CACHE_TTL,
  cacheInvoke,
  cachePeek,
  cachePut,
  filterCatalogGames,
  formatStatNumber,
  markViewReady,
  playingNowBySlug,
  state,
  syncDiscoveryControls,
  views,
} from "./shared.js";

/**
 * The home view answers "what do I click", not "what exists".
 *
 * Five rows, ordered by how close each is to actually playing: resume, join a
 * populated server, join your friends, something you might like, and the one
 * genuinely browse-shaped row at the bottom. Everything above Free Games is
 * ranked by homeRanking.js, which scores eligibility rather than taste and
 * carries the reason for its ordering on every card.
 */

const HOME_SHELL_HTML = `
    <div id="home-mp-stats"></div>

    <div id="home-resume-section" class="home-resume hidden"></div>

    <div id="home-live-section" class="hidden">
      <div class="section-header">
        <span>Jump into multiplayer</span>
        <button class="btn-secondary btn-sm" id="home-browse-servers">All Servers</button>
      </div>
      <div id="home-live-list" class="home-join-list"></div>
    </div>

    <div id="home-people-section" class="hidden">
      <div class="section-header">
        <span>Your people</span>
        <button class="btn-secondary btn-sm" id="home-browse-friends">Friends</button>
      </div>
      <div id="home-people-list" class="home-join-list"></div>
    </div>

    <div id="home-picks-section" class="hidden">
      <div class="section-header">
        <span id="home-picks-title">Recommended for you</span>
        <button class="btn-secondary btn-sm" id="home-browse-games">Browse Games</button>
      </div>
      <div id="home-picks-grid" class="game-grid"></div>
    </div>

    <div id="home-free-offers-section" class="hidden">
      <div class="section-header">
        <span>🎁 Free Games This Week</span>
        <button class="btn-secondary btn-sm" id="home-browse-free-games">See All on Web</button>
      </div>
      <div id="home-free-offers-grid" class="game-grid"></div>
    </div>
`;

function ensureHomeShell() {
  const container = views.home;
  if (!container) return null;
  if (!document.getElementById("home-picks-grid")) {
    container.innerHTML = HOME_SHELL_HTML;
    container.dataset.homeWired = "";
  }
  if (!container.dataset.homeWired) {
    container.dataset.homeWired = "1";
    document.getElementById("home-browse-games")?.addEventListener("click", () => api.navigateTo?.("games"));
    document.getElementById("home-browse-servers")?.addEventListener("click", () => api.navigateTo?.("servers"));
    document.getElementById("home-browse-friends")?.addEventListener("click", () => api.navigateTo?.("friends"));
    document.getElementById("home-browse-free-games")?.addEventListener("click", () => {
      window.playbound.openExternal("https://playbound.club/free-games");
    });
  }
  return container;
}

/** One player-count snapshot shared by every card, on the 15-minute cadence. */
let homePlayingNow = new Map();

/** Resolved once per view render; a connected pad lifts controller weighting. */
let padConnected = false;

function makeCard(game) {
  return createGameCard(game, homePlayingNow.get(game.slug));
}

function setStatus(message, isError = false) {
  api.setStatus?.(message, isError);
}

/* ------------------------------------------------------------------ *
 * Shared row primitives
 * ------------------------------------------------------------------ */

/**
 * A single joinable line: art, title, the reason it is here, and one button.
 *
 * Deliberately not a game card. A card invites you to read about a game; this
 * row exists to be pressed.
 */
function buildJoinRow({ game, reason, buttonLabel, title, onClick, badge }) {
  const row = document.createElement("div");
  row.className = "home-join-row";

  const art = document.createElement("div");
  art.className = "home-join-art";
  const colors = Array.isArray(game.art) && game.art.length >= 2 ? game.art : ["#2a2739", "#4a4658"];
  art.style.background = game.coverImage
    ? `center/cover no-repeat url("${game.coverImage}")`
    : `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;

  const body = document.createElement("div");
  body.className = "home-join-body";

  const name = document.createElement("p");
  name.className = "home-join-title";
  name.textContent = game.title || game.slug;

  const why = document.createElement("p");
  why.className = "home-join-reason";
  why.textContent = reason || "";

  body.append(name, why);
  if (badge) body.append(badge);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-primary btn-sm home-join-btn";
  btn.textContent = buttonLabel;
  if (title) btn.title = title;
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (btn.disabled) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Joining…";
    try {
      await onClick();
    } catch (err) {
      setStatus(err?.message || String(err), true);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  row.append(art, body, btn);
  row.addEventListener("click", () => api.openGameDetail?.(game.slug, "home"));
  return row;
}

/**
 * The strongest reason that is not the controller.
 *
 * Every surface that shows a reason line also shows the controller badge next
 * to it, and both render controller.label — so whenever the pad was the top
 * signal the same sentence appeared twice, once as prose and once as a tag.
 * The badge is the better home for it: it is shorter and it carries the
 * confidence tier in its styling.
 */
function topNonControllerReason(entry) {
  return (entry?.reasons || []).find((r) => r.key !== "controller")?.text || "";
}

function controllerBadge(controller) {
  if (!controller?.label) return null;
  const el = document.createElement("span");
  el.className = `home-pad-badge home-pad-${controller.confidence}`;
  el.textContent = controller.label;
  return el;
}

/**
 * Connect straight to a server rather than dropping the player in a menu.
 *
 * The server name and ping are already on the button by the time this runs, so
 * the destination was visible before the click — which is what makes skipping a
 * confirm step reasonable rather than presumptuous.
 */
async function joinBestServer(game, server) {
  const slug = game.slug;
  let s = server;
  if (!s) {
    const best = await window.playbound.findBestServer(slug);
    if (!best?.server) {
      setStatus(
        best?.reason === "no-servers"
          ? `No ${game.title} servers are listed right now.`
          : `No ${game.title} server has enough players and a good connection right now.`,
        true
      );
      return;
    }
    s = best.server;
  }
  setStatus(
    `Joining ${s.name || `${s.host}:${s.port}`} — ${formatStatNumber(s.players)}/${formatStatNumber(s.maxPlayers)} players`
  );
  await window.playbound.play(
    slug,
    { host: s.host, port: s.port, name: s.name, mod: s.mod || undefined },
    undefined
  );
}

/* ------------------------------------------------------------------ *
 * Row 01 — Resume
 * ------------------------------------------------------------------ */

function paintResume(entry) {
  const sec = document.getElementById("home-resume-section");
  if (!sec) return;
  if (!entry) {
    sec.classList.add("hidden");
    sec.replaceChildren();
    return;
  }

  const { game, server, controller, installed } = entry;
  sec.classList.remove("hidden");
  sec.replaceChildren();

  const card = document.createElement("div");
  card.className = "home-resume-card";
  const colors = Array.isArray(game.art) && game.art.length >= 2 ? game.art : ["#2a2739", "#4a4658"];
  card.style.background = game.coverImage
    ? `center/cover no-repeat url("${game.coverImage}")`
    : `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;

  const scrim = document.createElement("div");
  scrim.className = "home-resume-scrim";

  const copy = document.createElement("div");
  copy.className = "home-resume-copy";

  const eyebrow = document.createElement("p");
  eyebrow.className = "home-resume-eyebrow";
  eyebrow.textContent = installed ? "Continue" : "Start here";

  const title = document.createElement("h2");
  title.className = "home-resume-title";
  title.textContent = game.title || game.slug;

  const sub = document.createElement("p");
  sub.className = "home-resume-sub";
  // The badge below this line carries the pad signal; see
  // topNonControllerReason for why it must not also be the sentence.
  const topReason = topNonControllerReason(entry);
  sub.textContent = server
    ? `${server.name || `${server.host}:${server.port}`} · ${formatStatNumber(server.players)}/${formatStatNumber(server.maxPlayers)} players${
        Number.isFinite(server.ping) ? ` · ${Math.round(server.ping)}ms` : ""
      }`
    : topReason || game.tagline || "";

  copy.append(eyebrow, title, sub);
  const pad = controllerBadge(controller);
  if (pad) copy.append(pad);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-primary home-resume-btn";
  // The server is named on the button so the destination is legible before the
  // click; that is the whole justification for not asking first.
  btn.textContent = !installed ? "Install" : server ? "Play — join server" : "Play";
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    btn.disabled = true;
    try {
      if (!installed) {
        api.openGameDetail?.(game.slug, "home");
      } else if (server) {
        await joinBestServer(game, server);
      } else {
        await window.playbound.play(game.slug);
      }
    } catch (err) {
      setStatus(err?.message || String(err), true);
    } finally {
      btn.disabled = false;
    }
  });

  copy.append(btn);
  card.append(scrim, copy);
  card.addEventListener("click", () => api.openGameDetail?.(game.slug, "home"));
  sec.append(card);
}

/* ------------------------------------------------------------------ *
 * Row 02 — Jump into multiplayer
 * ------------------------------------------------------------------ */

function paintLive(entries) {
  const sec = document.getElementById("home-live-section");
  const list = document.getElementById("home-live-list");
  if (!sec || !list) return;
  if (entries.length === 0) {
    // Hide rather than show a row of zeroes — "nobody is playing" is not a
    // thing worth a section header.
    sec.classList.add("hidden");
    list.replaceChildren();
    return;
  }
  sec.classList.remove("hidden");
  list.replaceChildren(
    ...entries.map((e) =>
      buildJoinRow({
        game: e.game,
        // Same reason as the hero: the badge beside this line already renders
        // controller.label, and a server with nobody on it produces no
        // occupancy reason, which let the pad reason reach the top here too.
        reason: topNonControllerReason(e) || "",
        buttonLabel: e.installed ? "Join" : "Install & join",
        title: e.server
          ? `${e.server.name || e.server.host} — ${formatStatNumber(e.server.players)} players`
          : "Find a server",
        badge: controllerBadge(e.controller),
        onClick: async () => {
          if (!e.installed) {
            api.openGameDetail?.(e.game.slug, "home");
            return;
          }
          await joinBestServer(e.game, e.server);
        },
      })
    )
  );
}

/* ------------------------------------------------------------------ *
 * Row 03 — Your people
 * ------------------------------------------------------------------ */

function paintPeople(parties, lookingCount, bySlug) {
  const sec = document.getElementById("home-people-section");
  const list = document.getElementById("home-people-list");
  if (!sec || !list) return;

  const rows = [];
  for (const party of parties.slice(0, 4)) {
    const game = bySlug.get(party.gameSlug);
    if (!game) continue;
    const seats =
      Number.isFinite(party.memberCount) && Number.isFinite(party.maxMembers)
        ? `${formatStatNumber(party.memberCount)}/${formatStatNumber(party.maxMembers)} in the party`
        : "Open party";
    rows.push(
      buildJoinRow({
        game,
        reason: party.name ? `${party.name} · ${seats}` : seats,
        buttonLabel: "Join party",
        onClick: async () => {
          await window.playbound.joinParty?.(party.id);
          api.navigateTo?.("friends");
        },
      })
    );
  }

  if (rows.length === 0 && lookingCount > 0) {
    // Nothing joinable, but people are waiting — offer the action rather than
    // the number.
    const cta = document.createElement("div");
    cta.className = "home-join-empty";
    cta.textContent =
      lookingCount === 1
        ? "1 player is looking to party. Start one and they can find you."
        : `${lookingCount} players are looking to party. Start one and they can find you.`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-secondary btn-sm";
    btn.textContent = "Open Friends";
    btn.addEventListener("click", () => api.navigateTo?.("friends"));
    cta.append(btn);
    rows.push(cta);
  }

  if (rows.length === 0) {
    sec.classList.add("hidden");
    list.replaceChildren();
    return;
  }
  sec.classList.remove("hidden");
  list.replaceChildren(...rows);
}

/* ------------------------------------------------------------------ *
 * Row 04 — Recommended
 * ------------------------------------------------------------------ */

function paintPicks(entries, sourceTitle) {
  const sec = document.getElementById("home-picks-section");
  const grid = document.getElementById("home-picks-grid");
  const heading = document.getElementById("home-picks-title");
  if (!sec || !grid) return;
  if (entries.length === 0) {
    sec.classList.add("hidden");
    grid.replaceChildren();
    return;
  }
  if (heading) {
    heading.textContent = sourceTitle ? `Because you play ${sourceTitle}` : "Recommended for you";
  }
  sec.classList.remove("hidden");
  grid.replaceChildren(
    ...entries.map((e) => {
      const card = makeCard(e.game);
      const pad = controllerBadge(e.controller);
      // Badge on the card itself so the pad signal survives outside the ranked
      // rows — an unplugged controller is still a controller you own.
      if (pad) card.append(pad);
      return card;
    })
  );
}

/* ------------------------------------------------------------------ *
 * Multiplayer activity card
 * ------------------------------------------------------------------ */

/**
 * Counts that live outside the catalog snapshot. Best-effort: a failure keeps
 * the previous figure rather than flashing a zero.
 */
async function loadExtraStats(friendsOnline) {
  try {
    const [pRes, lfgRes] = await Promise.allSettled([
      fetch("https://playbound.club/api/parties/open-count", {
        signal: AbortSignal.timeout(5000),
      }).then((r) => (r.ok ? r.json() : null)),
      fetch("https://playbound.club/api/presence/lfg/count", {
        signal: AbortSignal.timeout(5000),
      }).then((r) => (r.ok ? r.json() : null)),
    ]);
    const openParties =
      pRes.status === "fulfilled" && typeof pRes.value?.count === "number"
        ? pRes.value.count
        : state.liveExtraStats?.openParties;
    const lookingToParty =
      lfgRes.status === "fulfilled" && typeof lfgRes.value?.count === "number"
        ? lfgRes.value.count
        : state.liveExtraStats?.lookingToParty;
    state.liveExtraStats = { openParties, lookingToParty };
  } catch {
    /* keep whatever we had */
  }
  paintMultiplayerStats(friendsOnline);
}

function paintMultiplayerStats(friendsOnline = 0) {
  const slot = document.getElementById("home-mp-stats");
  if (!slot) return;
  slot.innerHTML = buildMultiplayerStatsHtml(state._liveStatsLastGood, {
    ...state.liveExtraStats,
    friendsOnline,
  });
  slot.querySelectorAll("[data-popular-slug]").forEach((btn) => {
    btn.addEventListener("click", () => api.openGameDetail?.(btn.dataset.popularSlug, "home"));
  });
  slot.querySelectorAll("[data-stats-nav]").forEach((btn) => {
    btn.addEventListener("click", () => api.navigateTo?.(btn.dataset.statsNav));
  });
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

/** Controller support for a handful of slugs, resolved in parallel. */
async function controllerSupportFor(slugs) {
  const pairs = await Promise.all(
    slugs.map(async (slug) => {
      try {
        return [slug, await window.playbound.getControllerSupport?.(slug)];
      } catch {
        return [slug, null];
      }
    })
  );
  return new Map(pairs);
}

/**
 * Build every ranked row from one pass over the catalog.
 *
 * Everything here is best-effort: a failed friends call or an unreachable
 * server index degrades one row rather than emptying the page.
 */
async function loadPlayableRows() {
  const catalog = filterCatalogGames(state.catalogCache || []);
  if (catalog.length === 0) return;
  const bySlug = new Map(catalog.map((g) => [g.slug, g]));

  const [installedRes, recentRes, indexRes, friendsRes, partiesRes, lfgRes, padsRes] =
    await Promise.allSettled([
      cacheInvoke("installed", CACHE_TTL.installed, () => window.playbound.getInstalled?.()),
      window.playbound.getRecentlyPlayed?.(),
      cacheInvoke("serverIndex", 60_000, () => window.playbound.getServerIndex?.()),
      cacheInvoke("friends", CACHE_TTL.friends, () => window.playbound.getFriends?.()),
      window.playbound.getParties?.({ open: true }),
      window.playbound.getLfg?.(),
      window.playbound.getControllerSupport?.("__probe__"),
    ]);

  const val = (r, fallback) => (r.status === "fulfilled" && r.value != null ? r.value : fallback);

  const installedList = val(installedRes, []);
  const installed = new Set(
    (Array.isArray(installedList) ? installedList : installedList?.games || []).map(
      (g) => g.slug || g
    )
  );

  const recent = Array.isArray(val(recentRes, [])) ? val(recentRes, []) : [];
  const lastPlayedBySlug = new Map(recent.map((r) => [r.slug, r.lastPlayed]));
  const history = recent.map((r) => bySlug.get(r.slug)).filter(Boolean);

  const index = val(indexRes, { games: [] });
  const hasBrowser = new Set((index.games || []).map((g) => g.slug));

  const friends = val(friendsRes, []);
  const friendsBySlug = new Map();
  for (const f of Array.isArray(friends) ? friends : friends?.friends || []) {
    const slug = f?.presence?.gameSlug || f?.gameSlug;
    if (slug) friendsBySlug.set(slug, (friendsBySlug.get(slug) || 0) + 1);
  }

  const friendsOnlineCount = (Array.isArray(friends) ? friends : friends?.friends || []).filter(
    (f) => f?.presence?.online || f?.online
  ).length;
  paintMultiplayerStats(friendsOnlineCount);
  void loadExtraStats(friendsOnlineCount);

  const parties = val(partiesRes, []);
  const openParties = (Array.isArray(parties) ? parties : parties?.parties || []).filter(
    (p) => p?.gameSlug && p?.isOpen !== false
  );
  const lfg = val(lfgRes, null);
  const lookingCount = Number.isFinite(lfg?.count) ? lfg.count : 0;

  // A single probe tells us whether a pad is present; per-game support is
  // fetched only for the games actually rendered.
  padConnected = Boolean(val(padsRes, null)?.padConnected ?? state.padConnected ?? false);

  /* ---- row 02: games with people on them ---- */
  const liveCandidates = catalog
    .filter((g) => hasBrowser.has(g.slug))
    .map((g) => ({ slug: g.slug, players: homePlayingNow.get(g.slug) || 0 }))
    .filter((c) => c.players > 0)
    .sort((a, b) => b.players - a.players)
    .slice(0, 6);

  // Only the shortlist pays for a best-server lookup, which keeps this to a
  // handful of calls no matter how large the catalog gets.
  const bestServers = new Map(
    await Promise.all(
      liveCandidates.map(async (c) => {
        try {
          const best = await window.playbound.findBestServer?.(c.slug);
          return [c.slug, best?.server || null];
        } catch {
          return [c.slug, null];
        }
      })
    )
  );

  const liveSlugs = liveCandidates.map((c) => c.slug);
  const liveSupport = await controllerSupportFor(liveSlugs);

  const liveRanked = rankPlayableNow(
    liveCandidates.map((c) => {
      const server = bestServers.get(c.slug);
      return {
        game: bySlug.get(c.slug),
        installed: installed.has(c.slug),
        friendsPresent: friendsBySlug.get(c.slug) || 0,
        server: server
          ? { players: server.players, maxPlayers: server.maxPlayers, ping: server.ping }
          : { players: c.players, maxPlayers: null, ping: null },
        controllerSupport: liveSupport.get(c.slug),
        lastPlayed: lastPlayedBySlug.get(c.slug),
      };
    }),
    { history, padConnected }
  ).map((e) => ({ ...e, server: bestServers.get(e.slug) || null }));

  paintLive(liveRanked.slice(0, 5));

  /* ---- row 01: resume ---- */
  const resumeSlug = recent.find((r) => bySlug.get(r.slug))?.slug;
  if (resumeSlug) {
    const g = bySlug.get(resumeSlug);
    const support = (await controllerSupportFor([resumeSlug])).get(resumeSlug);
    const server = bestServers.get(resumeSlug) || null;
    const entry = scorePlayable(
      {
        game: g,
        installed: installed.has(resumeSlug),
        friendsPresent: friendsBySlug.get(resumeSlug) || 0,
        server: server
          ? { players: server.players, maxPlayers: server.maxPlayers, ping: server.ping }
          : null,
        controllerSupport: support,
        lastPlayed: lastPlayedBySlug.get(resumeSlug),
      },
      { history, padConnected }
    );
    paintResume({ ...entry, server, installed: installed.has(resumeSlug) });
  } else {
    // Cold start: no history, so lead with the strongest thing to install.
    const first = liveRanked[0];
    if (first) paintResume({ ...first, installed: false });
  }

  /* ---- row 03: parties ---- */
  paintPeople(openParties, lookingCount, bySlug);

  /* ---- row 04: recommendations ---- */
  const shown = new Set([...liveRanked.slice(0, 5).map((e) => e.slug), resumeSlug]);
  const pickCandidates = catalog.filter((g) => !shown.has(g.slug)).slice(0, 40);
  const pickSupport = await controllerSupportFor(pickCandidates.map((g) => g.slug));
  const picks = rankPlayableNow(
    pickCandidates.map((g) => ({
      game: g,
      installed: installed.has(g.slug),
      friendsPresent: friendsBySlug.get(g.slug) || 0,
      server: homePlayingNow.get(g.slug)
        ? { players: homePlayingNow.get(g.slug), maxPlayers: null, ping: null }
        : null,
      controllerSupport: pickSupport.get(g.slug),
      lastPlayed: lastPlayedBySlug.get(g.slug),
    })),
    { history, padConnected }
  ).slice(0, 8);

  paintPicks(picks, history[0]?.title || null);
}

/* ------------------------------------------------------------------ *
 * Live stats plumbing (unchanged in behaviour)
 * ------------------------------------------------------------------ */

function applyLiveStats(raw) {
  if (!raw || raw.ok === false || typeof raw.gameCount !== "number") return;
  state._liveStatsLastGood = raw;
  cachePut("catalogLiveStats", raw);
  homePlayingNow = playingNowBySlug(raw);
  if (!document.getElementById("home-picks-grid")?.isConnected) return;
  void loadPlayableRows();
}

window.playbound?.onLiveStatsUpdated?.((raw) => applyLiveStats(raw));

function loadLiveStats() {
  const peek = cachePeek("catalogLiveStats", CACHE_TTL.catalogLiveStats);
  const lastGood =
    peek?.data && typeof peek.data.gameCount === "number" ? peek.data : state._liveStatsLastGood;
  if (lastGood) homePlayingNow = playingNowBySlug(lastGood);
  if (peek?.fresh) return;
  void (async () => {
    const raw = await (window.playbound.getLiveStats?.() ?? Promise.resolve(null));
    applyLiveStats(raw);
  })();
}

function loadFreeOffers() {
  void (async () => {
    try {
      const res = await cacheInvoke("freeOffers", CACHE_TTL.freeOffers, () =>
        window.playbound.getFreeOffers?.()
      );
      const offers = Array.isArray(res?.offers) ? res.offers : [];
      const freeSec = document.getElementById("home-free-offers-section");
      const freeGrid = document.getElementById("home-free-offers-grid");
      if (freeSec && freeGrid && offers.length > 0) {
        freeSec.classList.remove("hidden");
        freeGrid.replaceChildren(...offers.map(createFreeOfferCard));
      }
    } catch {
      /* ignore */
    }
  })();
}

/**
 * Repaint after a catalog or discovery-mode change.
 *
 * Kept under the old name because boot.js calls it on catalog updates; the rows
 * are all derived, so a full rebuild is the correct response to the catalog
 * changing underneath them.
 */
export function paintHomeGrids() {
  syncDiscoveryControls();
  if (document.getElementById("home-picks-grid")) void loadPlayableRows();
}

export async function renderHomeView() {
  ensureHomeShell();
  syncDiscoveryControls();
  loadLiveStats();
  void loadPlayableRows();
  loadFreeOffers();
  markViewReady(views.home);
}

api.renderHomeView = renderHomeView;
api.paintHomeGrids = paintHomeGrids;
