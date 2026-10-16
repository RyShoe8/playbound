import {api, escapeHtml, state, views, setStatus} from '../shared.js';
import {renderServerManager} from './serverManager.js';

const request = async (path, method = 'GET', body) => {
  const result = await window.playbound.workspaceRequest({path,method,body});
  if (result?.error) throw new Error(result.error);
  return result || {};
};
function heading(container, title, copy) {
  container.innerHTML = `<div class="site-page-heading"><h1 class="view-title">${title}</h1><p class="view-sub">${copy}</p></div><div class="workspace-body"><p role="status">Loading…</p></div>`;
  return container.querySelector('.workspace-body');
}
function failure(host, error, retry) {
  host.innerHTML = `<div class="site-panel site-pad"><p role="alert">${escapeHtml(error.message)}</p><button class="btn-secondary">Retry</button></div>`;
  host.querySelector('button').onclick = retry;
}
function signIn(host) {
  host.innerHTML = '<section class="site-panel site-pad"><h2>Bring your account with you</h2><p>Sign in to manage your servers and developer workspace inside PlayBound.</p><button class="btn-primary">Sign in</button></section>';
  host.querySelector('button').onclick = () => window.playbound.signIn();
}
async function action(button, run) {
  button.disabled = true;
  try { await run(); } catch(error) { setStatus(error.message, true); }
  finally { button.disabled = false; }
}
function input(label, name, value = '', type = 'text') {
  return `<label class="workspace-field">${escapeHtml(label)}<input class="input-text" name="${escapeHtml(name)}" type="${type}" value="${escapeHtml(String(value ?? ''))}"></label>`;
}

/*
 * The hosting promo a player without an active plan sees on My servers. It is the
 * website's /hosting page: hero over a wall of cover art, the Basic plan card with
 * its slot picker and popular games, the hosting map, and the support strip. The
 * data comes from /api/launcher/hosting-promo, which serves what that page renders.
 */
const promoMoney = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;
const editionLabel = (slug) => String(slug).replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const SERVER_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>';

function hostingMapSvg(promo) {
  const active = promo.regions || [];
  const label = active.length ? `US hosting regions: ${active.map((r) => r.label).join(', ')}` : 'Map of the contiguous United States';
  const paths = (promo.statePaths || []).map((d) => `<path d="${escapeHtml(d)}" class="hosting-map-state"/>`).join('');
  const pins = active.filter((r) => r.point).map((r) => `<g><circle cx="${r.point.x}" cy="${r.point.y}" r="35" class="hosting-map-glow"/><circle cx="${r.point.x}" cy="${r.point.y}" r="11" class="hosting-map-ring"/><circle cx="${r.point.x}" cy="${r.point.y}" r="5" class="hosting-map-dot"/><text x="${r.point.x + 14}" y="${r.point.y + 4}" class="hosting-map-label">${escapeHtml(r.label)}</text></g>`).join('');
  return `<svg viewBox="0 0 800 430" role="img" aria-label="${escapeHtml(label)}" class="hosting-map">${paths}${pins}</svg><div class="hosting-map-pills">${active.map((r) => `<span>${escapeHtml(r.label)}</span>`).join('')}</div>`;
}

function hostingPromoHtml(promo) {
  const heroCovers = (promo.hero || []).map((g) => `<div><img src="${escapeHtml(g.cover)}" alt="${escapeHtml(g.name)} cover art" loading="lazy"></div>`).join('');
  const packages = promo.packages || [];
  const tiles = (promo.games || []).map((g) => `<button type="button" class="hosting-tile" data-web="/hosting/${escapeHtml(g.slug)}"><span class="hosting-tile-art">${g.cover ? `<img src="${escapeHtml(g.cover)}" alt="" loading="lazy">` : ''}</span><span class="hosting-tile-copy"><strong>${escapeHtml(g.title)}</strong><small>${g.editions?.length ? `Editions: ${g.editions.map(editionLabel).map(escapeHtml).join(', ')}` : 'Base game'}</small></span></button>`).join('');
  const picker = `<div class="hosting-picker">
      <label for="hosting-slots">Slots and monthly price</label>
      <p>One pool for every game you host. ${escapeHtml(promo.region)} · no setup fee.</p>
      ${packages.length ? `<select id="hosting-slots" class="input-text">${packages.map((p) => `<option value="${p.slots}">${p.slots} slots — ${promoMoney(p.priceCents)}/month</option>`).join('')}</select><p id="hosting-slots-note">${packages[0].slots} slots can run one server or be divided among several games. Stopped servers free their slots.</p>` : '<p>Packages will be announced soon.</p>'}
      ${promo.available && packages.length ? `<button type="button" class="btn-primary" id="hosting-checkout">Choose ${packages[0].slots} slots</button>` : '<p class="hosting-soon">Early access — coming soon</p>'}
      <p id="hosting-error" role="alert" class="hosting-error" hidden></p>
    </div>`;
  return `<div class="hosting-promo-page">
    <section class="hosting-hero"><div class="hosting-hero-art" aria-hidden="true">${heroCovers}<div class="hosting-hero-fade"></div></div>
      <div class="hosting-hero-copy"><p class="site-eyebrow">PlayBound Dedicated</p><h2>Your games deserve a place to play.</h2><p>Host the games your people love. Give one game the whole room, or split your plan across several. Switch whenever the night takes a different turn.</p>
      <div class="hosting-hero-actions"><button type="button" class="btn-primary" id="hosting-explore">Explore plans</button><button type="button" class="btn-secondary" data-web="/hosting/servers">Manage my servers</button></div></div></section>
    <section id="hosting-plans" class="hosting-section"><div><h2>Choose how you host</h2><p class="view-sub">Flexible slots for the games your group loves.</p></div>
      <article class="hosting-plan"><div class="hosting-plan-head"><span class="hosting-plan-icon">${SERVER_ICON}</span><h3>Basic</h3><p>Flexible game hosting for your group or community.</p><p class="hosting-plan-count">${promo.gameCount} ${promo.gameCount === 1 ? 'game' : 'games'} · ${promo.editionCount} additional editions</p></div>
        <ul class="hosting-features">${(promo.features || []).map((f) => `<li>${CHECK_ICON}${escapeHtml(f)}</li>`).join('')}</ul>
        ${picker}
        <div class="hosting-games"><h4>${promo.games?.length ? 'Popular games' : 'Games coming soon'}</h4>${tiles}</div>
        <button type="button" class="hosting-seeall" data-web="/hosting/basic">See all games and plan details →</button></article></section>
    <section class="hosting-section hosting-card"><div class="hosting-card-head"><div><h2>Where we host</h2><p class="view-sub">Available hosting regions appear on this map as they come online. Choose the region closest to your players when you subscribe.</p></div><button type="button" class="btn-link" data-web="/hosting/servers">Manage your servers →</button></div>${hostingMapSvg(promo)}</section>
    <section class="hosting-card hosting-support"><div><h2>Need a hand with your server?</h2><p class="view-sub">Open a support request in PlayBound or join the dedicated-server support room on Discord.</p></div><div class="hosting-hero-actions"><button type="button" class="btn-secondary" data-web="/hosting/servers">PlayBound support</button><button type="button" class="btn-primary" data-web="/api/hosting/support/discord">Discord support ↗</button></div></section>
  </div>`;
}

function wireHostingPromo(root, promo) {
  root.querySelectorAll('[data-web]').forEach((button) => button.addEventListener('click', () => openWeb(button.dataset.web)));
  root.querySelector('#hosting-explore')?.addEventListener('click', () => root.querySelector('#hosting-plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const select = root.querySelector('#hosting-slots');
  const checkout = root.querySelector('#hosting-checkout');
  const error = root.querySelector('#hosting-error');
  if (select) select.onchange = () => {
    const slots = Number(select.value);
    root.querySelector('#hosting-slots-note').textContent = `${slots} slots can run one server or be divided among several games. Stopped servers free their slots.`;
    if (checkout) checkout.textContent = `Choose ${slots} slots`;
    error.hidden = true;
  };
  if (checkout) checkout.onclick = () => action(checkout, async () => {
    error.hidden = true;
    try {
      const slots = Number(select.value);
      const key = `${promo.regionKey}:${slots}`;
      let checkoutKey = state.hostingCheckoutKeys?.[key];
      if (!checkoutKey) { checkoutKey = (crypto.randomUUID?.() || String(Date.now())).replaceAll('-', ''); (state.hostingCheckoutKeys ||= {})[key] = checkoutKey; }
      const data = await request('/api/hosting/checkout', 'POST', { regionKey: promo.regionKey, slots, checkoutKey });
      if (typeof data?.url !== 'string' || new URL(data.url).hostname !== 'checkout.stripe.com') throw new Error('Checkout returned an invalid destination');
      window.playbound.openExternal(data.url);
    } catch (err) {
      const message = err.message === 'SOLD_OUT' ? 'No hosting capacity is available in this region right now. Please try again later.' : err.message;
      error.textContent = message; error.hidden = false;
    }
  });
}

async function renderMyServersView() {
  const host = heading(views.myServers, 'My servers', 'Your saved worlds, players, maps, and server controls.');
  if (!state.accountState?.connected) return signIn(host);
  try {
    const data = await request('/api/hosting/me');
    // Same rule as the website's My Servers page: only an active or past-due plan gets the dashboard.
    // A canceled, expired or missing plan gets the hosting promo, with any servers shared with you below it.
    const runnable = ['active', 'past_due'].includes(data.subscription?.status);
    if (!runnable) {
      const promo = await window.playbound.getHostingPromo?.();
      if (promo && Array.isArray(promo.packages)) {
        host.innerHTML = `${hostingPromoHtml(promo)}<div class="workspace-server-grid"></div>`;
        wireHostingPromo(host, promo);
      } else {
        host.innerHTML = `<section class="site-panel site-pad"><p class="site-eyebrow">PlayBound Dedicated</p><h2>Your games deserve a place to play.</h2><p>Host the games your people love. Give one game the whole room, or split your plan across several.</p><button class="btn-primary" id="hosting-fallback">See hosting plans →</button></section><div class="workspace-server-grid"></div>`;
        host.querySelector('#hosting-fallback').onclick = () => openWeb('/hosting');
      }
    } else {
      host.innerHTML = `<section class="site-panel site-pad"><h2>${escapeHtml(data.subscription?.tierName || 'PlayBound Dedicated')}</h2><p>${`${data.subscription.slotCapacity} player slots · ${escapeHtml(data.subscription.regionLabel)}`}</p></section><div class="workspace-server-grid"></div>`;
    }
    const grid = host.querySelector('.workspace-server-grid');
    for (const server of runnable ? [...(data.servers || []), ...(data.shared || [])] : (data.shared || [])) {
      const card = document.createElement('section'); card.className = 'site-panel site-pad';
      card.innerHTML = `<h2>${escapeHtml(server.name)}</h2><p>${escapeHtml(server.gameTitle)}${server.editionSlug ? ` · ${escapeHtml(server.editionSlug)}` : ''}</p><p>${escapeHtml(server.runtimeState)} · ${server.players ?? 'Unknown'} players / ${server.slots}</p><button class="btn-primary">Manage server</button>`;
      card.querySelector('button').onclick = () => renderServer(server.id); grid.append(card);
    }
    if (!grid.children.length && runnable) grid.innerHTML = '<p class="view-sub">No saved servers yet.</p>';
    if (runnable && data.games?.length) {
      const form = document.createElement('form'); form.className = 'site-panel site-pad workspace-form';
      const games = [...data.games].sort((a,b) => `${a.gameTitle} ${a.editionTitle || ''}`.localeCompare(`${b.gameTitle} ${b.editionTitle || ''}`));
      form.innerHTML = `<h2>Create a saved server</h2>${input('Server name','name')}<label class="workspace-field">Game & edition<select class="input-text" name="profileKey">${games.filter(game => !game.blocked && game.sizes?.length).map(game => `<option value="${escapeHtml(game.profileKey)}">${escapeHtml(game.gameTitle)}${game.editionTitle ? ` · ${escapeHtml(game.editionTitle)}` : ''}</option>`).join('')}</select></label><label class="workspace-field">Player count<select name="slots" class="input-text"></select></label><button class="btn-primary">Save server</button>`;
      const sync = () => { const game = games.find(game => game.profileKey === form.elements.profileKey.value); form.elements.slots.innerHTML = (game?.sizes || []).filter(size => size >= 2).map(size => `<option>${size}</option>`).join(''); };
      form.elements.profileKey.onchange = sync; sync();
      form.onsubmit = event => { event.preventDefault(); void action(form.querySelector('button'), async () => { await request('/api/hosting/servers','POST',{name:form.elements.name.value,profileKey:form.elements.profileKey.value,slots:Number(form.elements.slots.value)}); await renderMyServersView(); }); };
      host.append(form);
    }
  } catch(error) { failure(host,error,renderMyServersView); }
}

async function renderServer(id) {
  const host = heading(views.myServers, 'Server management', 'Your server, players, maps, and saved worlds in one place.');
  try {
    await renderServerManager(host, id, {request, escapeHtml, back: renderMyServersView});
  } catch(error) { failure(host,error,() => renderServer(id)); }
}

const devIcon = (paths) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const DEV_ICONS = {
  shield: devIcon('<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"/><path d="m9 12 2 2 4-4"/>'),
  games: devIcon('<line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="2"/>'),
  studio: devIcon('<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>'),
  spark: devIcon('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>'),
  edit: devIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  link: devIcon('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
};
const openWeb = (route) => window.playbound.openExternal(`https://playbound.club${route}`);

/*
 * Same layout as the website's Developer Dashboard: the editorial-standard
 * notice, the claim and submit actions, three stat tiles, a grid of game cards
 * with cover art and status, and the studio profile list. Editing still happens
 * here in the launcher, inline under the card you pick.
 */
async function renderDeveloperView() {
  const host = heading(views.developer, 'Developer Dashboard', 'Manage your games and studio identity on PlayBound.');
  if (!state.accountState?.connected) return signIn(host);
  try {
    const [games, profiles] = await Promise.all([request('/api/developer/games'), request('/api/developer/profile')]);
    const gameList = games.games || [];
    const studios = profiles.developers || [];
    const role = String(state.accountState?.role || 'user');
    host.innerHTML = `<div class="dev-dashboard">
      <div class="dev-notice">${DEV_ICONS.shield}<div><h2>PlayBound Editorial Standard &amp; Developer Ownership</h2><p>You own your game’s presentation — descriptions, trailers, screenshots, system requirements, and installation links. PlayBound’s Quality Bar assessments, editorial reviews, and staff highlights are independently authored and maintained by our editorial staff to preserve reader trust and neutrality.</p></div></div>
      <div class="dev-header"><div class="dev-actions"><button class="btn-secondary btn-sm" data-dev-web="/developer/claim">Claim Another Game</button><button class="btn-primary btn-sm" data-dev-web="/submit-game">Submit New Game</button></div></div>
      <div class="dev-stats">
        <div class="dev-stat"><span class="dev-stat-label">${DEV_ICONS.games}Games Managed</span><strong>${gameList.length}</strong></div>
        <div class="dev-stat"><span class="dev-stat-label">${DEV_ICONS.studio}Studios Linked</span><strong>${studios.length}</strong></div>
        <div class="dev-stat"><span class="dev-stat-label">${DEV_ICONS.spark}Account Role</span><strong style="font-size:16px;text-transform:capitalize">${escapeHtml(role)}</strong></div>
      </div>
      <section class="dev-section"><h2>Your Games</h2><div id="dev-games"></div></section>
      <section class="dev-section"><h2>Your Studio Profiles</h2><div id="dev-studios"></div></section>
    </div>`;
    host.querySelectorAll('[data-dev-web]').forEach((button) => button.addEventListener('click', () => openWeb(button.dataset.devWeb)));

    const gamesHost = host.querySelector('#dev-games');
    if (!gameList.length) {
      gamesHost.innerHTML = `<div class="dev-empty">${DEV_ICONS.games}<h3>No games linked yet</h3><p>If your game is already listed on PlayBound, claim ownership to start managing its page, screenshots, and download links.</p><button class="btn-primary btn-sm">Claim an Existing Game</button></div>`;
      gamesHost.querySelector('button').onclick = () => openWeb('/developer/claim');
    } else {
      const grid = document.createElement('div'); grid.className = 'dev-game-grid'; gamesHost.append(grid);
      for (const game of gameList) {
        const card = document.createElement('div'); card.className = 'dev-game-card';
        card.innerHTML = `<div class="dev-game-art">${game.coverImage ? `<img src="${escapeHtml(game.coverImage)}" alt="" loading="lazy">` : '<span>No cover image</span>'}<span class="dev-status">${escapeHtml(String(game.status || 'published'))}</span></div>
          <div class="dev-game-body"><h3>${escapeHtml(game.title)}</h3><p>${escapeHtml(game.tagline || 'No tagline set')}</p>
          <div class="dev-game-actions"><button class="btn-primary btn-sm dev-edit">${DEV_ICONS.edit}Edit Page</button><button class="btn-secondary btn-sm dev-view" title="View Public Page">${DEV_ICONS.link}</button></div></div>`;
        card.querySelector('.dev-view').onclick = () => openWeb(`/games/${game.slug}`);
        const editButton = card.querySelector('.dev-edit');
        editButton.onclick = () => action(editButton, async () => {
          if (card.querySelector('form')) { card.querySelector('form').remove(); return; }
          const {game: full} = await request(`/api/developer/games/${game.slug}`);
          const form = document.createElement('form'); form.className = 'workspace-form dev-inline-form';
          form.innerHTML = `${input('Tagline','tagline',full.tagline)}<label class="workspace-field">Description<textarea name="description" class="input-text"></textarea></label>${input('Website','website',full.website,'url')}<button class="btn-primary">Save game</button>`;
          form.elements.description.value = full.description || '';
          form.onsubmit = (event) => { event.preventDefault(); void action(form.querySelector('button'), async () => { await request(`/api/developer/games/${game.slug}`,'PATCH',{...full,tagline:form.elements.tagline.value,description:form.elements.description.value,website:form.elements.website.value}); setStatus('Game saved.'); await renderDeveloperView(); }); };
          card.append(form);
        });
        grid.append(card);
      }
    }

    const studiosHost = host.querySelector('#dev-studios');
    if (!studios.length) {
      studiosHost.innerHTML = `<div class="dev-empty dev-empty-small">${DEV_ICONS.studio}<p>No developer studio profile is linked to your account yet. Claim your studio profile to manage your bio, website, and team links.</p><button class="btn-secondary btn-sm">Claim Studio Profile →</button></div>`;
      studiosHost.querySelector('button').onclick = () => openWeb('/developer/claim');
    } else {
      const list = document.createElement('div'); list.className = 'dev-studio-list'; studiosHost.append(list);
      for (const profile of studios) {
        const row = document.createElement('div'); row.className = 'dev-studio';
        row.innerHTML = `<div class="dev-studio-head"><div><h3>${escapeHtml(profile.name)}</h3><p>${escapeHtml(profile.tagline || profile.location || 'Studio profile')}</p></div><div class="dev-game-actions"><button class="btn-secondary btn-sm dev-edit">${DEV_ICONS.edit}Edit Studio</button><button class="btn-secondary btn-sm dev-view" title="View Studio on Site">${DEV_ICONS.link}</button></div></div>`;
        row.querySelector('.dev-view').onclick = () => openWeb(`/developers/${profile.slug}`);
        row.querySelector('.dev-edit').onclick = () => {
          const open = row.querySelector('form'); if (open) { open.remove(); return; }
          const form = document.createElement('form'); form.className = 'workspace-form dev-inline-form';
          form.innerHTML = `${input('Studio name','name',profile.name)}${input('Tagline','tagline',profile.tagline)}${input('Website','website',profile.website,'url')}<label class="workspace-field">About<textarea name="about" class="input-text"></textarea></label><button class="btn-primary">Save studio</button>`;
          form.elements.about.value = profile.about || '';
          form.onsubmit = (event) => { event.preventDefault(); void action(form.querySelector('button'), async () => { await request('/api/developer/profile','PATCH',{...profile,name:form.elements.name.value,tagline:form.elements.tagline.value,website:form.elements.website.value,about:form.elements.about.value}); setStatus('Studio saved.'); await renderDeveloperView(); }); };
          row.append(form);
        };
        list.append(row);
      }
    }
  } catch(error) { failure(host,error,renderDeveloperView); }
}
api.renderMyServersView = renderMyServersView;
api.renderDeveloperView = renderDeveloperView;
