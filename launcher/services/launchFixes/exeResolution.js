"use strict";

const fs = require("fs");
const path = require("path");

const tesArena = {
  slugs: ["tes-arena"],
  resolve(state, h) {
    const { launchPath, info, edSlug, slug } = state;
    if (edSlug === "opentesarena") return state;
    if (path.basename(launchPath || "").toUpperCase() === "A.EXE") return state;
    const roots = [info?.dir, info?.dir && path.join(info.dir, "ARENA"), launchPath && path.dirname(launchPath)].filter(Boolean);
    const dosExe = roots.map((root) => path.join(root, "A.EXE")).find((candidate) => {
      try { return fs.statSync(candidate).isFile(); } catch { return false; }
    });
    if (!dosExe) {
      const err = new Error("Arena's A.EXE is missing from this install. Reinstall The Elder Scrolls: Arena in PlayBound to restore its DOS game files.");
      err.code = "ARENA_FILES_MISSING";
      throw err;
    }
    h.persistEditionExe(slug, edSlug, launchPath, dosExe);
    return { ...state, launchPath: dosExe, info: { ...info, exe: dosExe } };
  },
};

/*
 * Launch-path fixes: games whose installer leaves a starter/updater exe that
 * drops join arguments, so the real engine binary is chosen here. Moved
 * verbatim from playGameInner. Each `resolve` receives the launch state and
 * returns it (possibly changed); helpers that need Electron are injected.
 *
 * @param {{ launchPath: string, args: string[], info: object, edSlug: string, join: object|null }} state
 * @param {{ findNamedPortableExe: Function, findExecutable: Function, persistEditionExe: Function,
 *           firstRunnableOnPlatform: Function, ensureUnixExecutable: Function }} h
 */

/*
 * Unvanquished ships a Qt updater (UnvanquishedUpdater.exe) that downloads
 * the game engine (daemon.exe). If the engine binary exists in the install
 * folder, prefer launching daemon.exe directly. If only the updater exists,
 * pass `-connect <host:port>` instead of idTech's `+connect <host:port>` so
 * the updater's CLI parser does not error with "too many command line arguments".
 */
const unvanquished = {
  slugs: ["unvanquished"],
  resolve(state, h) {
    let { launchPath, args, info } = state;
    const { edSlug, join, slug } = state;

    const daemonExe =
      h.findNamedPortableExe(info.dir, "daemon.exe") ||
      h.findNamedPortableExe(info.dir, "daemon64.exe") ||
      h.findNamedPortableExe(info.dir, "unvanquished.exe") ||
      h.findNamedPortableExe(info.dir, "daemon") ||
      (info.dir ? h.findExecutable(info.dir, "daemon") : null);

    if (daemonExe && (/updater/i.test(path.basename(launchPath)) || launchPath !== daemonExe)) {
      h.persistEditionExe(slug, edSlug, launchPath, daemonExe);
      launchPath = daemonExe;
      info = { ...info, exe: daemonExe };
    } else if (/updater/i.test(path.basename(launchPath)) && join?.host && join?.port) {
      const hostPort = `${join.host}:${join.port}`;
      args = args.filter((a) => a !== "+connect" && a !== hostPort);
      if (!args.includes("-connect")) {
        args.push("-connect", hostPort);
      }
    }

    return { ...state, launchPath, args, info };
  },
};

/*
 * Xonotic ships a starter launcher (xonotic.exe) that detects architecture
 * and spawns the real engine (xonotic-x86_64-sdl.exe / xonotic-x86_64-gl.exe),
 * but drops CLI arguments like `+connect`. Target the native DarkPlaces engine
 * binary directly so join arguments reach the engine.
 */
const xonotic = {
  slugs: ["xonotic"],
  resolve(state, h) {
    let { launchPath, args, info } = state;
    const { edSlug, join, slug } = state;

    /*
     * One zip, every platform's engine in it.
     *
     * Xonotic ships the Windows .exe, the Linux ELF and the macOS bundle side
     * by side, and this list is walked in order until a file exists — so on a
     * Windows box whose release did not carry one of the .exe names above,
     * `xonotic-linux64-sdl` was found, written into the install record by
     * persistEditionExe, and spawned. That is the "Couldn't start
     * xonotic-linux64-sdl (file missing or not runnable)" a player sees, and
     * it survives restarts because the wrong answer was saved.
     *
     * The names stay ordered by preference; the platform filter decides which
     * of them this machine is allowed to adopt.
     */
    const xonoticExe = h.firstRunnableOnPlatform([
      h.findNamedPortableExe(info.dir, "xonotic-x86_64-sdl.exe"),
      h.findNamedPortableExe(info.dir, "xonotic-x86_64-gl.exe"),
      h.findNamedPortableExe(info.dir, "xonotic-x86-sdl.exe"),
      h.findNamedPortableExe(info.dir, "xonotic-x86-gl.exe"),
      h.findNamedPortableExe(info.dir, "xonotic-x86_64.exe"),
      h.findNamedPortableExe(info.dir, "xonotic-x64-sdl.exe"),
      h.findNamedPortableExe(info.dir, "xonotic-x64-gl.exe"),
      h.findNamedPortableExe(info.dir, "xonotic-linux64-sdl"),
      h.findNamedPortableExe(info.dir, "xonotic-linux64-glx"),
      h.findNamedPortableExe(info.dir, "xonotic-linux64-gl"),
      info.dir ? h.findExecutable(info.dir, "xonotic.*sdl|xonotic.*gl|xonotic-x86") : null,
    ]);

    if (xonoticExe && (path.basename(launchPath).toLowerCase() === "xonotic.exe" || launchPath !== xonoticExe)) {
      h.persistEditionExe(slug, edSlug, launchPath, xonoticExe);
      launchPath = h.ensureUnixExecutable(xonoticExe);
      info = { ...info, exe: launchPath };
    } else if (xonoticExe) {
      launchPath = h.ensureUnixExecutable(launchPath);
    }

    return { ...state, launchPath, args, info };
  },
};

/*
 * Freedoom multiplayer party joins require Zandronum rather than GZDoom,
 * because GZDoom does not support dedicated client/server `+connect`.
 * If joining a party or Zandronum exists in the install folder, prefer
 * launching zandronum.exe.
 */
const freedoomZandronum = {
  slugs: ["freedoom","zandronum"],
  resolve(state, h) {
    let { launchPath, args, info } = state;
    const { edSlug, join, slug } = state;

    // Same shape as Xonotic's: the bare name below the .exe is the Linux
    // build, and adopting it on Windows saves an unrunnable path.
    const zandronumExe = h.firstRunnableOnPlatform([
      h.findNamedPortableExe(info.dir, "zandronum.exe"),
      h.findNamedPortableExe(info.dir, "zandronum"),
      info.dir ? h.findExecutable(info.dir, "zandronum") : null,
    ]);

    if (zandronumExe && (launchPath !== zandronumExe || /gzdoom/i.test(path.basename(launchPath)))) {
      h.persistEditionExe(slug, edSlug, launchPath, zandronumExe);
      launchPath = zandronumExe;
      info = { ...info, exe: zandronumExe };
    }

    const ed = String(edSlug || info.editionSlug || "").toLowerCase();
    const isPhase1 = ed.includes("phase-1") || ed.includes("phase1") || ed === "1";
    const isFreeDm = ed.includes("freedm") || ed.includes("dm");
    const iwadName = isPhase1 ? "freedoom1.wad" : isFreeDm ? "freedm.wad" : "freedoom2.wad";

    if (!args.includes("-iwad")) {
      const iwadCandidate = info.dir
        ? [
            path.join(info.dir, iwadName),
            path.join(path.dirname(launchPath), iwadName),
            h.findNamedPortableExe(info.dir, iwadName),
          ].find((p) => p && fs.existsSync(p))
        : null;
      if (iwadCandidate) {
        args.unshift("-iwad", iwadCandidate);
      } else {
        args.unshift("-iwad", iwadName);
      }
    }

    return { ...state, launchPath, args, info };
  },
};

/* Shattered Pixel Dungeon: prefer the native Windows launcher over the jar. */
const shatteredPixelDungeon = {
  slugs: ["shattered-pixel-dungeon"],
  resolve(state, h) {
    let { launchPath } = state;
    const { info, edSlug, slug } = state;
    if (h.platform !== "win32" || edSlug !== "official" || !info.dir) return state;
    const nativeLauncher = h.findExecutable(info.dir, "Shattered Pixel Dungeon.exe");
    if (
      nativeLauncher &&
      path.basename(nativeLauncher).toLowerCase() === "shattered pixel dungeon.exe" &&
      launchPath !== nativeLauncher
    ) {
      h.persistEditionExe(slug, edSlug, launchPath, nativeLauncher);
      launchPath = nativeLauncher;
    }
    return { ...state, launchPath };
  },
};

/*
 * YSoccer. Joining a hosted match needs the PlayBound online jar — the
 * portable ysoccer.exe ignores --connect — so a join without it fails the
 * launch with a clear message. Otherwise, copies installed before the native
 * launcher was preferred are repaired to launch ysoccer.exe.
 */
const ysoccer = {
  slugs: ["ysoccer"],
  resolve(state, h) {
    let { launchPath, info } = state;
    const { args, join, edSlug, slug } = state;
    const joiningHostedYs = Boolean(join?.host && join?.port) || args.some((a) => /--connect/i.test(a));
    if (joiningHostedYs) {
      const onlineJar = h.findYSoccerOnlineJar(info.dir);
      if (!onlineJar) {
        const message =
          "YSoccer needs the PlayBound online build to join a party. Remove YSoccer from your library and install again from the party or game page.";
        h.reportLaunchFailed("YSOCCER_OFFLINE_BUILD", message, "resolve-install");
        const offlineErr = new Error(message);
        offlineErr.__launchFailedReported = true;
        throw offlineErr;
      }
      if (launchPath !== onlineJar) {
        h.persistEditionExe(slug, edSlug, launchPath, onlineJar);
        launchPath = onlineJar;
        info = { ...info, exe: onlineJar };
      }
    } else if (/\.jar$/i.test(launchPath)) {
      const nativeLauncher = h.findNamedPortableExe(info.dir, "ysoccer.exe");
      if (nativeLauncher) {
        launchPath = nativeLauncher;
        try {
          const st = h.loadState();
          const installed = h.ensureGameInstallRecord(st[slug]);
          if (installed.editions?.[edSlug]) installed.editions[edSlug].exe = nativeLauncher;
          installed.exe = nativeLauncher;
          installed.dir = info.dir;
          h.syncGameInstallSummary(installed);
          st[slug] = installed;
          h.saveState(st);
        } catch {
          /* The current launch is still valid if the optional local repair fails. */
        }
      }
    }
    return { ...state, launchPath, info };
  },
};

module.exports = [tesArena, unvanquished, xonotic, freedoomZandronum, shatteredPixelDungeon, ysoccer];
