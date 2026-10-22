const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../renderer/views/friends.js'), 'utf8');
async function setup(searchUsers) {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, { style: {}, dataset: {}, value: '', innerHTML: '', textContent: '', disabled: false, isConnected: true,
      appendChild() {}, querySelectorAll: () => [], querySelector: () => null });
    return elements.get(id);
  };
  const context = { document: { getElementById: get, createElement: () => ({}) },
    state: { _addFriendsMode: 'username', _addFriendsSent: {} }, api: {}, escapeHtml: (text) => text,
    filterCatalogGames: (games) => games, window: { playbound: { searchUsers, getCatalog: () => new Promise(() => {}) } } };
  vm.createContext(context);
  const start = source.indexOf('async function initAddFriendsPanel()');
  const end = source.indexOf('/* Icons matching', start);
  vm.runInContext(source.slice(start, end), context);
  await context.initAddFriendsPanel();
  return { get, submit: () => get('add-friends-form-username').onsubmit({ preventDefault() {} }) };
}
test('friend search works while the unrelated catalog request never completes', async () => {
  let query;
  const h = await setup(async (q) => { query = q; return { users: [] }; });
  h.get('add-friends-username-input').value = '  buddy  ';
  h.submit();
  await new Promise(setImmediate);
  assert.equal(query, 'buddy');
  assert.equal(h.get('btn-search-username').disabled, false);
  assert.equal(h.get('add-friends-message').textContent, 'Nobody matched that.');
});
test('synchronous IPC failure shows an error and enables retry', async () => {
  const h = await setup(() => { throw Error('Update PlayBound and try again.'); });
  h.get('add-friends-username-input').value = 'buddy';
  h.submit();
  await new Promise(setImmediate);
  assert.equal(h.get('add-friends-message').textContent, 'Update PlayBound and try again.');
  assert.equal(h.get('btn-search-username').disabled, false);
});
test('rapid friend searches submit once while a request is pending', async () => {
  let calls = 0;
  let finish;
  const h = await setup(() => { calls++; return new Promise((resolve) => { finish = resolve; }); });
  h.get('add-friends-username-input').value = 'buddy';
  h.submit(); h.submit();
  assert.equal(calls, 1);
  finish({ users: [] });
  await new Promise(setImmediate);
  assert.equal(h.get('btn-search-username').disabled, false);
});
