/** One PlayBound-managed RetroArch runtime shared by all libretro games. */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const RETROARCH_VERSION = "1.19.1";

/**
 * libretro's build path and core suffix for this platform.
 *
 * Everything here was hardcoded to windows/x86_64 and .dll, so a Mac or Linux
 * player got a Windows RetroArch and Windows cores — silently, since nothing
 * checked. Every DOS-style ROM install and mrboom's RetroArch edition depend
 * on this, and libretro publish all three platforms under the same layout.
 */
const CORES = ["mrboom", "puae", "gambatte", "sameboy", "mgba", "snes9x", "genesis_plus_gx"];

function retroPlatform(platform = process.platform) {
  if (platform === "darwin") return { path: "apple/osx/x86_64", coreExt: "dylib" };
  if (platform === "linux") return { path: "linux/x86_64", coreExt: "so" };
  return { path: "windows/x86_64", coreExt: "dll" };
}

/** RetroArch itself. macOS ships a disk image; the others ship a 7z. */
function retroArchUrl(platform = process.platform) {
  const { path: p } = retroPlatform(platform);
  const file = platform === "darwin" ? "RetroArch.dmg" : "RetroArch.7z";
  return `https://buildbot.libretro.com/stable/${RETROARCH_VERSION}/${p}/${file}`;
}

function coreUrl(core, platform = process.platform) {
  if (!CORES.includes(core)) return null;
  const { path: p, coreExt } = retroPlatform(platform);
  return `https://buildbot.libretro.com/nightly/${p}/latest/${core}_libretro.${coreExt}.zip`;
}

/*
 * Kept as an object because callers and tests read it as a map of every
 * supported core, and now resolved for the running platform rather than fixed
 * to Windows.
 */
const CORE_URLS = Object.fromEntries(CORES.map((c) => [c, coreUrl(c)]));
const RETROARCH_URL = retroArchUrl();

function coreForExtension(ext) {
  const clean = String(ext || "").toLowerCase().replace(/^\./, "");
  if (clean === "gb" || clean === "gbc") return "gambatte";
  if (clean === "gba") return "mgba";
  if (clean === "sfc" || clean === "smc") return "snes9x";
  if (clean === "md" || clean === "gen") return "genesis_plus_gx";
  return null;
}

function managedRetroArchRoot(userDataPath) {
  return path.join(userDataPath, "runtimes", "retroarch");
}

/** Where each platform's package leaves the executable. */
function runtimeBinaryCandidates(current, platform = process.platform) {
  if (platform === "darwin") {
    return [
      path.join(current, "RetroArch.app", "Contents", "MacOS", "RetroArch"),
      path.join(current, "RetroArch"),
    ];
  }
  if (platform === "linux") {
    return [path.join(current, "RetroArch"), path.join(current, "retroarch")];
  }
  return [
    path.join(current, "retroarch.exe"),
    path.join(current, "RetroArch-Win64", "retroarch.exe"),
  ];
}

function runtimeBinary(root, platform = process.platform) {
  const current = path.join(root, "current");
  const candidates = runtimeBinaryCandidates(current, platform);
  return candidates.find((c) => fs.existsSync(c)) || candidates[0];
}

function coreBinary(root, core, platform = process.platform) {
  if (!CORES.includes(core)) return null;
  const { coreExt } = retroPlatform(platform);
  return path.join(
    path.dirname(runtimeBinary(root, platform)),
    "cores",
    `${core}_libretro.${coreExt}`
  );
}

function createManagedRetroArch({ userDataPath, downloadTo, extractArchive, onProgress }) {
  const root = managedRetroArchRoot(userDataPath);
  let runtimeJob = null;
  const coreJobs = new Map();

  async function ensureRuntime() {
    let binary = runtimeBinary(root);
    if (fs.existsSync(binary)) return { ok: true, binary, shared: true, alreadyPresent: true };
    if (runtimeJob) return runtimeJob;
    runtimeJob = (async () => {
      /*
       * Named from the URL, not fixed to .7z: extractArchive dispatches on the
       * extension, and macOS serves a .dmg. A disk image saved as RetroArch.7z
       * would be handed to the 7z branch and fail.
       */
      const ext = RETROARCH_URL.toLowerCase().endsWith(".dmg") ? "dmg" : "7z";
      const temp = path.join(root, ".downloads", `RetroArch-${RETROARCH_VERSION}.${ext}`);
      try {
        onProgress?.({ phase: "retroarch", message: "Installing shared RetroArch runtime…" });
        await fsp.mkdir(path.dirname(temp), { recursive: true });
        await downloadTo(RETROARCH_URL, temp);
        const current = path.join(root, "current");
        await fsp.mkdir(current, { recursive: true });
        await extractArchive(temp, current);
        binary = runtimeBinary(root);
        if (!fs.existsSync(binary)) {
          throw new Error(`RetroArch installed but its executable was not found at ${binary}`);
        }
        return { ok: true, binary, shared: true };
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      } finally {
        await fsp.rm(temp, { force: true }).catch(() => {});
        runtimeJob = null;
      }
    })();
    return runtimeJob;
  }

  async function ensureCore(core) {
    let target = coreBinary(root, core);
    const url = CORE_URLS[core];
    if (!target || !url) return { ok: false, error: `Unsupported RetroArch core: ${core}` };
    if (fs.existsSync(target)) return { ok: true, corePath: target, binary: runtimeBinary(root), alreadyPresent: true };
    if (coreJobs.has(core)) return coreJobs.get(core);
    const job = (async () => {
      const runtime = await ensureRuntime();
      if (!runtime.ok) return runtime;
      target = coreBinary(root, core);
      const { coreExt } = retroPlatform();
      const temp = path.join(root, ".downloads", `${core}_libretro.${coreExt}.zip`);
      try {
        onProgress?.({ phase: "retroarch", message: `Installing ${core.toUpperCase()} core…` });
        await fsp.mkdir(path.dirname(temp), { recursive: true });
        await downloadTo(url, temp);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await extractArchive(temp, path.dirname(target));
        if (!fs.existsSync(target)) throw new Error(`${core} core archive did not contain the expected DLL`);
        return { ok: true, corePath: target, binary: runtime.binary, shared: true };
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      } finally {
        await fsp.rm(temp, { force: true }).catch(() => {});
        coreJobs.delete(core);
      }
    })();
    coreJobs.set(core, job);
    return job;
  }

  return { root: () => root, runtimeBinary: () => runtimeBinary(root), coreBinary: (core) => coreBinary(root, core), ensureRuntime, ensureCore };
}

module.exports = {
  CORES,
  CORE_URLS,
  RETROARCH_URL,
  RETROARCH_VERSION,
  coreBinary,
  coreForExtension,
  coreUrl,
  createManagedRetroArch,
  managedRetroArchRoot,
  retroArchUrl,
  retroPlatform,
  runtimeBinary,
  runtimeBinaryCandidates,
};
