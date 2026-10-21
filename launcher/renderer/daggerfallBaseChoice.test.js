"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { test } = require("node:test");

const source = readFileSync(join(__dirname, "daggerfallBaseChoice.js"), "utf8")
  .replace('import { escapeHtml } from "./shared.js";', "")
  .replace("export function promptDaggerfallBaseChoice", "function promptDaggerfallBaseChoice");

function harness() {
  const roots = [];
  const keyHandlers = new Set();
  const document = {
    activeElement: null,
    body: { appendChild: (root) => roots.push(root) },
    createElement: () => {
      const handlers = {};
      return {
        innerHTML: "", setAttribute() {}, querySelector: () => ({ focus() {} }),
        addEventListener: (name, cb) => { handlers[name] = cb; },
        remove() { this.removed = true; },
        clickChoice(choice) { handlers.click({ target: { closest: () => ({ dataset: { choice } }) } }); },
      };
    },
    addEventListener: (name, cb) => { if (name === "keydown") keyHandlers.add(cb); },
    removeEventListener: (name, cb) => { if (name === "keydown") keyHandlers.delete(cb); },
  };
  const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const context = { document, escapeHtml, Promise };
  runInNewContext(`${source}\nglobalThis.prompt = promptDaggerfallBaseChoice;`, context);
  return { roots, keyHandlers, prompt: context.prompt };
}

test("Daggerfall dependency choice uses PlayBound cards and returns the selected install path", async () => {
  const ui = harness();
  const result = ui.prompt("Daggerfall <Online>");
  await new Promise(setImmediate);
  assert.match(ui.roots[0].innerHTML, /phone-controller-choice-card is-featured/);
  assert.match(ui.roots[0].innerHTML, /Daggerfall &lt;Online&gt;/);
  ui.roots[0].clickChoice("base-first");
  assert.equal(await result, "base-first");
  assert.equal(ui.roots[0].removed, true);
});

test("Escape cancels; simultaneous edition choices are shown in order", async () => {
  const ui = harness();
  const first = ui.prompt("Daggerfall Online");
  const second = ui.prompt("Daggerfall Unity");
  await new Promise(setImmediate);
  assert.equal(ui.roots.length, 1);
  for (const handler of ui.keyHandlers) handler({ key: "Escape", preventDefault() {} });
  assert.equal(await first, "cancel");
  await new Promise(setImmediate);
  assert.equal(ui.roots.length, 2);
  ui.roots[1].clickChoice("edition-only");
  assert.equal(await second, "edition-only");
});
