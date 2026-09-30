import { test } from "node:test";
import assert from "node:assert/strict";
import { itemSupportsController } from "./controllerTag.js";

test("native controller games and PlayBound Controls games both get the tag", () => {
  assert.equal(itemSupportsController({ features: ["Controller Support"] }), true);
  assert.equal(itemSupportsController({ features: ["PlayBound Controller Support"] }), true);
  assert.equal(itemSupportsController({ tags: ["Gamepad"] }), true);
});

test("an explicit hasControllerSupport flag wins over the text match", () => {
  assert.equal(itemSupportsController({ hasControllerSupport: false, features: ["Controller Support"] }), false);
  assert.equal(itemSupportsController({ hasControllerSupport: true, features: [] }), true);
});

test("games without controller data get no tag", () => {
  assert.equal(itemSupportsController({ features: ["Multiplayer"], tags: ["Racing"] }), false);
  assert.equal(itemSupportsController(null), false);
});
