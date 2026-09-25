/**
 * Inject PlayBound TES3MP admin hook into a server/ tree.
 *
 * playboundAdmin.lua:
 * - promotes allowlisted accounts on authenticate
 * - processes playbound-admin-claim.json (Ctrl+P "Claim admin")
 * - writes playbound-online.json for the panel picker
 *
 * Shared by the VPS game-host recipe and the launcher local dedicated path.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const LUA_SRC = path.join(__dirname, "playboundAdmin.lua");

function sanitizeAdminName(name) {
  return String(name || "")
    .trim()
    .replace(/[\r\n\t\0]/g, "")
    .replace(/[";\\`]/g, "")
    .slice(0, 32);
}

function ensureHook(serverDir) {
  if (!serverDir) return { ok: false, reason: "no-server-dir" };
  if (!fs.existsSync(serverDir)) return { ok: false, reason: "missing-server-dir" };
  if (!fs.existsSync(LUA_SRC)) return { ok: false, reason: "missing-lua" };

  const dataDir = path.join(serverDir, "data");
  const scriptsDir = path.join(serverDir, "scripts");
  const customDir = path.join(scriptsDir, "custom");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(customDir, { recursive: true });
  fs.copyFileSync(LUA_SRC, path.join(customDir, "playboundAdmin.lua"));

  const customScripts = path.join(scriptsDir, "customScripts.lua");
  let body = fs.existsSync(customScripts) ? fs.readFileSync(customScripts, "utf8") : "";
  if (!/require\s*\(\s*["']custom\/playboundAdmin["']\s*\)/.test(body)) {
    body = `${body.replace(/\s*$/, "")}\n\nrequire("custom/playboundAdmin")\n`;
    fs.writeFileSync(customScripts, body, "utf8");
  }
  return { ok: true, dataDir };
}

/**
 * @param {string} serverDir path to the TES3MP `server/` plugin home
 * @param {string[]} adminNames optional seed allowlist (may be empty — claim-admin still works)
 * @returns {{ ok: boolean, reason?: string, admins?: string[] }}
 */
function injectPlayboundAdmin(serverDir, adminNames) {
  const seen = new Set();
  const names = [];
  const pushName = (raw) => {
    const name = sanitizeAdminName(raw);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  const ensured = ensureHook(serverDir);
  if (!ensured.ok) return ensured;

  const allowlistPath = path.join(ensured.dataDir, "playbound-admins.json");
  if (fs.existsSync(allowlistPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
      const list = Array.isArray(prev) ? prev : Array.isArray(prev?.admins) ? prev.admins : [];
      for (const entry of list) pushName(entry);
    } catch {
      /* replace corrupt allowlist */
    }
  }
  for (const raw of Array.isArray(adminNames) ? adminNames : []) pushName(raw);

  fs.writeFileSync(allowlistPath, `${JSON.stringify(names, null, 2)}\n`, "utf8");
  return { ok: true, admins: names };
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Accounts known to this room: currently online (Lua snapshot) and/or player saves.
 * @returns {{ accounts: Array<{ accountName: string, online: boolean, staffRank: number }>, adminAccount: string | null }}
 */
function listTes3mpAccounts(serverDir) {
  const dataDir = path.join(serverDir, "data");
  const byKey = new Map();

  const upsert = (accountName, { online = false, staffRank = 0, pid = null, allies = null, invitesSent = null } = {}) => {
    const name = sanitizeAdminName(accountName);
    if (!name) return;
    const key = name.toLowerCase();
    const prev = byKey.get(key) || { accountName: name, online: false, staffRank: 0, pid: null, allies: [], invitesSent: [] };
    byKey.set(key, {
      accountName: prev.accountName || name,
      online: prev.online || online,
      staffRank: Math.max(prev.staffRank, Number(staffRank) || 0),
      pid: Number.isInteger(pid) ? pid : prev.pid,
      allies: Array.isArray(allies) ? allies.map(String) : prev.allies,
      invitesSent: Array.isArray(invitesSent) ? invitesSent.map(String) : prev.invitesSent,
    });
  };

  const onlineDoc = readJsonSafe(path.join(dataDir, "playbound-online.json"));
  if (Array.isArray(onlineDoc?.players)) {
    for (const row of onlineDoc.players) {
      upsert(row?.accountName, {
        online: true,
        staffRank: row?.staffRank,
        pid: Number(row?.pid),
        allies: row?.allies,
        invitesSent: row?.invitesSent,
      });
    }
  }

  const playerDir = path.join(dataDir, "player");
  if (fs.existsSync(playerDir)) {
    for (const file of fs.readdirSync(playerDir)) {
      if (!file.toLowerCase().endsWith(".json")) continue;
      const accountName = file.slice(0, -5);
      const doc = readJsonSafe(path.join(playerDir, file));
      const staffRank = Number(doc?.settings?.staffRank) || 0;
      upsert(accountName, { online: false, staffRank });
    }
  }

  const accounts = [...byKey.values()].sort((a, b) =>
    a.accountName.localeCompare(b.accountName, undefined, { sensitivity: "base" })
  );
  // Prefer an admin who is online: that is the account overlay commands run as.
  const admin = accounts.find((a) => a.staffRank >= 2 && a.online) || accounts.find((a) => a.staffRank >= 2);
  /*
   * Ally state relative to the admin account, which is who "Make Ally"
   * invites from. TES3MP alliances are pairwise, and an invite only becomes
   * an alliance once the other player accepts with /join.
   */
  const lower = (list) => new Set((list || []).map((n) => String(n).toLowerCase()));
  const adminAllies = lower(admin?.allies);
  const adminInvites = lower(admin?.invitesSent);
  for (const a of accounts) {
    const key = a.accountName.toLowerCase();
    a.isAdmin = Boolean(admin) && key === admin.accountName.toLowerCase();
    a.ally = adminAllies.has(key);
    a.invitePending = !a.ally && adminInvites.has(key);
  }
  return {
    accounts,
    adminAccount: admin?.accountName || null,
    startupRun: Boolean(onlineDoc?.startupRun),
  };
}

/**
 * Party leader claims admin for a TES3MP account that has already logged in.
 * Writes staffRank on disk + a claim file Lua processes for the live session.
 */
function claimTes3mpAdmin(serverDir, accountName) {
  const ensured = ensureHook(serverDir);
  if (!ensured.ok) return ensured;

  const listed = listTes3mpAccounts(serverDir);
  let chosen = sanitizeAdminName(accountName);

  if (!chosen) {
    const online = listed.accounts.filter((a) => a.online);
    if (online.length === 1) chosen = online[0].accountName;
    else if (listed.accounts.length === 1) chosen = listed.accounts[0].accountName;
    else {
      return {
        ok: false,
        reason: online.length > 1 || listed.accounts.length > 1 ? "ambiguous" : "no-accounts",
        accounts: listed.accounts,
        adminAccount: listed.adminAccount,
      };
    }
  }

  const match = listed.accounts.find((a) => a.accountName.toLowerCase() === chosen.toLowerCase());
  if (!match && listed.accounts.length) {
    return {
      ok: false,
      reason: "unknown-account",
      accounts: listed.accounts,
      adminAccount: listed.adminAccount,
    };
  }

  // Seed allowlist so reconnects keep admin.
  injectPlayboundAdmin(serverDir, [chosen]);

  const playerPath = path.join(ensured.dataDir, "player", `${chosen}.json`);
  // Case-insensitive file find (Windows TES3MP may preserve login casing).
  let resolvedPlayerPath = playerPath;
  const playerDir = path.join(ensured.dataDir, "player");
  if (!fs.existsSync(resolvedPlayerPath) && fs.existsSync(playerDir)) {
    const hit = fs.readdirSync(playerDir).find((f) => f.toLowerCase() === `${chosen.toLowerCase()}.json`);
    if (hit) {
      resolvedPlayerPath = path.join(playerDir, hit);
      chosen = hit.slice(0, -5);
    }
  }

  if (fs.existsSync(resolvedPlayerPath)) {
    try {
      const doc = readJsonSafe(resolvedPlayerPath) || {};
      doc.settings = doc.settings && typeof doc.settings === "object" ? doc.settings : {};
      doc.settings.staffRank = 2;
      fs.writeFileSync(resolvedPlayerPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  fs.writeFileSync(
    path.join(ensured.dataDir, "playbound-admin-claim.json"),
    `${JSON.stringify({ accountName: chosen, requestedAt: Date.now(), processed: false }, null, 2)}\n`,
    "utf8"
  );

  const after = listTes3mpAccounts(serverDir);
  return { ok: true, accountName: chosen, accounts: after.accounts, adminAccount: chosen };
}

/**
 * Same as TES3MP admin chat `/sethour [0-23]` — set time of day for everyone.
 * Applied live via playbound-sethour.json (processed by playboundAdmin.lua).
 */
function requestTes3mpSetHour(serverDir, hour) {
  const ensured = ensureHook(serverDir);
  if (!ensured.ok) return ensured;

  const h = Math.floor(Number(hour));
  if (!Number.isFinite(h) || h < 0 || h > 23) {
    return { ok: false, reason: "invalid-hour" };
  }

  fs.writeFileSync(
    path.join(ensured.dataDir, "playbound-sethour.json"),
    `${JSON.stringify({ hour: h, requestedAt: Date.now(), processed: false }, null, 2)}\n`,
    "utf8"
  );
  return { ok: true, hour: h };
}

const TES3MP_COMMANDS = new Set(["invite", "runstartup"]);

/**
 * Queue an overlay button's command for the running server.
 *
 * Appended to playbound-commands.json; playboundAdmin.lua runs each id once,
 * as the online admin account, through TES3MP's own /invite and /runstartup.
 * The queue keeps the last 20 so it cannot grow without bound.
 */
function requestTes3mpCommand(serverDir, { command, targetPid } = {}) {
  const ensured = ensureHook(serverDir);
  if (!ensured.ok) return ensured;
  if (!TES3MP_COMMANDS.has(command)) return { ok: false, reason: "unknown-command" };

  const listed = listTes3mpAccounts(serverDir);
  const admin = listed.accounts.find((a) => a.isAdmin && a.online);
  if (!admin) return { ok: false, reason: "admin-offline" };

  let pid = null;
  if (command === "invite") {
    pid = Number(targetPid);
    const target = listed.accounts.find((a) => a.online && a.pid === pid);
    if (!Number.isInteger(pid) || !target) return { ok: false, reason: "target-offline" };
    if (target.isAdmin) return { ok: false, reason: "self" };
  }

  const queuePath = path.join(ensured.dataDir, "playbound-commands.json");
  const queue = readJsonSafe(queuePath);
  const requests = Array.isArray(queue?.requests) ? queue.requests : [];
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  requests.push({ id, command, targetPid: pid, actor: admin.accountName, requestedAt: Date.now() });
  fs.writeFileSync(queuePath, `${JSON.stringify({ requests: requests.slice(-20) }, null, 2)}
`, "utf8");
  return { ok: true, id, command, targetPid: pid, actor: admin.accountName };
}

module.exports = {
  requestTes3mpCommand,
  injectPlayboundAdmin,
  sanitizeAdminName,
  listTes3mpAccounts,
  claimTes3mpAdmin,
  requestTes3mpSetHour,
  ensureHook,
};
