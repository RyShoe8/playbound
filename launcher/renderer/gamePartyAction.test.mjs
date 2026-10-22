import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindGamePartyButton } from './gamePartyAction.js';
import { createPartyStore } from './partyStore.js';

function harness(createParty) {
  const events = {};
  const button = { textContent: '', disabled: false, title: '', addEventListener(name, callback) { events[name] = callback; } };
  const store = createPartyStore();
  const navigations = [];
  const statuses = [];
  const payloads = [];
  bindGamePartyButton(button, { gameSlug: 'srb2kart', title: 'SRB2Kart',
    bridge: createParty ? { createParty: async (payload) => { payloads.push(payload); return createParty(payload); } } : {},
    store, navigate: (view) => navigations.push({ view, party: store.current }),
    report: (...status) => statuses.push(status), refresh: () => new Promise(() => {}) });
  return { button, store, navigations, statuses, payloads, click: () => events.click({ stopPropagation() {} }) };
}

test('create opens the returned party without waiting for a friends/Discord refresh', async () => {
  const h = harness(() => ({ party: { id: 'new-party', gameSlug: 'srb2kart' }, needsDiscordLink: true }));
  const staleRead = h.store.beginRead();
  await h.click();
  assert.deepEqual(h.payloads, [{ gameSlug: 'srb2kart', visibility: 'friends', maxSize: 8 }]);
  assert.equal(h.navigations[0].view, 'friends');
  assert.equal(h.navigations[0].party.id, 'new-party');
  h.store.acceptRead({ myParties: [] }, staleRead);
  assert.equal(h.store.current.id, 'new-party');
  assert.equal(h.button.textContent, 'View Party');
  assert.equal(h.button.disabled, false);
});

test('existing parties open directly rather than creating duplicates', async () => {
  const h = harness(() => { throw Error('must not create'); });
  h.store.set({ id: 'existing', status: 'active' });
  await h.click();
  assert.equal(h.payloads.length, 0);
  assert.equal(h.navigations[0].party.id, 'existing');
});

test('rapid clicks submit one creation and expose the pending state', async () => {
  let resolve;
  const h = harness(() => new Promise((done) => { resolve = done; }));
  const first = h.click();
  await h.click();
  assert.equal(h.payloads.length, 1);
  assert.equal(h.button.disabled, true);
  assert.equal(h.button.textContent, 'Creating…');
  resolve({ party: { id: 'created' } });
  await first;
  assert.equal(h.navigations.length, 1);
});

test('API rejection is visible and leaves a working retry button', async () => {
  let calls = 0;
  const h = harness(() => ++calls === 1 ? { error: 'Sign in again.' } : { party: { id: 'retry' } });
  await h.click();
  assert.deepEqual(h.statuses.at(-1), ['Sign in again.', true]);
  assert.equal(h.button.textContent, 'Try Again');
  assert.equal(h.button.disabled, false);
  assert.equal(h.navigations.length, 0);
  await h.click();
  assert.equal(h.store.current.id, 'retry');
});

test('missing IPC support and malformed responses report an error, never silent success', async () => {
  for (const implementation of [undefined, () => ({ party: {} }), () => { throw Error('Offline'); }]) {
    const h = harness(implementation);
    await h.click();
    assert.equal(h.navigations.length, 0);
    assert.equal(h.store.current, null);
    assert.equal(h.statuses.at(-1)[1], true);
    assert.equal(h.button.textContent, 'Try Again');
  }
});

test('a creation finishing after sign-out cannot restore the previous account party', async () => {
  let resolve;
  const h = harness(() => new Promise((done) => { resolve = done; }));
  h.store.setAccount('original');
  const request = h.click();
  h.store.setAccount(null);
  resolve({ party: { id: 'old-account-party' } });
  await request;
  assert.equal(h.store.current, null);
  assert.equal(h.navigations.length, 0);
  assert.equal(h.button.disabled, false);
});
