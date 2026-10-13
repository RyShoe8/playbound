const test = require('node:test');
const assert = require('node:assert/strict');
const {isWorkspaceRequestAllowed} = require('./workspaceApi');
test('workspace bridge permits declared operations only', () => {
  assert.equal(isWorkspaceRequestAllowed('GET','/api/hosting/me'),true);
  assert.equal(isWorkspaceRequestAllowed('PATCH','/api/developer/games/openra'),true);
  for (const path of ['https://evil.test/api/hosting/me','/api/admin/games','/api/hosting/me?redirect=evil','/api/hosting/servers/../../admin','/api/hosting/servers/not-an-id']) assert.equal(isWorkspaceRequestAllowed('GET',path),false);
  assert.equal(isWorkspaceRequestAllowed('DELETE','/api/developer/profile'),false);
});
