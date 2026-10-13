import test from 'node:test';
import assert from 'node:assert/strict';
import { diversifyOffers, homepageSelections } from './siteLayout.js';

test('weekly ranking follows server selections while keeping native catalog entries', () => {
  const games = [{slug:'a', installType:'zip'}, {slug:'b', installType:'exe'}];
  const result = homepageSelections(games, {released:['b'],popular:['b','missing','a']});
  assert.deepEqual(result.popular, [games[1], games[0]]);
  assert.equal(result.released[0], games[1]);
});
test('unavailable or incompatible games do not create broken edition or mod targets', () => {
  const result = homepageSelections([{slug:'a'}], {editions:[{gameSlug:'missing',edition:{slug:'one'}},{gameSlug:'a',edition:{slug:'two'}}],mods:[{baseGameSlug:'missing'},{baseGameSlug:'a'}]});
  assert.equal(result.editions.length, 1);
  assert.equal(result.editions[0].edition.slug, 'two');
  assert.equal(result.mods.length, 1);
});
test('offline home still provides usable games without a made-up weekly ranking', () => {
  const games = [{slug:'a',releaseYear:2000},{slug:'b',releaseYear:2026}];
  assert.equal(homepageSelections(games, null).released[0].slug, 'b');
});
test('free offers use each store before filling additional cards', () => {
  const offers = [{store:'alienware',id:1},{store:'alienware',id:2},{store:'steam',id:3},{store:'gog',id:4}];
  assert.deepEqual(diversifyOffers(offers, 3).map(item=>item.id), [1,3,4]);
  assert.equal(offers.length, 4);
  assert.deepEqual(diversifyOffers([], 8), []);
});
