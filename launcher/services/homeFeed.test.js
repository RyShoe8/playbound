const test = require('node:test');
const assert = require('node:assert/strict');
const { createHomeFeedClient } = require('./homeFeed');
const feed = {released:['unturned'], popular:['openra'], editions:[{gameSlug:'openra'}], mods:[{slug:'mod'}]};
test('public homepage requests omit credentials, retry failures, and preserve all sections', async () => {
  let calls = 0;
  const load = createHomeFeedClient({getApiBase:()=> 'https://playbound.club', apiFetch:async (url, options, timeout) => {
    assert.equal(url, 'https://playbound.club/api/launcher/home');
    assert.equal(options.headers.authorization, undefined);
    assert.equal(timeout, 30000);
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
