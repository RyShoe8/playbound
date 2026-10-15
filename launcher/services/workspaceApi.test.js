const test = require('node:test');
const assert = require('node:assert/strict');
const {isWorkspaceRequestAllowed} = require('./workspaceApi');
test('workspace bridge permits declared operations only', () => {
  assert.equal(isWorkspaceRequestAllowed('GET','/api/hosting/me'),true);
  assert.equal(isWorkspaceRequestAllowed('PATCH','/api/developer/games/openra'),true);
  for (const path of ['https://evil.test/api/hosting/me','/api/admin/games','/api/hosting/me?redirect=evil','/api/hosting/servers/../../admin','/api/hosting/servers/not-an-id']) assert.equal(isWorkspaceRequestAllowed('GET',path),false);
  assert.equal(isWorkspaceRequestAllowed('DELETE','/api/developer/profile'),false);
});

test('server-management endpoints remain scoped to one server and declared verbs', () => {
  const base = '/api/hosting/servers/0123456789abcdef01234567';
  for (const endpoint of ['players','bans','backups','world-backups','access','activity','maintenance','logs']) assert.equal(isWorkspaceRequestAllowed('GET',`${base}/${endpoint}`),true);
  assert.equal(isWorkspaceRequestAllowed('POST',`${base}/logs`),false);
  assert.equal(isWorkspaceRequestAllowed('POST',`${base}/console`),true);
  assert.equal(isWorkspaceRequestAllowed('PUT',`${base}/maintenance`),true);
  for (const endpoint of ['activity','console','world-backups','maintenance']) assert.equal(isWorkspaceRequestAllowed('DELETE',`${base}/${endpoint}`),false);
  for (const suffix of ['/../access','/access?admin=true','/access/other','%2Faccess']) assert.equal(isWorkspaceRequestAllowed('GET',base+suffix),false);
});
