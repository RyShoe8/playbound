import { api, state, refreshAccountStatus } from './shared.js';

export function mountSiteShell() {
  const sidebar = document.getElementById('sidebar');
  const nav = sidebar.querySelector('.sidebar-nav');
  const gamesGroup = nav.querySelector('.nav-group');
  const mods = document.getElementById('nav-mods');
  mods.classList.remove('sub-nav-btn'); gamesGroup.after(mods);
  const library = nav.querySelector('[data-view="library"]');
  library.after(nav.querySelector('[data-view="deals"]'));
  const feedback = document.getElementById('sidebar-feedback');
  feedback.lastChild.textContent = 'Feedback'; nav.append(feedback);
  const workspace = document.createElement('div'); workspace.className = 'site-workspace';
  workspace.innerHTML = '<p class="site-workspace-label">Your workspace</p><button class="nav-btn" id="site-my-servers"><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/></svg><span>My servers</span></button><button class="nav-btn" id="site-developer"><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg><span>Developer tools</span></button>';
  sidebar.querySelector('.sidebar-scroll').append(workspace);
  workspace.querySelector('#site-my-servers').dataset.view = 'myServers';
  workspace.querySelector('#site-developer').dataset.view = 'developer';
  workspace.append(nav.querySelector('[data-view="couch"]'));
  const preferences = document.createElement('details'); preferences.className = 'site-preferences'; preferences.innerHTML = '<summary>Discovery & compatibility</summary>';
  preferences.append(document.getElementById('sidebar-discovery'), document.getElementById('sidebar-compat'));
  workspace.after(preferences);
  const discord = document.getElementById('sidebar-discord'); discord.lastChild.textContent = 'Join Discord ↗'; preferences.after(discord);
  const account = document.createElement('button'); account.id = 'site-account'; account.className = 'site-account'; account.type = 'button';
  account.innerHTML = '<span id="site-account-avatar" class="site-avatar">PB</span><span class="site-account-copy"><span id="site-account-name">Sign in to PlayBound</span><small id="site-account-description">Your account</small></span>';
  const footer = sidebar.querySelector('.sidebar-footer');
  const menu = document.createElement('details'); menu.className = 'site-account-menu';
  menu.innerHTML = '<summary aria-label="Account menu">•••</summary><div></div>';
  const settings = footer.querySelector('[data-view="settings"]');
  menu.querySelector('div').append(settings, footer.querySelector('.sidebar-status'));
  const signOut = document.createElement('button'); signOut.className = 'nav-btn'; signOut.textContent = 'Sign out'; signOut.id = 'site-signout';
  signOut.addEventListener('click', async () => { signOut.disabled = true; try { await window.playbound.clearLauncherToken(); await refreshAccountStatus(); menu.open = false; api.paintHomeGrids?.(); } finally { signOut.disabled = false; } });
  menu.querySelector('div').append(signOut);
  footer.append(account, menu);
  account.addEventListener('click', () => state.accountState?.connected ? api.navigateTo?.('settings') : window.playbound.signIn());
  sidebar.querySelector('.site-wordmark').addEventListener('click', () => api.navigateTo?.('home'));
}
