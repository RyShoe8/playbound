"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { test } = require("node:test");

const source = readFileSync(join(__dirname, "overlay.js"), "utf8");

async function renderOverlay(context, serverSettings, extraPlaybound = {}) {
  const root = { innerHTML: "", querySelectorAll: () => [] };
  const subject = { textContent: "" };
  const buttons = new Map();
  const tabs = {
    innerHTML: "",
    querySelectorAll: () => ["game", "server", "controls"].map((tab) => {
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
    ...extraPlaybound,
  };
  runInNewContext(source, { document, window: { playbound }, console, setInterval: () => 0, setTimeout });
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
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

test("Controls tab shows active control mapping for selected method when specialized controls is inactive", async () => {
  const overlay = await renderOverlay({
    party: null,
    controls: null,
    guide: {
      slug: "the-legend-of-zelda-book-of-mudora",
      title: "The Legend of Zelda: Book of Mudora",
      schemeLabels: { controller: "Controller", keyboard: "Keyboard & Mouse" },
      groupOrder: ["Movement", "Combat"],
      controls: {
        schemes: [
          {
            scheme: "controller",
            bindings: [
              { group: "Movement", action: "Move", input: "D-pad / Left Stick" },
              { group: "Combat", action: "Sword attack", input: "B / Circle" },
            ],
          },
          {
            scheme: "keyboard",
            bindings: [
              { group: "Movement", action: "Move", input: "Arrow keys" },
              { group: "Combat", action: "Sword attack", input: "C" },
            ],
          },
        ],
      },
    },
  });
  overlay.clickTab("controls");
  assert.match(overlay.tabs.innerHTML, /tab active[^>]*data-tab="controls"/);
  assert.match(overlay.root.innerHTML, /Active Controls/);
  assert.match(overlay.root.innerHTML, /<kbd>D-pad<\/kbd> or <kbd>Left Stick<\/kbd>/);
  assert.match(overlay.root.innerHTML, /Sword attack/);
  assert.match(overlay.root.innerHTML, /data-scheme="controller"/);
  assert.match(overlay.root.innerHTML, /data-scheme="keyboard"/);
});

test("Game tab is the default after a launch and shows the game's guide", async () => {
  const overlay = await renderOverlay({
    party: null,
    controls: null,
    guide: {
      slug: "morrowind",
      title: "Morrowind",
      howToQuit: "Press Escape, then choose Exit.",
      address: "147.93.133.235:25565",
      firstPlaySteps: ["Finish character creation first."],
      groupOrder: ["Movement"],
      controls: { schemes: [{ scheme: "keyboard", bindings: [{ group: "Movement", action: "Jump", input: "E" }] }] },
    },
  });
  assert.match(overlay.tabs.innerHTML, /tab active[^>]*data-tab="game"/);
  assert.match(overlay.root.innerHTML, /Press Escape, then choose Exit\./);
  assert.match(overlay.root.innerHTML, /147\.93\.133\.235:25565/);
  assert.match(overlay.root.innerHTML, /Jump/);
  assert.match(overlay.root.innerHTML, /<kbd>E<\/kbd>/);
  assert.match(overlay.root.innerHTML, /Finish character creation first\./);
  assert.equal(overlay.subject.textContent, "Morrowind");
});

test("Game tab explains itself when no game was launched", async () => {
  const overlay = await renderOverlay({ party: null, controls: null, guide: null });
  assert.match(overlay.tabs.innerHTML, /tab active[^>]*data-tab="game"/);
  assert.match(overlay.root.innerHTML, /Launch a game from PlayBound/);
});

test("Morrowind admin sees players with Make Ally, ally and invite states, and Run Startup", async () => {
  const overlay = await renderOverlay(
    { party: { id: "p1", gameSlug: "morrowind", gameTitle: "Morrowind" }, controls: null, guide: null },
    {
      supported: true,
      phase: "live",
      gameSlug: "morrowind",
      canEdit: true,
      definitions: [],
      values: {},
      status: { status: "running", host: "147.93.133.235", port: 25565 },
    },
    {
      getTes3mpClaimAdmin: async () => ({
        adminAccount: "Jacky Daytona",
        startupRun: false,
        accounts: [
          { accountName: "Jacky Daytona", online: true, pid: 0, isAdmin: true },
          { accountName: "Hormus", online: true, pid: 1, ally: true },
          { accountName: "Guest", online: true, pid: 2, invitePending: true },
          { accountName: "Stranger", online: true, pid: 3 },
          { accountName: "Offline Pal", online: false, pid: null },
        ],
      }),
    }
  );
  const html = overlay.root.innerHTML;
  assert.match(html, /TES3MP admin: <strong>Jacky Daytona/);
  assert.match(html, /Hormus[\s\S]*Ally ✓/);
  assert.match(html, /Guest[\s\S]*Invite sent/);
  assert.match(html, /data-make-ally="3"/);
  assert.doesNotMatch(html, /data-make-ally="0"/);
  assert.doesNotMatch(html, /Offline Pal/);
  assert.match(html, /id="tes3mp-runstartup"/);
});
