import { createFreeOfferCard, createGameCard, createModCard } from './cards.js';
import { api, CACHE_TTL, cacheInvoke, cacheInvalidate, escapeHtml, filterCatalogGames, markViewReady, state, views } from './shared.js';
import { diversifyOffers, homepageSelections } from './siteLayout.js';

const section = (id, title, view) => `<section><div class="section-header"><h2>${title}</h2><button class="site-text-link" data-home-view="${view}">See all →</button></div><div class="game-grid" id="${id}-grid"></div></section>`;
let generation = 0;
function ensureHomeShell() {
  if (views.home.querySelector('.site-home-layout')) return;
  views.home.innerHTML = `<div class="site-page-heading"><p class="site-eyebrow">Discover. Play. Connect.</p><h1 class="view-title">Find your next good game.</h1><p class="view-sub">Great games. Good company. One place to play.</p></div>
    <div class="site-home-layout"><div class="site-main-stack">
    <section id="home-feature" class="site-home-feature" aria-label="Latest released game">Loading your next game…</section>
    ${section('home-popular', 'Most Popular this week', 'games')}
    <section><div class="section-header"><h2>Next game night</h2><button class="site-text-link" data-home-view="events">Full schedule →</button></div><div id="home-next-night" class="site-panel site-pad"></div></section>
    ${section('home-free', 'Free games this week', 'deals')}
    ${section('home-editions', 'Newest Editions', 'games')}
    ${section('home-mods', 'Newest Mods', 'mods')}
    </div><aside class="site-home-rail">
    <section class="site-panel site-pad"><div class="section-header"><h2>Your people</h2><button class="site-text-link" data-home-view="friends">Friends →</button></div><div id="home-people"></div></section>
    <section class="site-panel site-pad"><h2>Discover more</h2><nav class="site-rail-links"><button data-home-web="/collections">Curated collections →</button><button data-home-view="deals">Free games & deals →</button><button data-home-web="/weekly">Weekly newsletter →</button><button data-home-view="multiplayer">Community servers →</button></nav></section>
    <section class="site-panel site-pad"><p class="site-eyebrow">Your desktop companion</p><h2>Game helper</h2><p>Server management, controls, and your phone controller—together while you play.</p><p><kbd>Ctrl / ⌘ + P</kbd> opens your game helper.</p><button class="btn-secondary" data-home-view="couch">Controller setup</button></section>
    </aside></div>`;
  views.home.querySelectorAll('[data-home-view]').forEach(button => button.addEventListener('click', () => api.navigateTo?.(button.dataset.homeView)));
  views.home.querySelectorAll('[data-home-web]').forEach(button => button.addEventListener('click', () => window.playbound.openExternal(`https://playbound.club${button.dataset.homeWeb}`)));
}
function paintFeature(game) {
  const host = document.getElementById('home-feature'); host.replaceChildren();
  if (!game) { host.innerHTML = '<h2>Find your next game</h2><p>Explore the Games tab to discover something new.</p>'; return; }
  if (game.coverImage) { const image = document.createElement('img'); image.src = game.coverImage; image.alt = ''; image.className = 'site-feature-art'; host.append(image); }
  const copy = document.createElement('div'); copy.className = 'site-feature-copy';
  copy.innerHTML = `<p class="site-eyebrow">Latest release</p><h2>${escapeHtml(game.title)}</h2><p>${escapeHtml(game.tagline || game.blurb || game.description || '')}</p><button class="btn-primary">Explore game →</button>`;
  copy.querySelector('button').addEventListener('click', () => api.openGameDetail?.(game.slug, 'home')); host.append(copy);
}
function paintNight(events) {
  const night = events.find(event => event.eventType === 'game_night' && !['cancelled', 'completed'].includes(event.status));
  const host = document.getElementById('home-next-night');
  if (!night) {
    host.innerHTML = '<h3>Make the next game night happen</h3><p>Gather your friends around a game you love.</p><button class="btn-primary">Create event</button>';
    host.querySelector('button').addEventListener('click', () => window.playbound.openExternal('https://playbound.club/events/create')); return;
  }
  host.innerHTML = `${night.coverImage ? `<img class="site-night-cover" src="${escapeHtml(night.coverImage)}" alt="" loading="lazy">` : ''}<div><p class="site-eyebrow">Game Night</p><h3>${escapeHtml(night.title)}</h3><p>${escapeHtml(new Date(night.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</p><p>${Number(night.counts?.going || 0)} going</p><button class="btn-primary">View event →</button></div>`;
  host.querySelector('button').addEventListener('click', () => api.openEventDetail?.(night.id, 'home'));
}
function paintPeople(result) {
  const host = document.getElementById('home-people');
  if (!state.accountState?.connected) { host.innerHTML = '<p>See what your friends are playing and pick up your party here.</p><button class="btn-primary">Sign in</button>'; host.querySelector('button').addEventListener('click', () => window.playbound.signIn()); return; }
  const friends = Array.isArray(result) ? result : result?.friends || [];
  const online = friends.filter(friend => friend.presence?.online || friend.online).slice(0, 6); host.replaceChildren();
  if (!online.length) { host.innerHTML = '<p>Your friends will appear here when they’re online.</p><button class="btn-secondary">Find friends</button>'; host.querySelector('button').addEventListener('click', () => api.navigateTo?.('friends')); return; }
  for (const friend of online) {
    const button = document.createElement('button'); button.className = 'site-person';
    button.innerHTML = `<span class="site-avatar">${escapeHtml((friend.username || friend.name || '?').slice(0, 2).toUpperCase())}</span><span>${escapeHtml(friend.username || friend.name || 'Friend')}<small>${escapeHtml(friend.presence?.gameTitle || friend.presence?.gameSlug || 'Online')}</small></span>`;
    button.addEventListener('click', () => api.navigateTo?.('friends')); host.append(button);
  }
}
async function loadHome() {
  const current = ++generation;
  const catalogRequest = cacheInvoke('catalog', 60000, () => window.playbound.getCatalog());
  // Paint native catalog immediately; slower editorial/network sections fill in later.
  void catalogRequest.then(raw => {
    if (current !== generation || !views.home.querySelector('.site-home-layout')) return;
    const catalog = filterCatalogGames(Array.isArray(raw) ? raw : raw?.games || []);
    const selected = homepageSelections(catalog, null);
    paintFeature(selected.released[0]);
    document.getElementById('home-popular-grid').replaceChildren(...selected.popular.map(game => createGameCard(game)));
  }).catch(() => {});
  const results = await Promise.allSettled([
    catalogRequest,
    cacheInvoke('siteHome', 300000, async () => {
      const feed = await window.playbound.getHomeFeed?.();
      if (!feed || !Array.isArray(feed.released)) throw new Error('Homepage feed unavailable');
      return feed;
    }),
    cacheInvoke('events', CACHE_TTL.events, () => window.playbound.getEvents?.()),
    cacheInvoke('freeOffers', CACHE_TTL.freeOffers, () => window.playbound.getFreeOffers?.()),
    window.playbound.getFriends?.(),
  ]);
  if (current !== generation || !views.home.querySelector('.site-home-layout')) return;
  const value = (index, fallback) => results[index].status === 'fulfilled' ? results[index].value ?? fallback : fallback;
  const raw = value(0, {}); const catalog = filterCatalogGames(Array.isArray(raw) ? raw : raw.games || []);
  const feed = value(1, null);
  if (!feed) cacheInvalidate('siteHome');
  const selected = homepageSelections(catalog, feed);
  paintFeature(selected.released[0]);
  document.querySelector('#home-popular-grid').previousElementSibling.querySelector('h2').textContent = feed ? 'Most Popular this week' : 'Discover games';
  const paint = (id, cards) => { const grid = document.getElementById(`${id}-grid`); grid.replaceChildren(...cards); if (!cards.length) { const message = document.createElement('p'); message.className = 'view-sub'; message.textContent = !feed && ['home-mods', 'home-editions'].includes(id) ? 'Could not load this section.' : 'Nothing available right now. Check back soon.'; grid.append(message);
    if (!feed && ['home-mods', 'home-editions'].includes(id)) {
      const retry = document.createElement('button'); retry.className = 'btn-secondary btn-sm'; retry.textContent = 'Try again';
      retry.addEventListener('click', () => { cacheInvalidate('siteHome'); void loadHome(); }); grid.append(retry);
    } } };
  paint('home-popular', selected.popular.map(game => createGameCard(game)));
  paintNight(value(2, {}).events || []);
  paint('home-free', diversifyOffers(value(3, {}).offers || [], 8).map(createFreeOfferCard));
  paint('home-mods', selected.mods.map(createModCard));
  paint('home-editions', selected.editions.map(({game, edition}) => {
    const card = createGameCard({...game, title: edition.name || game.title, coverImage: edition.coverImage || game.coverImage, editions: []});
    card.addEventListener('click', event => { event.stopImmediatePropagation(); api.openEditionDetail?.(game.slug, edition.slug); }, { capture: true }); return card;
  }));
  paintPeople(value(4, {})); markViewReady(views.home);
}
export function paintHomeGrids() { if (views.home?.querySelector('.site-home-layout')) void loadHome(); }
export async function renderHomeView() { ensureHomeShell(); await loadHome(); }
api.renderHomeView = renderHomeView;
api.paintHomeGrids = paintHomeGrids;
