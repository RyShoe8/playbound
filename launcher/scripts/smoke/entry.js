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
const account = process.env.PLAYBOUND_SMOKE_SIGNED_OUT === '1' ? {connected:false} : { connected: true, userId: 'smoke-user', username: 'Smoke User' };
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
let dealsRequests = 0;
let homeRequests = 0;
const handlers = {
  'workspace-request': (_event,input) => input.path === '/api/hosting/me' ? {subscription:null,servers:[],shared:[]} : input.path === '/api/developer/games' ? {games:[]} : {developers:[]},
  'get-deals': () => process.env.PLAYBOUND_SMOKE_SIGNED_OUT === '1' && dealsRequests++ === 0 ? {ok:false,freeOffers:[],discounted:[]} : ({ok:true,freeOffers:[],discounted:[{title:'Fixture Deal',genres:['Strategy'],storeKey:'steam',storeName:'Steam',currentPriceCents:100,regularPriceCents:1000,discountPercent:90}]}),
  'get-server-index': () => ({ games: [{...fixture,supported:true}] }),
  'get-community-servers': () => ({servers:[{name:'A community server with a deliberately long name for compact windows',gameSlug:fixture.slug,gameTitle:fixture.title,host:'2001:db8:1234:5678:abcd:1234:5678:abcd',port:1234,players:8,maxPlayers:16,bots:4,map:'A_very_long_map_name_that_must_stay_inside_the_server_browser',location:'United States'}]}),
  'get-servers': () => ({supported:true,servers:[{name:'Fixture Server',gameSlug:fixture.slug,host:'127.0.0.1',port:1234,players:2,maxPlayers:16,map:'Fixture Map',location:'United States'}]}),
  'ping-hosts': () => ({}),
  'get-lfg': () => ({ users: [] }),
  'get-live-stats': () => ({ ok: false }),
  'get-free-offers': () => ({ offers: [] }),
  'get-events': () => ({events:[{id:'smoke-event',title:'Fixture Game Night',gameSlug:'smoke-fixture',eventType:'game_night',status:'scheduled',startsAt:'2030-01-01T20:00:00Z',endsAt:'2030-01-01T22:00:00Z',description:'Bring your friends for a relaxed evening of multiplayer.',maxParticipants:8,counts:{going:2},coverImage:process.env.PLAYBOUND_SMOKE_SIGNED_OUT === '1' ? null : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect width="400" height="300" fill="%23123456"/%3E%3C/svg%3E'}]}),
  'get-mods-catalog': () => ({mods:[]}),
  'get-multiplayer-activity': () => ({summary:{totalServerPlayers:0,totalOpenParties:0,totalUsersLooking:0,totalServersOnline:0},games:[]}),
  'get-controller-support': () => ({ supported: false }),
  'get-recently-played': () => [],
  'get-catalog': () => [detail()],
  'get-home-feed': () => process.env.PLAYBOUND_SMOKE_SIGNED_OUT === '1' && homeRequests++ === 0 ? null : ({released:['smoke-fixture'],popular:['smoke-fixture'],editions:[{gameSlug:'smoke-fixture',edition:{slug:'fixture-edition',name:'Fixture Edition'}}],mods:[{slug:'fixture-mod',title:'Fixture Mod',baseGameSlug:'smoke-fixture'}]}),
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
if (process.env.PLAYBOUND_SMOKE_HOSTING) handlers['workspace-request'] = require('./hosting-fixture').createHostingFixture(root);
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, listener) => handle(name, name === 'get-bootstrap-state'
  ? async (...args) => ({ ...await listener(...args), catalog: [detail()], account, recent: [] })
  : handlers[name] || listener);
require('../../bootstrap');
