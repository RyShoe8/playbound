import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartyStore } from './partyStore.js';

const party = (id = 'one', ready = false) => ({ id, members: [{ ready }] });
const read = (store, myParties = []) => store.acceptRead({ myParties }, store.beginRead());

test('stale polls cannot overwrite either the party or its fallback cache', () => {
  const s = createPartyStore();
  const old = s.beginRead();
  s.set(party('new'));
  s.acceptRead({ myParties: [party('old')] }, old);
  assert.equal(read(s).myParties[0].id, 'new');
});
test('out-of-order reads cannot replace a newer response', () => {
  const s = createPartyStore();
  const old = s.beginRead();
  s.acceptRead({ myParties: [party('new')] }, s.beginRead());
  s.acceptRead({ myParties: [party('old')] }, old);
  assert.equal(s.current.id, 'new');
});
test('only five confirmed empties clear the party; errors and install returns preserve it', () => {
  const s = createPartyStore(); s.set(party());
  for (let i = 0; i < 8; i++) {
    s.acceptRead({ myParties: [], errors: ['parties'] }, s.beginRead());
    s.acceptRead({}, s.beginRead());
    s.acceptRead({ myParties: [] }, s.beginRead(), { keepDuringInstall: true });
  }
  for (let i = 0; i < 4; i++) assert.ok(read(s).myParties.length);
  assert.equal(read(s).myParties.length, 0);
});
test('explicit leave invalidates reads immediately', () => {
  const s = createPartyStore(); s.set(party());
  const old = s.beginRead(); s.clear();
  s.acceptRead({ myParties: [party()] }, old);
  assert.equal(s.current, null);
});
test('polls during an action cannot undo optimistic state, including after settlement', () => {
  const s = createPartyStore(); s.set(party());
  const action = s.beginAction(party('one', true));
  const pending = s.beginRead();
  s.acceptRead({ myParties: [party()] }, pending);
  assert.equal(s.current.members[0].ready, true);
  s.finishAction(action, { party: party('one', true) });
  s.acceptRead({ myParties: [party()] }, pending);
  assert.equal(s.current.members[0].ready, true);
});
test('failure rolls back its own action but cannot roll back a later change', () => {
  const s = createPartyStore(); s.set(party());
  let action = s.beginAction(party('one', true));
  s.finishAction(action, { failed: true });
  assert.equal(s.current.members[0].ready, false);
  action = s.beginAction(party('one', true));
  s.set(party('new'));
  assert.equal(s.finishAction(action, { failed: true }), false);
  assert.equal(s.current.id, 'new');
});
test('a late success cannot resurrect a party after leave', () => {
  const s = createPartyStore(); s.set(party());
  const action = s.beginAction(party('one', true)); s.clear();
  s.finishAction(action, { party: party() });
  assert.equal(s.current, null);
});
test('callers cannot mutate the store through input or output objects', () => {
  const s = createPartyStore(); const p = party(); s.set(p);
  p.members[0].ready = true;
  s.current.members[0].ready = true;
  assert.equal(s.current.members[0].ready, false);
});

test('account changes clear the party and invalidate outstanding work', () => {
  const s = createPartyStore(); s.setAccount('first'); s.set(party());
  const readToken = s.beginRead(); const action = s.beginAction(party('optimistic'));
  s.setAccount('second');
  s.acceptRead({ myParties: [party()] }, readToken);
  s.finishAction(action, { party: party() });
  assert.equal(s.current, null);
  assert.equal(s.pending, false);
});
