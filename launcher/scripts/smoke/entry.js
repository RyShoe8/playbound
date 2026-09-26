// Test-only entry: the real bootstrap, main process and preload run unchanged.
// This directory is excluded from packaged applications.
const { app, dialog, ipcMain, session, shell, globalShortcut } = require('electron');
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
// Install is simulated (no download), but it leaves a real game on disk and a
// real record in installed.json, so Uninstall runs the launcher's own removal
// code against it.
const stateFile = path.join(root, 'installed.json');
const gameDir = path.join(root, 'games', fixture.slug);
const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; } };
const installed = () => Boolean(readState()[fixture.slug]);
const detail = () => ({ ...fixture, installed: installed(), installedPath: installed() ? gameDir : null });
// The real uninstall asks for confirmation; answer "Uninstall" for that dialog only.
dialog.showMessageBox = async (...args) => {
  const opts = args.find(a => a && typeof a === 'object' && 'buttons' in a) || {};
  return { response: opts.title === 'Uninstall game' ? 0 : (opts.cancelId ?? 1) };
};
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
  'get-installed': () => installed() ? [detail()] : [],
  'install': (_event, slug) => {
    if (slug !== fixture.slug) throw new Error('Only fixture installation is allowed');
    const exe = path.join(gameDir, 'SmokeFixture.exe');
    fs.mkdirSync(path.join(gameDir, 'data'), { recursive: true });
    fs.writeFileSync(exe, 'smoke-fixture');
    fs.writeFileSync(path.join(gameDir, 'data', 'level.dat'), 'level');
    fs.writeFileSync(stateFile, JSON.stringify({
      [slug]: { editions: { official: { version: '1.0', exe, dir: gameDir, editionSlug: 'official', installedAt: new Date().toISOString() } } },
    }));
    return { status: 'installed', exe, dir: gameDir };
  },
  // No 'uninstall' entry: the real handler in main.js runs.
};
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, listener) => handle(name, name === 'get-bootstrap-state'
  ? async (...args) => ({ ...await listener(...args), catalog: [detail()], account, recent: [] })
  : handlers[name] || listener);
require('../../bootstrap');
