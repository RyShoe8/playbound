/**
 * Run: node services/openTtdPlayerName.test.js
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sanitizeClientName, mergeIniSetting } = require("./openTtdPlayerName");

test("sanitizeClientName trims and caps length", () => {
  assert.equal(sanitizeClientName("  ryanschumacher  "), "ryanschumacher");
  assert.equal(sanitizeClientName("x".repeat(40)).length, 32);
});

test("sanitizeClientName falls back when empty after sanitizing", () => {
  assert.equal(sanitizeClientName("***"), "Player");
});

test("mergeIniSetting replaces client_name inside network section", () => {
  const input = "[network]\nclient_name = Old\nserver_port = 3979\n";
  const out = mergeIniSetting(input, "network", "client_name", "NewName");
  assert.match(out, /client_name = NewName/);
  assert.doesNotMatch(out, /client_name = Old/);
  assert.match(out, /server_port = 3979/);
});

test("mergeIniSetting appends network section when missing", () => {
  const out = mergeIniSetting("", "network", "client_name", "Alice");
  assert.match(out, /\[network\]/);
  assert.match(out, /client_name = Alice/);
});
