"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { test } = require("node:test");

const source = readFileSync(join(__dirname, "overlay.js"), "utf8");

async function renderOverlay(context, serverSettings) {
  const root = { innerHTML: "", querySelectorAll: () => [] };
  const subject = { textContent: "" };
  const buttons = new Map();
  const tabs = {
    innerHTML: "",
    querySelectorAll: () => ["server", "controls"].map((tab) => {
      const button = { dataset: { tab }, addEventListener: (_event, handler) => buttons.set(tab, handler) };
      return button;
    }),
  };
  const elements = { root, subject, tabs, close: { addEventListener() {} } };
  const document = {
    getElementById: (id) => elements[id] || null,
    addEventListener() {},
  };
  const playbound = {
    getOverlayContext: async () => context,
    getServerSettings: async () => serverSettings,
  };
  runInNewContext(source, { document, window: { playbound }, console });
  await new Promise((resolve) => setImmediate(resolve));
  return { root, tabs, subject, clickTab: (tab) => buttons.get(tab)?.() };
}

test("Controls opens directly for a solo game and keeps its tuning panel visible", async () => {
  const overlay = await renderOverlay({
    party: null,
    controls: {
      gameTitle: "Example Game",
      profileName: "PlayBound Recommended",
      settings: { sensitivity: 1.35, invertY: false },
      bindings: [{ input: "LEFT_UP", action: "Move forward" }],
    },
  });
  assert.match(overlay.tabs.innerHTML, /data-tab="controls"/);
  assert.match(overlay.tabs.innerHTML, /tab active[^>]*data-tab="controls"/);
  assert.match(overlay.root.innerHTML, /Look sensitivity/);
  assert.match(overlay.root.innerHTML, /View controls/);
  overlay.clickTab("server");
  assert.match(overlay.root.innerHTML, /No party is open/);
});

test("Server controls remain available with a party", async () => {
  const overlay = await renderOverlay(
    { party: { id: "p1", gameTitle: "Example Game" }, controls: null },
    { supported: false, reason: "Server settings are unavailable" }
  );
  assert.match(overlay.tabs.innerHTML, /tab active[^>]*data-tab="server"/);
  assert.match(overlay.root.innerHTML, /Server settings are unavailable/);
  overlay.clickTab("controls");
  assert.match(overlay.root.innerHTML, /Controls isn&#39;t active|Controls isn't active/);
});
