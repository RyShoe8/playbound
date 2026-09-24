import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.window = { playbound: {} };
const shared = await import("./shared.js");
await import("./views/detail.js");
shared.views.gameDetail = { innerHTML: "" };
shared.views.editionDetail = { innerHTML: "" };

test("edition lookup does not wait for a cold live-stats request", async () => {
  shared.cacheInvalidate();
  window.playbound.getEditions = async () => ({ editions: [] });
  window.playbound.getGameDetail = async () => null;
  window.playbound.getLiveStats = () => new Promise(() => {});
  await shared.api.renderEditionDetailView("slow-stats", "official");
  assert.match(shared.views.editionDetail.innerHTML, /Edition not found/);
});

test("editions start before a slow detail request finishes", async () => {
  shared.cacheInvalidate();
  let finish;
  let editionsStarted = false;
  window.playbound.getGameDetail = () => new Promise((resolve) => { finish = resolve; });
  window.playbound.getEditions = async () => {
    editionsStarted = true;
    return { editions: [] };
  };
  const render = shared.api.renderGameDetailView("slow-detail");
  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.equal(editionsStarted, true);
    assert.match(shared.views.gameDetail.innerHTML, /Loading game details/);
  } finally {
    finish(null);
    await render;
  }
});

test("an older failed request cannot overwrite a newer game page", async () => {
  shared.cacheInvalidate();
  const finish = new Map();
  window.playbound.getGameDetail = (slug) => new Promise((resolve) => finish.set(slug, resolve));
  window.playbound.getEditions = async () => ({ editions: [] });
  const oldRender = shared.api.renderGameDetailView("old-game");
  await new Promise((resolve) => setImmediate(resolve));
  const newRender = shared.api.renderGameDetailView("new-game");
  await new Promise((resolve) => setImmediate(resolve));
  try {
    finish.get("old-game")(null);
    await oldRender;
    assert.match(shared.views.gameDetail.innerHTML, /Loading game details/);
  } finally {
    finish.get("new-game")(null);
    await newRender;
  }
  assert.match(shared.views.gameDetail.innerHTML, /Game not found/);
});
