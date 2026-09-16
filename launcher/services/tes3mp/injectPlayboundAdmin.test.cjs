/**
 * TES3MP PlayBound admin allowlist + claim-admin.
 *
 * Run: node --test tes3mp/injectPlayboundAdmin.test.cjs
 */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  injectPlayboundAdmin,
  sanitizeAdminName,
  listTes3mpAccounts,
  claimTes3mpAdmin,
} = require("./injectPlayboundAdmin.cjs");

function makeServerTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-tes3mp-"));
  const scripts = path.join(root, "scripts");
  fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(path.join(scripts, "customScripts.lua"), "-- Load up your custom scripts here!\n", "utf8");
  return root;
}

test("sanitizeAdminName strips control chars and caps length", () => {
  assert.equal(sanitizeAdminName("  Alice\nBob  "), "AliceBob");
  assert.equal(sanitizeAdminName('x";rm -rf'), "xrm -rf");
  assert.equal(sanitizeAdminName("a".repeat(40)).length, 32);
});

test("injectPlayboundAdmin writes allowlist, lua, and customScripts require", () => {
  const server = makeServerTree();
  try {
    const result = injectPlayboundAdmin(server, ["Ry", " ry ", "", "Ry"]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.admins, ["Ry"]);

    const allowlist = JSON.parse(fs.readFileSync(path.join(server, "data", "playbound-admins.json"), "utf8"));
    assert.deepEqual(allowlist, ["Ry"]);

    assert.ok(fs.existsSync(path.join(server, "scripts", "custom", "playboundAdmin.lua")));

    const custom = fs.readFileSync(path.join(server, "scripts", "customScripts.lua"), "utf8");
    assert.match(custom, /require\("custom\/playboundAdmin"\)/);
  } finally {
    fs.rmSync(server, { recursive: true, force: true });
  }
});

test("injectPlayboundAdmin allows empty seed (claim-admin path)", () => {
  const server = makeServerTree();
  try {
    const result = injectPlayboundAdmin(server, []);
    assert.equal(result.ok, true);
    assert.deepEqual(result.admins, []);
    assert.ok(fs.existsSync(path.join(server, "scripts", "custom", "playboundAdmin.lua")));
  } finally {
    fs.rmSync(server, { recursive: true, force: true });
  }
});

test("injectPlayboundAdmin is idempotent on customScripts.lua", () => {
  const server = makeServerTree();
  try {
    injectPlayboundAdmin(server, ["Host"]);
    injectPlayboundAdmin(server, ["Host"]);
    const custom = fs.readFileSync(path.join(server, "scripts", "customScripts.lua"), "utf8");
    const matches = custom.match(/require\("custom\/playboundAdmin"\)/g) || [];
    assert.equal(matches.length, 1);
  } finally {
    fs.rmSync(server, { recursive: true, force: true });
  }
});

test("injectPlayboundAdmin merges into an existing allowlist", () => {
  const server = makeServerTree();
  try {
    injectPlayboundAdmin(server, ["Host"]);
    const again = injectPlayboundAdmin(server, ["InGameName"]);
    assert.equal(again.ok, true);
    assert.deepEqual(again.admins, ["Host", "InGameName"]);
  } finally {
    fs.rmSync(server, { recursive: true, force: true });
  }
});

test("claimTes3mpAdmin promotes a logged-in account and writes claim file", () => {
  const server = makeServerTree();
  try {
    const playerDir = path.join(server, "data", "player");
    fs.mkdirSync(playerDir, { recursive: true });
    fs.writeFileSync(
      path.join(playerDir, "Nerevar.json"),
      JSON.stringify({ settings: { staffRank: 0 } }, null, 2),
      "utf8"
    );
    fs.writeFileSync(
      path.join(server, "data", "playbound-online.json"),
      JSON.stringify({ players: [{ accountName: "Nerevar", staffRank: 0 }] }),
      "utf8"
    );

    const claimed = claimTes3mpAdmin(server, null);
    assert.equal(claimed.ok, true);
    assert.equal(claimed.accountName, "Nerevar");

    const player = JSON.parse(fs.readFileSync(path.join(playerDir, "Nerevar.json"), "utf8"));
    assert.equal(player.settings.staffRank, 2);

    const claim = JSON.parse(
      fs.readFileSync(path.join(server, "data", "playbound-admin-claim.json"), "utf8")
    );
    assert.equal(claim.accountName, "Nerevar");
    assert.equal(claim.processed, false);

    const listed = listTes3mpAccounts(server);
    assert.equal(listed.adminAccount, "Nerevar");
  } finally {
    fs.rmSync(server, { recursive: true, force: true });
  }
});

test("claimTes3mpAdmin asks for a pick when several accounts exist", () => {
  const server = makeServerTree();
  try {
    const playerDir = path.join(server, "data", "player");
    fs.mkdirSync(playerDir, { recursive: true });
    fs.writeFileSync(path.join(playerDir, "A.json"), "{}\n", "utf8");
    fs.writeFileSync(path.join(playerDir, "B.json"), "{}\n", "utf8");
    const claimed = claimTes3mpAdmin(server, null);
    assert.equal(claimed.ok, false);
    assert.equal(claimed.reason, "ambiguous");
  } finally {
    fs.rmSync(server, { recursive: true, force: true });
  }
});

test("requestTes3mpSetHour writes playbound-sethour.json", () => {
  const { requestTes3mpSetHour } = require("./injectPlayboundAdmin.cjs");
  const server = makeServerTree();
  try {
    const bad = requestTes3mpSetHour(server, 99);
    assert.equal(bad.ok, false);
    const set = requestTes3mpSetHour(server, 6);
    assert.equal(set.ok, true);
    assert.equal(set.hour, 6);
    const doc = JSON.parse(fs.readFileSync(path.join(server, "data", "playbound-sethour.json"), "utf8"));
    assert.equal(doc.hour, 6);
    assert.equal(doc.processed, false);
  } finally {
    fs.rmSync(server, { recursive: true, force: true });
  }
});
