/** One PlayBound-managed RetroArch runtime shared by all libretro games. */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const RETROARCH_VERSION = "1.19.1";
const RETROARCH_URL =
  `https://buildbot.libretro.com/stable/${RETROARCH_VERSION}/windows/x86_64/RetroArch.7z`;
const CORE_URLS = {
  mrboom: "https://buildbot.libretro.com/nightly/windows/x86_64/latest/mrboom_libretro.dll.zip",
  puae: "https://buildbot.libretro.com/nightly/windows/x86_64/latest/puae_libretro.dll.zip",
};

function managedRetroArchRoot(userDataPath) {
  return path.join(userDataPath, "runtimes", "retroarch");
}

function runtimeBinary(root) {
  const current = path.join(root, "current");
  const direct = path.join(current, "retroarch.exe");
  if (fs.existsSync(direct)) return direct;
  const wrapped = path.join(current, "RetroArch-Win64", "retroarch.exe");
  return fs.existsSync(wrapped) ? wrapped : direct;
}

function coreBinary(root, core) {
  if (!Object.prototype.hasOwnProperty.call(CORE_URLS, core)) return null;
  return path.join(path.dirname(runtimeBinary(root)), "cores", `${core}_libretro.dll`);
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
      const temp = path.join(root, ".downloads", `RetroArch-${RETROARCH_VERSION}.7z`);
      try {
        onProgress?.({ phase: "retroarch", message: "Installing shared RetroArch runtime…" });
        await fsp.mkdir(path.dirname(temp), { recursive: true });
        await downloadTo(RETROARCH_URL, temp);
        const current = path.join(root, "current");
        await fsp.mkdir(current, { recursive: true });
        await extractArchive(temp, current);
        binary = runtimeBinary(root);
        if (!fs.existsSync(binary)) throw new Error("RetroArch installed but retroarch.exe was not found");
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
      const temp = path.join(root, ".downloads", `${core}_libretro.dll.zip`);
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

module.exports = { CORE_URLS, RETROARCH_URL, RETROARCH_VERSION, coreBinary, createManagedRetroArch, managedRetroArchRoot, runtimeBinary };
