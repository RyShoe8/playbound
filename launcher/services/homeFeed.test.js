const test = require('node:test');
const assert = require('node:assert/strict');
const { createHomeFeedClient, ATTEMPT_TIMEOUT_MS } = require('./homeFeed');
const feed = {released:['unturned'], popular:['openra'], editions:[{gameSlug:'openra'}], mods:[{slug:'mod'}]};
const newer = {...feed, popular:['xonotic']};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('public homepage requests omit credentials, retry failures, and preserve all sections', async () => {
  let calls = 0;
  const load = createHomeFeedClient({getApiBase:()=> 'https://playbound.club', apiFetch:async (url, options, timeout) => {
    assert.equal(url, 'https://playbound.club/api/launcher/home');
    assert.equal(options.headers.authorization, undefined);
    assert.equal(timeout, ATTEMPT_TIMEOUT_MS);
    assert.ok(timeout <= 15000, 'a stalled attempt must not hold the homepage for half a minute');
    if (++calls === 1) throw new Error('cold timeout');
    return {ok:true, json:async()=>feed};
  }});
  const [a,b] = await Promise.all([load(),load()]);
  assert.deepEqual(a,feed); assert.deepEqual(b,feed); assert.equal(calls,2);
});
test('unavailable responses reject rather than cache empty sections, then recover', async () => {
  let healthy = false;
  const load = createHomeFeedClient({getApiBase:()=> 'https://playbound.club',apiFetch:async()=>healthy ? {ok:true,json:async()=>feed} : {ok:false,status:503}});
  await assert.rejects(load(), /503/);
  healthy=true; assert.deepEqual(await load(),feed);
  healthy=false; assert.deepEqual(await load(),feed);
});
test('a slow refresh does not hold the page when a saved feed exists, and the fresh one is kept for next time', async () => {
  const written = [];
  const store = {read: () => ({at: 1_000, feed}), write: value => written.push(value)};
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const load = createHomeFeedClient({
    getApiBase: () => 'https://playbound.club', store, now: () => 2_000, showCachedAfterMs: 10,
    apiFetch: async () => { await gate; return {ok: true, json: async () => newer}; },
  });
  const started = Date.now();
  assert.deepEqual(await load(), feed, 'shows the saved feed instead of waiting');
  assert.ok(Date.now() - started < 1000);
  release(); await sleep(20);
  assert.deepEqual(written.at(-1).feed, newer);
  assert.deepEqual(await load(), newer);
});
test('a fast refresh wins over the saved feed, and an unreadable or stale cache is ignored', async () => {
  const fastLoad = createHomeFeedClient({
    getApiBase: () => 'https://playbound.club', now: () => 2_000, showCachedAfterMs: 500,
    store: {read: () => ({at: 1_000, feed}), write() {}},
    apiFetch: async () => ({ok: true, json: async () => newer}),
  });
  assert.deepEqual(await fastLoad(), newer);

  let calls = 0;
  const ignored = createHomeFeedClient({
    getApiBase: () => 'https://playbound.club', now: () => 30 * 24 * 60 * 60 * 1000,
    store: {read: () => ({at: 1_000, feed}), write() {}},
    apiFetch: async () => { calls += 1; return {ok: false, status: 500}; },
  });
  await assert.rejects(ignored(), /500/);
  assert.equal(calls, 2);

  const broken = createHomeFeedClient({
    getApiBase: () => 'https://playbound.club',
    store: {read: () => { throw new Error('disk'); }, write() { throw new Error('disk'); }},
    apiFetch: async () => ({ok: true, json: async () => feed}),
  });
  assert.deepEqual(await broken(), feed);
});
