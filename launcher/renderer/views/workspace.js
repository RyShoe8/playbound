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

async function renderMyServersView() {
  const host = heading(views.myServers, 'My servers', 'Your saved worlds, players, maps, and server controls.');
  if (!state.accountState?.connected) return signIn(host);
  try {
    const data = await request('/api/hosting/me');
    host.innerHTML = `<section class="site-panel site-pad"><h2>${escapeHtml(data.subscription?.tierName || 'PlayBound Dedicated')}</h2><p>${data.subscription ? `${data.subscription.slotCapacity} player slots · ${escapeHtml(data.subscription.regionLabel)}` : 'No hosting plan is linked to your account. Shared servers are listed below.'}</p></section><div class="workspace-server-grid"></div>`;
    const grid = host.querySelector('.workspace-server-grid');
    for (const server of [...(data.servers || []), ...(data.shared || [])]) {
      const card = document.createElement('section'); card.className = 'site-panel site-pad';
      card.innerHTML = `<h2>${escapeHtml(server.name)}</h2><p>${escapeHtml(server.gameTitle)}${server.editionSlug ? ` · ${escapeHtml(server.editionSlug)}` : ''}</p><p>${escapeHtml(server.runtimeState)} · ${server.players ?? 'Unknown'} players / ${server.slots}</p><button class="btn-primary">Manage server</button>`;
      card.querySelector('button').onclick = () => renderServer(server.id); grid.append(card);
    }
    if (!grid.children.length) grid.innerHTML = '<p class="view-sub">No saved servers yet.</p>';
    if (data.subscription && data.games?.length) {
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

async function renderDeveloperView() {
  const host = heading(views.developer,'Developer tools','Manage your games and studio profile from PlayBound.');
  if (!state.accountState?.connected) return signIn(host);
  try {
    const [games,profiles] = await Promise.all([request('/api/developer/games'),request('/api/developer/profile')]);
    host.innerHTML = '<section class="site-panel site-pad"><h2>Built for more ways to play</h2><p>PlayBound’s virtual LAN and streaming systems bring local co-op online. Expanded controller support includes console and USB controllers, plus your phone as a controller.</p></section><div class="workspace-server-grid"></div>';
    const grid = host.querySelector('.workspace-server-grid');
    for (const game of games.games || []) {
      const card = document.createElement('section'); card.className = 'site-panel site-pad';
      card.innerHTML = `<h2>${escapeHtml(game.title)}</h2><p>${escapeHtml(game.tagline || '')}</p><button class="btn-primary">Edit game</button>`;
      card.querySelector('button').onclick = () => action(card.querySelector('button'), async () => {
        const {game:full} = await request(`/api/developer/games/${game.slug}`);
        const form = document.createElement('form'); form.className = 'workspace-form';
        form.innerHTML = `${input('Tagline','tagline',full.tagline)}<label class="workspace-field">Description<textarea name="description" class="input-text"></textarea></label>${input('Website','website',full.website,'url')}<button class="btn-primary">Save game</button>`;
        form.elements.description.value = full.description || '';
        form.onsubmit = event => { event.preventDefault(); void action(form.querySelector('button'),async () => { await request(`/api/developer/games/${game.slug}`,'PATCH',{...full,tagline:form.elements.tagline.value,description:form.elements.description.value,website:form.elements.website.value}); setStatus('Game saved.'); await renderDeveloperView(); }); }; card.append(form);
      }); grid.append(card);
    }
    for (const profile of profiles.developers || []) {
      const form = document.createElement('form'); form.className = 'site-panel site-pad workspace-form';
      form.innerHTML = `<h2>Studio profile</h2>${input('Studio name','name',profile.name)}${input('Tagline','tagline',profile.tagline)}${input('Website','website',profile.website,'url')}<label class="workspace-field">About<textarea name="about" class="input-text"></textarea></label><button class="btn-primary">Save studio</button>`;
      form.elements.about.value = profile.about || '';
      form.onsubmit = event => { event.preventDefault(); void action(form.querySelector('button'),async () => { await request('/api/developer/profile','PATCH',{...profile,name:form.elements.name.value,tagline:form.elements.tagline.value,website:form.elements.website.value,about:form.elements.about.value}); setStatus('Studio saved.'); }); }; host.append(form);
    }
    if (!(games.games || []).length && !(profiles.developers || []).length) grid.innerHTML = '<section class="site-panel site-pad"><h2>Your developer workspace</h2><p>Once your game or studio ownership is approved, its management tools appear here.</p></section>';
  } catch(error) { failure(host,error,renderDeveloperView); }
}
api.renderMyServersView = renderMyServersView;
api.renderDeveloperView = renderDeveloperView;
