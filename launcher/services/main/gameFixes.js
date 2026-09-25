"use strict";

/*
 * Moved out of main.js unchanged: helpers that touch no main-process state
 * (no windows, sessions or timers). main.js requires what it needs from here.
 */

const { app } = require("electron");
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { ensureGameInstallRecord, exeOnDisk, findExecutable, loadSettings, loadState, normalizeFsPath, pathUnderRoot, saveSettings, saveState, sevenZipBinary, syncGameInstallSummary } = require("./core");

function listUninstallRegistryDump() {
  if (process.platform !== "win32") return Promise.resolve([]);
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$paths = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
Get-ItemProperty $paths |
  Where-Object { $_.DisplayName -or $_.DisplayIcon -or $_.InstallLocation } |
  Select-Object DisplayName, InstallLocation, DisplayIcon |
  ConvertTo-Json -Compress
`;
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { encoding: "utf8", timeout: 12_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          console.warn("[install] uninstall dump failed:", err.message || err);
          resolve([]);
          return;
        }
        try {
          const out = String(stdout || "").trim();
          if (!out) {
            resolve([]);
            return;
          }
          const parsed = JSON.parse(out);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch {
          resolve([]);
        }
      }
    );
  });
}

function isFlightGearAircraftMod(installRelativePath) {
  const rel = String(installRelativePath || "")
    .replace(/^[/\\]+/, "")
    .replace(/\\/g, "/");
  return /^aircraft(\/|$)/i.test(rel);
}

/** FG_HOME Addons root — not the fgfs bin/ tree. */
function flightGearHomeAddons() {
  const home = app.getPath("home");
  if (process.platform === "win32") {
    const roaming = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(roaming, "flightgear.org", "Addons");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "FlightGear", "Addons");
  }
  return path.join(home, ".fgfs", "Addons");
}

function findDirContainingFile(root, fileName, maxDepth = 5) {
  if (!root || !fs.existsSync(root)) return null;
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    if (fs.existsSync(path.join(dir, fileName))) return dir;
    if (depth >= maxDepth) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
      queue.push({ dir: path.join(dir, ent.name), depth: depth + 1 });
    }
  }
  return null;
}

function flightGearAddonLaunchArgs(state) {
  const mods = state.__mods__ && typeof state.__mods__ === "object" ? state.__mods__ : {};
  const args = [];
  for (const info of Object.values(mods)) {
    if (!info || info.baseGameSlug !== "flightgear") continue;
    const dir = info.dir;
    if (!dir || !fs.existsSync(dir)) continue;
    if (!fs.existsSync(path.join(dir, "addon-main.nas"))) continue;
    args.push(`--addon=${dir}`);
  }
  return args;
}

function resolveModTargetDir(baseGameSlug, installRelativePath, baseDirOverride, modSlug) {
  const home = app.getPath("home");
  const appData =
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(home, "Library", "Application Support")
      : path.join(home, ".config"));
  const documents =
    process.platform === "darwin"
      ? path.join(home, "Documents")
      : path.join(process.env.USERPROFILE || home, "Documents");
  const rel = String(installRelativePath || "mods").replace(/^[/\\]+|[/\\]+$/g, "") || "mods";
  const under = (root) => path.join(root, ...rel.split(/[/\\]+/));

  if (baseGameSlug === "flightgear" && !isFlightGearAircraftMod(installRelativePath)) {
    const folder = String(modSlug || "addon").replace(/[<>:"|?*]/g, "_");
    return path.join(flightGearHomeAddons(), folder);
  }

  if (baseGameSlug === "mindustry") {
    return under(path.join(appData, "Mindustry"));
  }
  if (baseGameSlug === "0ad") {
    if (process.platform === "darwin") {
      return under(path.join(appData, "0ad", "mods"));
    }
    return under(path.join(documents, "My Games", "0ad"));
  }
  if (baseGameSlug === "openttd") {
    return under(path.join(appData, "OpenTTD"));
  }
  if (baseGameSlug === "endless-sky") {
    return under(path.join(appData, "endless-sky"));
  }
  if (baseGameSlug === "luanti" || baseGameSlug === "minetest") {
    const luantiRoot = path.join(appData, "Luanti");
    const minetestRoot = path.join(appData, "Minetest");
    const root = fs.existsSync(luantiRoot) ? luantiRoot : minetestRoot;
    return under(root);
  }
  if (baseGameSlug === "naev") {
    return under(path.join(appData, "naev"));
  }
  if (baseGameSlug === "supertuxkart") {
    return under(path.join(appData, "supertuxkart", "addons"));
  }
  if (baseGameSlug === "battle-for-wesnoth") {
    const wesnothDoc = path.join(documents, "My Games", "Wesnoth1.18");
    if (fs.existsSync(wesnothDoc)) {
      return under(path.join(wesnothDoc, "data", "add-ons"));
    }
    return under(path.join(appData, "Wesnoth1.18", "data", "add-ons"));
  }
  if (baseGameSlug === "zero-k") {
    const zkData = path.join(appData, "Zero-K");
    if (fs.existsSync(zkData)) {
      return under(zkData);
    }
    const springData = path.join(appData, "spring");
    if (fs.existsSync(springData)) {
      return under(springData);
    }
    let baseDir = baseDirOverride || null;
    if (!baseDir) {
      const state = loadState();
      const info = state[baseGameSlug];
      if (info?.dir && fs.existsSync(info.dir)) baseDir = info.dir;
    }
    if (baseDir) return under(baseDir);
    return under(zkData);
  }

  let baseDir = baseDirOverride || null;
  if (!baseDir) {
    const state = loadState();
    const info = state[baseGameSlug];
    if (info?.dir && fs.existsSync(info.dir)) baseDir = info.dir;
  }
  if (!baseDir) return null;
  return under(baseDir);
}

function modUsesUserDataFolder(baseGameSlug, installRelativePath) {
  if (baseGameSlug === "flightgear") {
    return true;
  }
  return [
    "mindustry",
    "0ad",
    "openttd",
    "endless-sky",
    "luanti",
    "minetest",
    "naev",
    "supertuxkart",
    "battle-for-wesnoth",
    "zero-k",
  ].includes(baseGameSlug);
}

function isBaseGameReady(baseGameSlug) {
  const state = loadState();
  const info = state[baseGameSlug];
  return Boolean(exeOnDisk(info));
}

/**
 * Write the connected controller into a game's config, if it needs one.
 *
 * Every guard lives in the registry rather than here — unknown game, already
 * configured, unrecognised format and no pad all come back as null, so this
 * has one branch instead of four.
 */
/**
 * Whether to set this game's controller up, asked once per game.
 *
 * Auto-configuring silently would be the wrong default: it edits a file the
 * player may care about, and someone playing on keyboard does not want their
 * config touched at all. Asking every launch would be worse, so the answer is
 * remembered and only a pad they have never been asked about prompts again.
 */
/**
 * Games the player has agreed to launch with administrator rights.
 *
 * The catalog's `needsAdmin` covers titles somebody has curated, but it is
 * looked up by slug and a game added with "Add existing game" has no catalog
 * row at all — `custom-…` slugs can never match one. That is most of the
 * cases where this comes up, because a loader demanding elevation is exactly
 * the kind of thing people install by hand. So the answer is remembered here
 * as well, per game, and either source is enough.
 */
function elevationRemembered(slug) {
  try {
    return Boolean(loadSettings().elevatedGames?.[slug]);
  } catch {
    return false;
  }
}

function rememberElevation(slug, allow) {
  try {
    const settings = loadSettings();
    settings.elevatedGames = { ...(settings.elevatedGames || {}), [slug]: allow };
    saveSettings(settings);
  } catch {
    /* the retry still happens this launch; only the memory is lost */
  }
}

/** True for the failure Windows reports when an executable demands elevation. */
function looksLikeElevationRefusal(err) {
  if (process.platform !== "win32") return false;
  const text = String(err?.message || err || "");
  return err?.code === "EACCES" || /\bEACCES\b/.test(text);
}

async function prepareClassicDosInstall(entry, gameDir) {
  if (entry?.slug !== "daggerfall" || entry?.editionSlug !== "classic-dos") return;
  const fallExe = findExecutable(gameDir, "FALL.EXE");
  if (!fallExe) throw new Error("Daggerfall Classic is missing FALL.EXE");
  const daggerDir = path.dirname(fallExe);
  if (!fs.existsSync(path.join(daggerDir, "ARENA2", "GLOBAL.BSA"))) {
    throw new Error("Daggerfall Classic is missing its ARENA2 game data");
  }
  const config = [
    "type dfall_huge",
    "path c:\\arena2\\",
    "pathcd c:\\arena2\\",
    "fade_time 3",
    "map_file huge_map.txt",
    "",
  ].join("\r\n");
  await fsp.writeFile(path.join(daggerDir, "Z.CFG"), config, "ascii");
}

async function flattenWadFiles(gameDir) {
  try {
    const walk = async (dir) => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          await walk(full);
        } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".wad")) {
          const dest = path.join(gameDir, ent.name);
          if (full !== dest && !fs.existsSync(dest)) {
            await fsp.copyFile(full, dest);
          }
        }
      }
    };
    await walk(gameDir);
  } catch (err) {
    console.warn("[flattenWadFiles] Warning:", err?.message || err);
  }
}

/**
 * Resolve a recipe-supplied relative path inside the game folder.
 *
 * Recipes come from the server, so a crafted `dest` like "../../Windows" must
 * not be able to write outside the install. Returns null when the path would
 * escape, and callers treat that as a failed step rather than falling back to
 * the game root.
 */
function resolveInsideGameDir(gameDir, relative) {
  const rel = String(relative || "").replace(/^[/\\]+/, "");
  if (!rel) return normalizeFsPath(gameDir);
  if (rel.includes("\0")) return null;
  const full = normalizeFsPath(path.resolve(gameDir, rel));
  return pathUnderRoot(full, gameDir) ? full : null;
}

/* ── mod-loader patching (Aurie) ───────────────────────────────────────── */

/**
 * Whether a PE already carries a named section.
 *
 * Aurie installs itself by appending a ".aurie" section to the game exe, so
 * the section table is the authoritative answer to "are the mods active?" —
 * more reliable than a flag we store, because Steam silently restores the
 * original exe whenever the game updates or is verified, which would leave any
 * stored flag lying.
 */
function peHasSection(exePath, sectionName) {
  let fd = null;
  try {
    fd = fs.openSync(exePath, "r");
    const dos = Buffer.alloc(0x40);
    if (fs.readSync(fd, dos, 0, 0x40, 0) < 0x40) return false;
    if (dos.readUInt16LE(0) !== 0x5a4d) return false; // "MZ"
    const peOffset = dos.readUInt32LE(0x3c);
    const head = Buffer.alloc(0x18);
    if (fs.readSync(fd, head, 0, 0x18, peOffset) < 0x18) return false;
    if (head.readUInt32LE(0) !== 0x00004550) return false; // "PE\0\0"
    const numberOfSections = head.readUInt16LE(6);
    const sizeOfOptionalHeader = head.readUInt16LE(20);
    const sectionTable = peOffset + 0x18 + sizeOfOptionalHeader;
    const want = sectionName.toLowerCase();
    for (let i = 0; i < numberOfSections; i++) {
      const entry = Buffer.alloc(40);
      if (fs.readSync(fd, entry, 0, 40, sectionTable + i * 40) < 40) break;
      const name = entry.subarray(0, 8).toString("latin1").replace(/\0+$/, "").toLowerCase();
      if (name === want) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

function isAuriePatched(exePath) {
  return peHasSection(exePath, ".aurie");
}

/** Undo the exe patch so the game is left exactly as Steam shipped it. */
async function removeEditionModPatch(entry, gameDir, exePath) {
  const spec = entry?.modLoader;
  if (!spec || spec.kind !== "aurie") return;
  if (!gameDir || !exePath || !fs.existsSync(exePath)) return;
  if (!isAuriePatched(exePath)) return;
  const patcherDir = resolveInsideGameDir(gameDir, spec.patcherDest || "");
  const nativeDir = resolveInsideGameDir(gameDir, spec.nativeDllDest || "");
  if (!patcherDir || !nativeDir) return;
  const patcher = path.join(patcherDir, spec.patcherFileName);
  const nativeDll = path.join(nativeDir, spec.nativeDllFileName);
  if (!fs.existsSync(patcher)) return;
  try {
    await runAuriePatcher(patcher, exePath, nativeDll, "remove");
  } catch (err) {
    // Non-fatal: Steam's "Verify integrity of game files" also restores the
    // original executable, so a failed unpatch is recoverable by the user.
    console.warn("Aurie unpatch failed:", err?.message || err);
  }
}

/**
 * Whether the executable is currently locked against writing.
 *
 * Windows maps a running image with FILE_SHARE_READ and no write sharing, so
 * asking for write access to a game that is on screen fails with a sharing
 * violation, which Node surfaces as EBUSY. Anything else — missing file, an
 * unexpected errno — is reported as "not locked" so the caller's real error
 * path handles it rather than this probe inventing a diagnosis.
 */
function isExecutableLocked(exePath) {
  let fd;
  try {
    fd = fs.openSync(exePath, "r+");
    return false;
  } catch (err) {
    const code = err?.code;
    return code === "EBUSY" || code === "EPERM" || code === "EACCES";
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* nothing useful to do */
      }
    }
  }
}

/**
 * Run AuriePatcher headlessly.
 *
 * With four argv entries the patcher takes the non-interactive path and every
 * MessageBox is suppressed (see g_InteractiveInstall in AuriePatcher's
 * main.cpp), so this completes without any dialog for the user to dismiss.
 */
function runAuriePatcher(patcherPath, exePath, nativeDllPath, action) {
  return new Promise((resolve, reject) => {
    const child = spawn(patcherPath, [exePath, nativeDllPath, action], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(out);
        return;
      }
      /*
       * Exit 5 is ERROR_ACCESS_DENIED, which here almost always means the game
       * was launched between the writability check and this call rather than
       * anything to do with file permissions — the patcher rewrites the
       * executable in place and Windows refuses while it is running.
       */
      const hint =
        code === 5
          ? " The game appears to be running — close it and press Install again."
          : "";
      reject(
        new Error(
          `AuriePatcher ${action} failed (exit ${code}).${hint} ${out.trim().slice(0, 300)}`
        )
      );
    });
  });
}

/**
 * Wolfenstein / ET: Legacy self-repair:
 * Ensures the archive's single root folder (if present) is promoted to the game root,
 * and ensures that original game data pk3 files (pak0.pk3, pak1.pk3, pak2.pk3)
 * reside inside the etmain/ directory where the engine looks for them.
 */
async function maybeRepairWolfensteinEtInstall(slug, info, edSlug) {
  if (slug !== "wolfenstein-enemy-territory" && slug !== "wolfenstein" && edSlug !== "et-legacy") return info?.exe;
  const gameDir = info?.dir || (info?.exe ? path.dirname(info.exe) : null);
  if (!gameDir || !fs.existsSync(gameDir)) return info?.exe;

  try {
    // Check for nested etlegacy directory (from older zip unpack without unwrapSingleRoot)
    const entries = await fsp.readdir(gameDir);
    const nestedEtl = entries.find((n) => /^etlegacy/i.test(n));
    if (nestedEtl) {
      const nestedPath = path.join(gameDir, nestedEtl);
      const st = await fsp.stat(nestedPath).catch(() => null);
      if (st && st.isDirectory()) {
        const inner = await fsp.readdir(nestedPath);
        for (const item of inner) {
          const src = path.join(nestedPath, item);
          const dst = path.join(gameDir, item);
          if (!fs.existsSync(dst)) {
            await fsp.rename(src, dst).catch(() => {});
          } else {
            const srcSt = await fsp.stat(src).catch(() => null);
            const dstSt = await fsp.stat(dst).catch(() => null);
            if (srcSt?.isDirectory() && dstSt?.isDirectory()) {
              const subItems = await fsp.readdir(src);
              for (const sub of subItems) {
                const subSrc = path.join(src, sub);
                const subDst = path.join(dst, sub);
                if (!fs.existsSync(subDst)) {
                  await fsp.rename(subSrc, subDst).catch(() => {});
                }
              }
            }
          }
        }
        await fsp.rm(nestedPath, { recursive: true, force: true }).catch(() => {});
      }
    }

    // Ensure etmain exists and move any loose pak files from root into etmain
    const etmainDir = path.join(gameDir, "etmain");
    await fsp.mkdir(etmainDir, { recursive: true });

    for (const pak of ["pak0.pk3", "pak1.pk3", "pak2.pk3"]) {
      const loosePak = path.join(gameDir, pak);
      const targetPak = path.join(etmainDir, pak);
      if (fs.existsSync(loosePak) && !fs.existsSync(targetPak)) {
        await fsp.rename(loosePak, targetPak).catch(() => {});
      }
    }

    // Re-resolve exe if current exe is missing or nested
    let currentExe = info?.exe;
    if (!currentExe || !fs.existsSync(currentExe) || path.dirname(currentExe) !== gameDir) {
      const runnable = findExecutable(gameDir, "etl.exe") || findExecutable(gameDir, "etl");
      if (runnable && fs.existsSync(runnable)) {
        if (edSlug) {
          persistEditionExe(slug, edSlug, currentExe, runnable);
        }
        if (info) info.exe = runnable;
        currentExe = runnable;
      }
    }
    return currentExe;
  } catch (err) {
    console.warn("[wolfenstein-et-repair] skipped:", err?.message || err);
    return info?.exe;
  }
}

/** Slugs that use the Solarus engine and need the D-pad + axis patch. */
const SOLARUS_REPAIR_SLUGS = new Set([
  "the-legend-of-zelda-book-of-mudora",
  "the-legend-of-zelda-xd2-mercuris-chess",
]);

/**
 * Zelda / Solarus engine repair:
 * Fixes Solarus 2.0 gamepad crash bug in data.solarus where joypad axis strings
 * throw Lua errors in arithmetic ("axis % 2"), and maps D-pad buttons to direction
 * controls so they work as movement inputs instead of a dead zone.
 * Applies to any Solarus-based game in SOLARUS_REPAIR_SLUGS.
 */
async function maybeRepairZeldaMudoraInstall(slug, info) {
  if (!SOLARUS_REPAIR_SLUGS.has(slug)) return;
  const gameDir = info?.dir || (info?.exe ? path.dirname(info.exe) : null);
  if (!gameDir || !fs.existsSync(gameDir)) return;

  try {
    let solarusFile = path.join(gameDir, "data.solarus");
    if (!fs.existsSync(solarusFile)) {
      const entries = await fsp.readdir(gameDir).catch(() => []);
      for (const ent of entries) {
        const sub = path.join(gameDir, ent, "data.solarus");
        if (fs.existsSync(sub)) {
          solarusFile = sub;
          break;
        }
      }
    }
    if (!fs.existsSync(solarusFile)) return;

    const content = await fsp.readFile(solarusFile);
    const needsAxisPatch = content.includes(Buffer.from("axis % 2"));
    const controllerMarker = "-- PlayBound Solarus 2 controller bindings";
    const needsButtonPatch = !content.includes(Buffer.from(controllerMarker));
    if (!needsAxisPatch && !needsButtonPatch) return;

    const bin = sevenZipBinary();
    if (!bin) return;

    const tempDir = path.join(app.getPath("temp"), "zbom_patch_" + Date.now());
    await fsp.mkdir(tempDir, { recursive: true });

    await new Promise((resolve) => {
      const cp = spawn(
        bin,
        ["x", solarusFile, "-o" + tempDir, "scripts/menus/*", "scripts/game_manager.lua", "-y"],
        {
        windowsHide: true,
        }
      );
      cp.on("close", () => resolve());
      cp.on("error", () => resolve());
    });

    const patchFiles = ["pause.lua", "warp.lua", "savegames.lua", "language.lua"];
    const menuDir = path.join(tempDir, "scripts", "menus");
    let anyPatched = false;

    for (const pf of patchFiles) {
      const p = path.join(menuDir, pf);
      if (fs.existsSync(p)) {
        let code = await fsp.readFile(p, "utf8");
        const orig = code;
        code = code.replace(/axis % 2/g, "(tonumber(axis) or 0) % 2");
        if (pf === "savegames.lua") {
          code = code.replace(
            /elseif raw_button == "dpup" or raw_button == "dpdown" or raw_button == "dpleft" or raw_button == "dpright" then\s+handled = self:on_command_pressed\("space"\)/g,
            `elseif raw_button == "dpup" then\n    handled = self:on_command_pressed("up")\n  elseif raw_button == "dpdown" then\n    handled = self:on_command_pressed("down")\n  elseif raw_button == "dpleft" then\n    handled = self:on_command_pressed("left")\n  elseif raw_button == "dpright" then\n    handled = self:on_command_pressed("right")`
          );
        }
        if (code !== orig) {
          await fsp.writeFile(p, code, "utf8");
          anyPatched = true;
        }
      }
    }

    // Book of Mudora was migrated to the Solarus 2 quest format without
    // migrating its saved/default controller bindings. Solarus still sees the
    // pad (movement and Start work), but A/B/X/Y are not attached to game
    // commands. Set the standard Xbox/SDL layout each time a save is loaded.
    // Existing keyboard bindings and save data are left untouched.
    const gameManager = path.join(tempDir, "scripts", "game_manager.lua");
    if (fs.existsSync(gameManager)) {
      let code = await fsp.readFile(gameManager, "utf8");
      if (!code.includes(controllerMarker)) {
        const bindings = `${controllerMarker}\n` +
          `game:set_command_joypad_binding("action", "a")\n` +
          `game:set_command_joypad_binding("attack", "b")\n` +
          `game:set_command_joypad_binding("item_1", "x")\n` +
          `game:set_command_joypad_binding("item_2", "y")\n` +
          `game:set_command_joypad_binding("pause", "start")\n\n`;
        const orig = code;
        // `m` flag: match "local game = ..." at the start of ANY line, not
        // just the start of the whole file. Without it, so much as a
        // leading blank line or comment before that line means the anchor
        // never matches, replace() silently no-ops, and the code below used
        // to mark this "patched" and write the file back unchanged anyway —
        // controllerMarker never actually landed, so every future launch
        // silently retried and failed the same way forever. That's why the
        // bindings looked like they should already be applied but weren't.
        code = code.replace(/^(local game = \.\.\.\r?\n)/m, `$1\n${bindings}`);
        if (code !== orig) {
          await fsp.writeFile(gameManager, code, "utf8");
          anyPatched = true;
        } else {
          console.warn(
            "[zelda-mudora-repair] could not find 'local game = ...' in game_manager.lua — controller bindings not patched"
          );
        }
      }
    }

    if (anyPatched) {
      await new Promise((resolve) => {
        const cp = spawn(bin, ["u", solarusFile, "scripts/menus/*", "scripts/game_manager.lua"], {
          cwd: tempDir,
          windowsHide: true,
        });
        cp.on("close", () => resolve());
        cp.on("error", () => resolve());
      });
    }

    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    const errTxt = path.join(path.dirname(solarusFile), "error.txt");
    if (fs.existsSync(errTxt)) {
      const st = await fsp.stat(errTxt).catch(() => null);
      if (st && st.size > 10000) {
        await fsp.writeFile(errTxt, "", "utf8").catch(() => {});
      }
    }
  } catch (err) {
    console.warn("[zbom-repair] Skipped:", err?.message || err);
  }
}

/**
 * Point an installed edition at a different executable and let the flat
 * summary fields follow from it. Local pointer repair only — never touches
 * catalog data.
 *
 * The launch path can come from the flat record when the edition key does not
 * match (an install migrated from before editions existed), so the stale path
 * is the second way in: whichever edition still records it is the one to fix.
 * Nothing writes `game.exe` directly — syncGameInstallSummary derives it from
 * the primary edition, and a hand-set value would only be overwritten.
 * @param {string} slug
 * @param {string} edSlug
 * @param {string} previousExe - The path being replaced.
 * @param {string} exePath
 */
function persistEditionExe(slug, edSlug, previousExe, exePath) {
  try {
    const st = loadState();
    const g = ensureGameInstallRecord(st[slug]);
    const editions = g.editions && typeof g.editions === "object" ? g.editions : {};
    const target =
      editions[edSlug] ||
      Object.values(editions).find((e) => e && typeof e === "object" && e.exe === previousExe);
    if (!target) return;
    target.exe = exePath;
    syncGameInstallSummary(g);
    st[slug] = g;
    saveState(st);
  } catch {
    /* A failed local repair must not stop the launch it was meant to help. */
  }
}

async function maybePrepareRenegadeX(info) {
  if (process.platform !== "win32") return;
  const gameDir = info?.dir || (info?.exe ? path.dirname(info.exe) : null);

  const candidates = [
    path.join(gameDir || "", "redist", "UE3Redist.exe"),
    path.join(gameDir || "", "Binaries", "Redist", "UE3Redist.exe"),
    "C:\\Program Files\\Totem Arts Launcher\\redist\\UE3Redist.exe",
    "C:\\Program Files (x86)\\Totem Arts Launcher\\redist\\UE3Redist.exe",
  ];
  const redistExe = candidates.find((p) => fs.existsSync(p));

  // 1. Pre-seed Totem Arts Launcher config so it never shows the warning
  try {
    const taConfigDir = path.join(process.env.APPDATA || "", "ta-games-launcher");
    const taConfigFile = path.join(taConfigDir, "config.json");
    let cfg = {};
    if (fs.existsSync(taConfigFile)) {
      try {
        cfg = JSON.parse(fs.readFileSync(taConfigFile, "utf8"));
      } catch {}
    } else {
      fs.mkdirSync(taConfigDir, { recursive: true });
    }
    if (!cfg.redist_installed) {
      cfg.redist_installed = true;
      fs.writeFileSync(taConfigFile, JSON.stringify(cfg, null, "\t"), "utf8");
    }
  } catch (err) {
    console.warn("[renegade-x] Could not pre-seed Totem Arts config:", err?.message || err);
  }

  // 2. If UE3Redist.exe is found and not yet executed on this machine, run it silently
  if (redistExe) {
    const markerFile = path.join(
      process.env.LOCALAPPDATA || "",
      "playbound-ue3redist-installed.marker"
    );
    if (!fs.existsSync(markerFile)) {
      try {
        const { spawn } = require("child_process");
        const child = spawn(redistExe, ["/q", "/norestart"], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
        fs.writeFileSync(markerFile, new Date().toISOString(), "utf8");
      } catch (err) {
        console.warn("[renegade-x] UE3Redist silent execution failed:", err?.message || err);
      }
    }
  }
}

module.exports = { listUninstallRegistryDump, isFlightGearAircraftMod, flightGearHomeAddons, findDirContainingFile, flightGearAddonLaunchArgs, resolveModTargetDir, modUsesUserDataFolder, isBaseGameReady, elevationRemembered, rememberElevation, looksLikeElevationRefusal, prepareClassicDosInstall, flattenWadFiles, resolveInsideGameDir, peHasSection, isAuriePatched, removeEditionModPatch, isExecutableLocked, runAuriePatcher, maybeRepairWolfensteinEtInstall, SOLARUS_REPAIR_SLUGS, maybeRepairZeldaMudoraInstall, persistEditionExe, maybePrepareRenegadeX };
