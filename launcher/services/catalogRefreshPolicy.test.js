const assert = require('node:assert/strict');
const test = require('node:test');
const { catalogRequestTimeoutMs, shouldApplyCatalogResponse } = require('./catalogRefreshPolicy');

test('tester catalog gets a deadline long enough for the uncached authenticated feed', () => {
  assert.equal(catalogRequestTimeoutMs(false), 10_000);
  assert.equal(catalogRequestTimeoutMs(true), 45_000);
});

test('an older public response cannot overwrite the tester catalog', () => {
  const request = { id: 1, includeTesting: false, token: null };
  const current = { id: 2, includeTesting: true, token: 'tester-token' };
  assert.equal(shouldApplyCatalogResponse(request, current), false);
});

test('a previous account response cannot overwrite the current account catalog', () => {
  const request = { id: 3, includeTesting: true, token: 'previous-account' };
  const current = { id: 3, includeTesting: true, token: 'current-account' };
  assert.equal(shouldApplyCatalogResponse(request, current), false);
});

test('the latest matching catalog response is accepted', () => {
  const request = { id: 4, includeTesting: true, token: 'tester-token' };
  assert.equal(shouldApplyCatalogResponse(request, { ...request }), true);
});
