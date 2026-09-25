"use strict";

/**
 * The main-process source as one string, for tests that lift a function out
 * of it by name. main.js requires its state-free helpers from services/main/,
 * so a function a test looks for may live in either; reading them together
 * keeps those tests independent of which file it moved to.
 */
const fs = require("node:fs");
const path = require("node:path");

function readMainSource() {
  const root = path.join(__dirname, "..");
  const dir = path.join(__dirname, "main");
  const parts = [fs.readFileSync(path.join(root, "main.js"), "utf8")];
  for (const f of fs.readdirSync(dir).sort()) {
    if (f.endsWith(".js")) parts.push(fs.readFileSync(path.join(dir, f), "utf8"));
  }
  return parts.join("\n");
}

module.exports = { readMainSource };
