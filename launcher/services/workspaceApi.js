const ROUTES = [
  ['GET', /^\/api\/hosting\/me$/],
  ['POST', /^\/api\/hosting\/servers$/],
  ['GET|PATCH|DELETE', /^\/api\/hosting\/servers\/[a-f0-9]{24}$/],
  ['POST', /^\/api\/hosting\/servers\/[a-f0-9]{24}\/action$/],
  ['GET|POST', /^\/api\/hosting\/servers\/[a-f0-9]{24}\/maps$/],
  ['PATCH', /^\/api\/hosting\/servers\/[a-f0-9]{24}\/settings$/],
  ['GET|POST', /^\/api\/hosting\/servers\/[a-f0-9]{24}\/players$/],
  ['GET|POST|DELETE', /^\/api\/hosting\/servers\/[a-f0-9]{24}\/bans$/],
  ['POST', /^\/api\/hosting\/servers\/[a-f0-9]{24}\/console$/],
  ['GET|POST|DELETE', /^\/api\/hosting\/servers\/[a-f0-9]{24}\/backups$/],
  ['GET|POST', /^\/api\/hosting\/servers\/[a-f0-9]{24}\/world-backups$/],
  ['GET|POST|DELETE', /^\/api\/hosting\/servers\/[a-f0-9]{24}\/access$/],
  ['GET', /^\/api\/hosting\/servers\/[a-f0-9]{24}\/activity$/],
  ['GET|PUT', /^\/api\/hosting\/servers\/[a-f0-9]{24}\/maintenance$/],
  ['GET', /^\/api\/developer\/games$/],
  ['GET|PATCH', /^\/api\/developer\/games\/[a-z0-9-]+$/],
  ['GET|PATCH', /^\/api\/developer\/profile$/],
];
function isWorkspaceRequestAllowed(method, path) {
  return typeof path === 'string' && ROUTES.some(([methods, pattern]) => methods.split('|').includes(method) && pattern.test(path));
}
function registerWorkspaceApi({ipcMain, apiFetch, getApiBase, launcherApiHeaders}) {
  ipcMain.handle('workspace-request', async (_event, input = {}) => {
    const method = String(input.method || 'GET').toUpperCase();
    if (!isWorkspaceRequestAllowed(method, input.path)) return {error:'Unsupported workspace request'};
    try {
      const response = await apiFetch(`${getApiBase()}${input.path}`, {
        method,
        headers: launcherApiHeaders({accept:'application/json', 'content-type':'application/json'}),
        ...(method !== 'GET' && input.body ? {body:JSON.stringify(input.body)} : {}),
      });
      const data = await response.json();
      return response.ok ? data : {error:data.error || `Request failed (${response.status})`, status:response.status};
    } catch { return {error:'Could not reach PlayBound. Please retry.'}; }
  });
}
module.exports = {isWorkspaceRequestAllowed, registerWorkspaceApi};
