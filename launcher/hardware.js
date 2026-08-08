/**
 * Defensive hardware detection for the PlayBound launcher.
 * Never throws — returns a partial profile with detectionErrors on failure.
 */
const os = require("os");
const path = require("path");
const fs = require("fs");

function mb(bytes) {
  if (bytes == null || !Number.isFinite(Number(bytes))) return null;
  return Math.round(Number(bytes) / (1024 * 1024));
}

function mapArch(arch) {
  const a = String(arch || "").toLowerCase();
  if (a === "x64" || a === "amd64") return "x64";
  if (a === "arm64" || a === "aarch64") return "arm64";
  if (a === "ia32" || a === "x86" || a === "i386") return "x86";
  return "unknown";
}

function mapOsFamily(platform) {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";
  return "unknown";
}

function isVirtualGpu(name) {
  return /virtual|microsoft\s*basic|remote\s*display|citrix|vmware|parallels|hyper-v|qvrdp/i.test(
    String(name || "")
  );
}

function isIntegratedGpu(name) {
  const n = String(name || "");
  if (/rtx|gtx|rx\s*\d{3,4}|quadro|arc\s*a\d+/i.test(n)) return false;
  return /intel\s*(uhd|hd|iris)|amd\s*radeon\s*graphics|apple\s*m[1-4]/i.test(n);
}

function scoreGpu(g) {
  let score = 0;
  const name = g.rawName || "";
  if (g.isVirtual) score -= 1000;
  if (isVirtualGpu(name)) score -= 1000;
  if (g.isIntegrated || isIntegratedGpu(name)) score -= 50;
  if (/nvidia|geforce|rtx|gtx/i.test(name)) score += 200;
  if (/radeon\s*rx|amd.*rx/i.test(name)) score += 180;
  if (/arc\s*a/i.test(name)) score += 120;
  if (g.vramMB) score += Math.min(g.vramMB / 128, 80);
  return score;
}

function pickPrimaryGpu(gpus) {
  if (!gpus.length) return { index: null, confidence: "low" };
  const scored = gpus.map((g, i) => ({ i, score: scoreGpu(g), g }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  let confidence = "medium";
  if (best.g.isVirtual || isVirtualGpu(best.g.rawName)) confidence = "low";
  else if (!second || best.score - second.score > 80) confidence = "high";
  else if (best.g.isIntegrated || isIntegratedGpu(best.g.rawName)) confidence = "low";
  return { index: best.i, confidence };
}

async function trySystemInformation() {
  try {
    // Optional dependency — degrade if missing/broken.
    // eslint-disable-next-line global-require
    const si = require("systeminformation");
    const [cpu, graphics, mem, osInfo, disks, fsSize] = await Promise.all([
      si.cpu().catch(() => null),
      si.graphics().catch(() => null),
      si.mem().catch(() => null),
      si.osInfo().catch(() => null),
      si.diskLayout().catch(() => []),
      si.fsSize().catch(() => []),
    ]);

    const gpus = (graphics?.controllers || [])
      .map((c) => {
        const rawName = String(c.model || c.name || "").trim();
        if (!rawName) return null;
        return {
          rawName,
          manufacturer: c.vendor || null,
          model: c.model || null,
          vramMB: c.vram != null && Number(c.vram) > 0 ? Math.round(Number(c.vram)) : null,
          driverVersion: c.driverVersion || null,
          vendorId: c.vendorId != null ? String(c.vendorId) : null,
          deviceId: c.deviceId != null ? String(c.deviceId) : null,
          isIntegrated: isIntegratedGpu(rawName),
          isVirtual: isVirtualGpu(rawName),
        };
      })
      .filter(Boolean);

    let totalAvailableMB = null;
    if (Array.isArray(fsSize) && fsSize.length) {
      totalAvailableMB = fsSize.reduce((sum, d) => sum + (mb(d.available) || 0), 0);
    }

    const diskTypes = new Map();
    for (const d of disks || []) {
      const t = String(d.type || d.interfaceType || "").toLowerCase();
      let kind = "unknown";
      if (/nvme/.test(t) || /nvme/i.test(d.name || "")) kind = "nvme";
      else if (/ssd|solid/.test(t)) kind = "ssd";
      else if (/hdd|hard/.test(t)) kind = "hdd";
      diskTypes.set(String(d.device || d.name || ""), kind);
    }

    return {
      cpu,
      gpus,
      mem,
      osInfo,
      fsSize: fsSize || [],
      totalAvailableMB,
      diskTypes,
      source: "systeminformation",
    };
  } catch (err) {
    return { error: err?.message || String(err) };
  }
}

function fallbackCpu() {
  const cpus = os.cpus() || [];
  const first = cpus[0];
  return {
    rawName: first?.model || "Unknown CPU",
    manufacturer: null,
    model: first?.model || null,
    arch: os.arch(),
    cores: cpus.length || null,
    threads: cpus.length || null,
    baseFrequencyGHz: first?.speed ? first.speed / 1000 : null,
    features: [],
  };
}

function cpuFromSystemInformation(siCpu) {
  if (!siCpu) return null;
  const brand = String(siCpu.brand || "").trim();
  const manufacturer = String(siCpu.manufacturer || "").trim();
  let rawName = "";
  if (brand) {
    const mfgToken = manufacturer.split(/\s+/)[0] || "";
    rawName =
      mfgToken && !brand.toLowerCase().includes(mfgToken.toLowerCase())
        ? `${manufacturer} ${brand}`.trim()
        : brand;
  } else if (manufacturer) {
    rawName = manufacturer;
  }
  if (!rawName || /^unknown/i.test(rawName)) return null;
  return {
    rawName,
    manufacturer: manufacturer || null,
    model: brand || manufacturer || null,
    arch: siCpu.arch || os.arch(),
    cores: siCpu.physicalCores || siCpu.cores || null,
    threads: siCpu.cores || null,
    baseFrequencyGHz: siCpu.speed ? Number(siCpu.speed) : null,
    features: Array.isArray(siCpu.flags)
      ? siCpu.flags.slice(0, 32)
      : typeof siCpu.flags === "string"
        ? siCpu.flags.split(/\s+/).slice(0, 32)
        : [],
  };
}

async function tryElectronGpu(app) {
  if (!app || typeof app.getGPUInfo !== "function") return [];
  try {
    const info = await app.getGPUInfo("complete");
    const devices = info?.gpuDevice || info?.auxAttributes?.gpuDevice || [];
    const list = Array.isArray(devices) ? devices : [];
    return list
      .map((d) => {
        const rawName = String(d.deviceString || d.description || "").trim();
        if (!rawName) return null;
        return {
          rawName,
          manufacturer: d.driverVendor || null,
          model: d.deviceString || null,
          vramMB: null,
          driverVersion: d.driverVersion || null,
          vendorId: d.vendorId != null ? String(d.vendorId) : null,
          deviceId: d.deviceId != null ? String(d.deviceId) : null,
          isIntegrated: isIntegratedGpu(rawName),
          isVirtual: isVirtualGpu(rawName),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function resolveInstallDrive(gameDir, fsSize) {
  if (!gameDir || !Array.isArray(fsSize) || !fsSize.length) return null;
  try {
    const resolved = path.resolve(gameDir);
    const root = path.parse(resolved).root;
    const match =
      fsSize.find((d) => {
        const mount = String(d.mount || d.fs || "");
        return mount && resolved.toLowerCase().startsWith(mount.toLowerCase());
      }) ||
      fsSize.find((d) => String(d.mount || "").toLowerCase() === root.toLowerCase());
    if (!match) {
      return {
        mount: root,
        freeMB: null,
        totalMB: null,
        type: "unknown",
      };
    }
    let type = "unknown";
    const t = String(match.type || "").toLowerCase();
    if (/nvme/.test(t)) type = "nvme";
    else if (/ssd/.test(t)) type = "ssd";
    else if (/hdd/.test(t)) type = "hdd";
    return {
      mount: match.mount || root,
      freeMB: mb(match.available),
      totalMB: mb(match.size),
      type,
    };
  } catch {
    return null;
  }
}

/**
 * Node/Electron-only profile when systeminformation is unavailable or detect throws.
 * @param {{ app?: import('electron').App, gameDir?: string, reason?: string }} opts
 */
async function minimalHardwareFallback(opts = {}) {
  const errors = [];
  if (opts.reason) errors.push(String(opts.reason));
  const cpu = fallbackCpu();
  if (!cpu.rawName || /^unknown/i.test(cpu.rawName)) {
    errors.push("cpu: os.cpus() returned no model");
  }
  let gpus = [];
  if (opts.app) {
    gpus = await tryElectronGpu(opts.app);
  }
  if (!gpus.length) errors.push("gpu: not detected");
  const { index: primaryGpuIndex, confidence: primaryGpuConfidence } = pickPrimaryGpu(gpus);
  return {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    os: {
      family: mapOsFamily(process.platform),
      name: null,
      version: os.release() || null,
      arch: mapArch(process.arch || os.arch()),
      bitness: process.arch === "ia32" ? 32 : 64,
    },
    cpu,
    gpus,
    primaryGpuIndex,
    primaryGpuConfidence,
    memory: {
      totalMB: mb(os.totalmem()),
      availableMB: null,
    },
    storage: {},
    detectionErrors: errors,
  };
}

/**
 * @param {{ app?: import('electron').App, gameDir?: string }} opts
 */
async function detectHardware(opts = {}) {
  try {
    const errors = [];
    const collectedAt = new Date().toISOString();

    const si = await trySystemInformation();
    if (si.error) errors.push(`systeminformation: ${si.error}`);

    let gpus = si.gpus || [];
    if (!gpus.length && opts.app) {
      const electronGpus = await tryElectronGpu(opts.app);
      if (electronGpus.length) gpus = electronGpus;
      else errors.push("gpu: no controllers detected");
    } else if (!gpus.length) {
      errors.push("gpu: no controllers detected");
    }

    let cpu = cpuFromSystemInformation(si.cpu);
    if (!cpu) {
      cpu = fallbackCpu();
      errors.push(si.cpu ? "cpu: empty SI brand, using os.cpus" : "cpu: using os.cpus fallback");
    }

    const { index: primaryGpuIndex, confidence: primaryGpuConfidence } = pickPrimaryGpu(gpus);

    const memTotal = si.mem?.total != null ? mb(si.mem.total) : mb(os.totalmem());
    const memAvail = si.mem?.available != null ? mb(si.mem.available) : null;
    if (memTotal == null) errors.push("memory: total unknown");

    const family = mapOsFamily(process.platform);
    const osName = si.osInfo?.distro || si.osInfo?.codename || null;
    const osVersion = si.osInfo?.release || os.release() || null;

    const installDrive = resolveInstallDrive(opts.gameDir, si.fsSize || []);

    if (opts.gameDir) {
      try {
        fs.accessSync(path.parse(path.resolve(opts.gameDir)).root);
      } catch {
        /* ignore */
      }
    }

    return {
      schemaVersion: 1,
      collectedAt,
      os: {
        family,
        name: osName,
        version: osVersion,
        arch: mapArch(process.arch || os.arch()),
        bitness: process.arch === "ia32" ? 32 : 64,
      },
      cpu,
      gpus,
      primaryGpuIndex,
      primaryGpuConfidence,
      memory: {
        totalMB: memTotal ?? mb(os.totalmem()),
        availableMB: memAvail,
      },
      storage: {
        totalAvailableMB: si.totalAvailableMB ?? null,
        installDrive,
      },
      detectionErrors: errors,
    };
  } catch (err) {
    return minimalHardwareFallback({
      app: opts.app,
      gameDir: opts.gameDir,
      reason: `detectHardware: ${err?.message || err}`,
    });
  }
}

module.exports = { detectHardware, pickPrimaryGpu, minimalHardwareFallback };
