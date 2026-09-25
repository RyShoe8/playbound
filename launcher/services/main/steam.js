"use strict";

/*
 * Moved out of main.js unchanged: helpers that touch no main-process state
 * (no windows, sessions or timers). main.js requires what it needs from here.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");

/**
 * Ensure Steam is running before handing it a `steam://` deep link.
 *
 * On Windows, shell.openExternal("steam://install/630") is silently ignored
 * if Steam is not already running — the OS resolves the protocol handler and
 * launches steam.exe, but then the launched Steam instance may not process
 * the deep link argument before PlayBound's openExternal call returns. The
 * result is the button appears to do nothing.
 *
 * Spawning steam.exe explicitly and waiting for it to open its IPC socket
 * means by the time openExternal fires, Steam is ready to receive the link.
 * Only runs on Windows, only when Steam is installed, and only when the
 * process is not already running (checked by trying to open the Steam IPC pipe).
 */
async function ensureSteamRunning() {
  if (process.platform !== "win32") return;
  const base = steamBaseDir();
  if (!base) return;
  const steamExe = path.join(base, "steam.exe");
  if (!fs.existsSync(steamExe)) return;

  // Quick check: try to see if the Steam mutex/named pipe exists, which means
  // Steam is already running. If so, nothing to do.
  const ipcPipe = "\\\\.\\pipe\\SteamEngine";
  const isRunning = await new Promise((resolve) => {
    const net = require("net");
    const client = net.createConnection(ipcPipe, () => {
      client.destroy();
      resolve(true);
    });
    client.on("error", () => resolve(false));
    client.setTimeout(500, () => {
      client.destroy();
      resolve(false);
    });
  });
  if (isRunning) return;

  // Steam is not running — launch it and wait for it to be ready.
  try {
    spawn(steamExe, [], { detached: true, stdio: "ignore" }).unref();
    console.log("[steam] Launched steam.exe to handle upcoming deep link");
  } catch (err) {
    console.warn("[steam] Could not launch steam.exe:", err?.message || err);
    return;
  }

  // Poll for up to 8 seconds for Steam's IPC pipe to appear.
  const started = Date.now();
  while (Date.now() - started < 8000) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const ready = await new Promise((resolve) => {
      const net = require("net");
      const client = net.createConnection(ipcPipe, () => {
        client.destroy();
        resolve(true);
      });
      client.on("error", () => resolve(false));
      client.setTimeout(400, () => {
        client.destroy();
        resolve(false);
      });
    });
    if (ready) {
      console.log("[steam] Steam IPC ready");
      return;
    }
  }
  // Even if we timed out, Steam is probably starting — give it a final moment.
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

/** True for Discord's own web hosts, so "open Discord" can prefer the app. */
function isDiscordUrl(raw) {
  try {
    const host = new URL(String(raw || "")).hostname.replace(/^www\./, "").toLowerCase();
    return host === "discord.com" || host === "discord.gg" || host === "discordapp.com";
  } catch {
    return false;
  }
}

/** Invite code out of a discord.gg / discord.com/invite URL. */
function parseDiscordInviteCode(inviteUrl) {
  try {
    const u = new URL(String(inviteUrl || ""));
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const parts = u.pathname.split("/").filter(Boolean);
    let code = null;
    if (host === "discord.gg" || host === "discordapp.com") code = parts[0] || null;
    else if (host === "discord.com" && parts[0] === "invite") code = parts[1] || null;
    // Only ever build a deep link from a plain invite code, so nothing from a
    // URL can smuggle its way into the discord:// we hand the OS.
    return code && /^[A-Za-z0-9_-]{1,32}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

/** Steam's own install directory, or null. */
function steamBaseDir() {
  try {
    if (process.platform === "win32") {
      const candidates = [
        path.join(process.env["ProgramFiles(x86)"] || "", "Steam"),
        path.join(process.env.PROGRAMFILES || "", "Steam"),
      ];
      return candidates.find((p) => p && fs.existsSync(path.join(p, "steam.exe"))) || null;
    }
    const home = process.env.HOME || "";
    if (process.platform === "darwin") {
      const mac = path.join(home, "Library", "Application Support", "Steam");
      return fs.existsSync(mac) ? mac : null;
    }
    return (
      [path.join(home, ".local", "share", "Steam"), path.join(home, ".steam", "steam")].find((p) =>
        fs.existsSync(p)
      ) || null
    );
  } catch {
    return null;
  }
}

/**
 * Where Steam actually put a game, from Steam's own records.
 *
 * A Steam install lands wherever the player's libraries are — frequently a
 * second drive — under a folder name only Steam knows. Every other detection
 * path here guesses: a knownExePath someone wrote down, a registry title, or a
 * walk of PlayBound's own games directory, which a Steam game is never in. So
 * a Steam title with no hand-written hints was undetectable, and installing one
 * through PlayBound left it out of the library entirely.
 *
 * appmanifest_<appid>.acf is Valve's own record of the install, and `installdir`
 * in it is the folder under steamapps/common. Reading that is exact rather than
 * a guess, and needs nothing per game beyond the app id.
 */
/**
 * A game's Steam app id, from the catalog row however it happens to carry it.
 *
 * Most rows never set steamAppId — the id is only in the store URL. Reading
 * the field alone made findSteamInstallExe give up on exactly those rows, so
 * Steam's own appmanifest was never consulted and detection fell through to a
 * full-drive basename scan. For Strikers Club that scan hunts strikers-club.exe
 * (slug.exe, the fallback when a row has no exeHint or knownExePaths) against
 * an install that ships UFG.exe and start_protected_game.exe — a name that
 * cannot match, so the game never resolved at all.
 *
 * Deriving the id here also means findExecutable runs inside the exact install
 * directory, which is where the EasyAntiCheat bootstrap preference lives. That
 * ranking already existed; it was simply unreachable for a row like this one.
 */
function steamAppIdFor(entry) {
  const direct = String(entry?.steamAppId || "").trim();
  if (/^\d+$/.test(direct)) return direct;
  const url = entry?.url || entry?.links?.steam || entry?.editionLinks?.steam || "";
  const m =
    String(url).match(/store\.steampowered\.com\/app\/(\d+)/i) ||
    String(url).match(/steam:\/\/(?:install|run|rungameid)\/(\d+)/i);
  return m ? m[1] : null;
}

module.exports = { ensureSteamRunning, isDiscordUrl, parseDiscordInviteCode, steamBaseDir, steamAppIdFor };
