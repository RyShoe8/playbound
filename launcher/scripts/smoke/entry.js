// Test-only entry: the real bootstrap, main process and preload run unchanged.
// This directory is excluded from packaged applications.
const { app, ipcMain, session, shell, globalShortcut } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.PLAYBOUND_SMOKE_ROOT;
if (!root || !path.isAbsolute(root) || app.isPackaged) throw new Error('Isolated smoke profile required');
app.setPath('userData', root);
app.setPath('sessionData', path.join(root, 'session'));
app.setAppPath(path.join(__dirname, '../..'));
app.setAsDefaultProtocolClient = () => false;
app.setLoginItemSettings = () => {};
globalShortcut.register = () => false;
const recordError = error => fs.appendFileSync(path.join(root, 'runtime-errors.log'), String(error?.stack || error) + '\n');
process.on('uncaughtExceptionMonitor', recordError);
process.on('unhandledRejection', recordError);
app.on('web-contents-created', (_event, contents) => {
  contents.on('preload-error', (_event, _preload, error) => recordError(error));
  contents.on('render-process-gone', (_event, details) => recordError(JSON.stringify(details)));
});
shell.openExternal = async () => { throw new Error('External navigation disabled in smoke test'); };
fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ gamesDir: path.join(root, 'games'), apiBase: 'http://localhost:1' }));
// No credentials or live API requests: background refreshes receive empty data.
global.fetch = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, done) => done({ cancel: true }));
});
const fixture = {
  slug: 'smoke-fixture', title: 'Smoke Fixture Game', summary: 'Offline launcher smoke fixture',
  description: 'Offline launcher smoke fixture', genres: ['Action'], platforms: ['windows', 'linux', 'macos'],
  art: ['#123456', '#654321'], standalone: true, multiplayer: true, features: ['Controller Support'],
  installType: 'zip', downloadUrl: 'http://localhost:1/fixture.zip',
};
const account = { connected: true, userId: 'smoke-user', username: 'Smoke User' };
const marker = path.join(root, 'mock-installed.txt');
const detail = () => ({ ...fixture, installed: fs.existsSync(marker), installedPath: root });
const handlers = {
  'get-server-index': () => ({ games: [] }),
  'get-lfg': () => ({ users: [] }),
  'get-live-stats': () => ({ ok: false }),
  'get-free-offers': () => ({ offers: [] }),
  'get-controller-support': () => ({ supported: false }),
  'get-recently-played': () => [],
  'get-catalog': () => [detail()],
  'get-game-detail': () => detail(),
  'get-editions': () => ({ editions: [] }),
  'get-account': () => account,
  'get-friends': () => ({ friends: [] }),
  'get-friend-requests': () => ({ incoming: [], outgoing: [] }),
  'get-parties': () => ({ myParties: [], discoverable: [] }),
  'get-party-sync': () => ({ friends: [], incoming: [], outgoing: [], myParties: [], discoverable: [] }),
  'get-installed': () => fs.existsSync(marker) ? [detail()] : [],
  'install': (_event, slug) => {
    if (slug !== fixture.slug) throw new Error('Only fixture installation is allowed');
    fs.writeFileSync(marker, slug);
    return { status: 'installed' };
  },
  'uninstall': (_event, slug) => {
    if (slug !== fixture.slug) throw new Error('Only fixture removal is allowed');
    fs.unlinkSync(marker);
    return { status: 'uninstalled' };
  },
};
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, listener) => handle(name, name === 'get-bootstrap-state'
  ? async (...args) => ({ ...await listener(...args), catalog: [detail()], account, recent: [] })
  : handlers[name] || listener);
require('../../bootstrap');
