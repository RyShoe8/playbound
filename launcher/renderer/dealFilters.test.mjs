import test from 'node:test';
import assert from 'node:assert/strict';
import { dealGenres, matchesDealFilters } from './dealFilters.js';

test('genres combine giveaways and discounts, deduplicated and alphabetical', () => {
  assert.deepEqual(dealGenres([{genres:['Strategy', 'Action']}, {genres:['action', '', 'RPG']}, {}])
    .map(option => option.key), ['action', 'rpg', 'strategy']);
});

test('genre and store filters intersect for both deal types', () => {
  const free = {store:'epic', genres:[' Action ']};
  const sale = {storeKey:'steam', genres:['Action', 'RPG']};
  assert.equal(matchesDealFilters(free, 'epic', 'action'), true);
  assert.equal(matchesDealFilters(sale, 'epic', 'action'), false);
  assert.equal(matchesDealFilters(sale, 'steam', 'rpg'), true);
  assert.equal(matchesDealFilters({}, 'all', 'rpg'), false);
  assert.equal(matchesDealFilters({}, 'all', 'all'), true);
});
