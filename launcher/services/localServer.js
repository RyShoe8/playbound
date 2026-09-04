/**
 * A dedicated game server on the player's own PC.
 *
 * This is what makes a self-hosted room controllable. Before it, "self-host"
 * meant the leader started a listen server from the game's own menus — so
 * there was no process PlayBound owned, no argv it chose, and nothing it could
 * restart. `reportSelfHostWhenListening` waits half an hour for a human to
 * click Start Network Game precisely because of that.
 *
 * Here the launcher spawns the dedicated server itself, which makes every
 * declared setting deliverable (they all go on the command line) and makes a
 * restart a real control rather than killing the game the host is playing.
 *
 * Arg composition is pulled out and exported so it can be tested without
 * spawning anything: what we put on a command line is the part worth being
 * sure about.
 *
 * Run: node services/localServer.test.js
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function iniValue(value) {
  return String(value ?? "").replace(/[\r\n]/g, " ").trim();
}

function writeServerConfig(cwd, hostLaunch, port, settings) {
  if (!hostLaunch?.configFile) return;
  const configPath = path.join(cwd, hostLaunch.configFile);
  let content = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "[General]\n";
  const values = {
    port,
    hostname: "PlayBound.club Party",
    ...(settings || {}),
  };
  const allowed = new Set(hostLaunch.configKeys || []);
  for (const [key, raw] of Object.entries(values)) {
    if (!allowed.has(key)) continue;
    const line = `${key} = ${iniValue(raw)}`;
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=.*$`, "mi");
    content = re.test(content) ? content.replace(re, line) : content.replace(/^\[General\]\s*$/mi, `[General]\n${line}`);
  }
  fs.writeFileSync(configPath, content, "utf8");

  if (hostLaunch.scriptConfigFile) {
    const scriptPath = path.join(cwd, hostLaunch.scriptConfigFile);
    if (!fs.existsSync(scriptPath)) throw new Error(`${hostLaunch.scriptConfigFile} was not found`);
    let script = fs.readFileSync(scriptPath, "utf8");
    const scriptKeys = new Set(hostLaunch.scriptConfigKeys || []);
    for (const [key, raw] of Object.entries(settings || {})) {
      if (!scriptKeys.has(key)) continue;
      const value = iniValue(raw).replace(/["\\]/g, "");
      const re = new RegExp(`^config\\.${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=.*$`, "mi");
      if (re.test(script)) script = script.replace(re, `config.${key} = "${value}"`);
    }
    fs.writeFileSync(scriptPath, script, "utf8");
  }
}

/**
 * Settings that go on the command line as engine cvars.
 *
 * Quake 3 derivatives take any cvar as `+set name value` at startup, which is
 * why a game whose schema calls a setting `rcon`-backed can still be delivered
 * here: this process has not started yet, so everything is a startup value.
 * That is also why the local adapter reports no live apply — the cost is a
 * restart even when the game itself would have allowed better.
 */
function cvarArgs(settings) {
  const args = [];
  for (const [key, value] of Object.entries(settings || {})) {
    const text = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
    /*
     * The same rule as the platform's rcon builder: a value carrying a quote,
     * a semicolon or a newline stops being a value. These reach a game's
     * console through its command line, so they are refused rather than
     * escaped.
     */
    if (!/^[A-Za-z0-9 ._:@#()[\]+-]*$/.test(text)) continue;
    args.push("+set", key, text);
  }
  return args;
}

/**
 * The full argv for a game's dedicated server.
 *
 * `hostLaunch.argsTemplate` comes from the catalog — the same per-game
 * template the VPS recipes are built from, which until now was declared on
 * eleven games and read by nothing.
 */
function buildServerArgs({ hostLaunch, port, settings }) {
  const template = Array.isArray(hostLaunch?.argsTemplate) ? hostLaunch.argsTemplate : [];
  if (!template.length) return hostLaunch?.configFile ? [] : null;
  const resolved = template.map((arg) =>
    String(arg).replace("{port}", String(port)).replace("{name}", "PlayBound.club Party")
  );
  return [...resolved, ...cvarArgs(settings)];
}

/**
 * One dedicated server per party, owned by this launcher.
 *
 * Keyed by party rather than by game: a player can only host one room for a
 * party, and keying by game would let two parties fight over one process.
 */
function createLocalServers({ onExit } = {}) {
  const running = new Map();

  function get(partyId) {
    return running.get(String(partyId)) || null;
  }

  function stop(partyId) {
    const entry = running.get(String(partyId));
    if (!entry) return false;
    running.delete(String(partyId));
    try {
      entry.child.kill();
    } catch {
      /* already gone */
    }
    return true;
  }

  /**
   * Start (or replace) the server for a party.
   *
   * Replacing is how a settings change lands: there is no way to tell a
   * dedicated server that was given its configuration on the command line to
   * take a different one, so the process is the unit of change.
   */
  function start(partyId, { exe, cwd, hostLaunch, port, settings, revision }) {
    const args = buildServerArgs({ hostLaunch, port, settings });
    if (!args) return { error: "This game has no dedicated server PlayBound can start." };
    if (!exe) return { error: "The game is not installed." };

    stop(partyId);

    try {
      writeServerConfig(cwd || path.dirname(exe), hostLaunch, port, settings);
    } catch (err) {
      return { error: `Could not write server configuration: ${err.message}` };
    }

    let child;
    try {
      child = spawn(exe, args, {
        cwd: cwd || path.dirname(exe),
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }

    const entry = { child, revision, port, startedAt: Date.now(), lastError: null };
    running.set(String(partyId), entry);

    child.on("exit", (code) => {
      // Only clear if this is still the current process: a restart removed the
      // old entry already, and its exit must not wipe the new one.
      if (running.get(String(partyId)) === entry) running.delete(String(partyId));
      /*
       * A dedicated server that exits on its own has failed — it is meant to
       * run until the party ends. Exit codes are the only diagnosis available
       * without parsing per-game output.
       */
      if (code !== 0 && code !== null) entry.lastError = `Server exited with code ${code}`;
      if (typeof onExit === "function") onExit(String(partyId), code, entry.lastError);
    });

    return { ok: true, pid: child.pid || null, revision, port };
  }

  function stopAll() {
    for (const partyId of [...running.keys()]) stop(partyId);
  }

  return { start, stop, stopAll, get, running };
}

module.exports = { createLocalServers, buildServerArgs, cvarArgs, writeServerConfig };
