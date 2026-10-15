import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogFollower } from './serverLogFollow.mjs';

test('live logs never overlap, stop after navigation and ignore stale responses', async () => {
  let resolve, callback, calls = 0, active = true;
  const shown = [];
  const follow = createLogFollower({read:() => { calls++; return new Promise(done => { resolve = done; }); },show:value=>shown.push(value),error:assert.fail,active:()=>active,visible:()=>true,schedule:work=>{callback=work;},cancel:()=>{callback=null;}});
  follow.start(); follow.start(); follow.visibilityChanged();
  assert.equal(calls,1);
  resolve({lines:['stale']}); await new Promise(done=>setImmediate(done));
  assert.deepEqual(shown,[]);
  callback(); assert.equal(calls,2);
  active=false; follow.stop(); resolve({lines:['late']});
  await new Promise(done=>setImmediate(done));
  assert.deepEqual(shown,[]); assert.equal(callback,null);
});

test('hidden windows suspend polling and permission errors stop automatic retries', async () => {
  let visible=false, calls=0, errors=0, schedules=0;
  const follow=createLogFollower({read:async()=>{calls++;throw new Error('Forbidden');},show:assert.fail,error:()=>errors++,active:()=>true,visible:()=>visible,schedule:()=>schedules++,cancel:()=>{}});
  follow.start(); assert.equal(calls,0);
  visible=true; follow.visibilityChanged();
  await new Promise(done=>setImmediate(done));
  assert.equal(calls,1); assert.equal(errors,1); assert.equal(schedules,0); assert.equal(follow.following,false);
});
