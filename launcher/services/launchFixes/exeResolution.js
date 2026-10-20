"use strict";

const fs = require("fs");
const path = require("path");

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

module.exports = [unvanquished, xonotic, freedoomZandronum];
