/**
 * DirectDraw compatibility for legacy Windows titles (FreeTrain).
 *
 * FreeTrain uses Managed DirectX-style CoCreateInstance on CLSID_DirectDraw
 * ({E1211353-8E94-11D1-8808-00C04FC2C602}). Modern Windows often returns
 * 80040154 (class not registered). Putting dgVoodoo2's MS/x86 DDRAW.dll next
 * to the game is not enough for COM — CoCreateInstance reads the registry.
 *
 * Seamless fix (no admin):
 *   1. Cache dgVoodoo2 from the official GitHub release.
 *   2. Copy MS/x86 DirectX DLLs into the game folder.
 *   3. Write a sensible dgVoodoo.conf beside FreeTrain.exe.
 *   4. Register CLSID_DirectDraw under HKCU pointing at that local DDRAW.dll
 *      so CoCreateInstance resolves without elevating.
 *
 * dgVoodoo2 redistribution of individual components with a game is allowed by
 * Dege (see VOGONS / project README). Attribution stays in the install note.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const https = require("https");
const http = require("http");

const DGVOODOO_VERSION = "2_87_4";
const DGVOODOO_ZIP_URL =
  "https://github.com/dege-diosg/dgVoodoo2/releases/download/v2.87.4/dgVoodoo2_87_4.zip";

/** Classic DirectDraw COM class FreeTrain's DirectDraw.NET constructs. */
const CLSID_DIRECTDRAW = "{E1211353-8E94-11D1-8808-00C04FC2C602}";

const MS_X86_DLLS = ["DDraw.dll", "D3DImm.dll", "D3D8.dll", "D3D9.dll"];

const FREETRAIN_SLUGS = new Set(["freetrain", "free-train"]);

function isFreeTrainSlug(slug) {
  return FREETRAIN_SLUGS.has(String(slug || "").toLowerCase());
}

function needsDirectDrawWrapper(entry, slug) {
  if (entry?.needsDirectDrawWrapper) return true;
  return isFreeTrainSlug(slug || entry?.slug);
}

function cacheRoot(userDataPath) {
  return path.join(userDataPath, "runtimes", "dgvoodoo", DGVOODOO_VERSION);
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const get = url.startsWith("https:") ? https.get : http.get;
    const req = get(url, { headers: { "user-agent": "playbound-launcher" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(destPath, () => {});
        downloadFile(res.headers.location, destPath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`Download failed (${res.statusCode}) for ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    });
    req.on("error", (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

function extractZip(zipPath, destDir) {
  // Prefer PowerShell Expand-Archive on Windows; fall back to tar on others.
  if (process.platform === "win32") {
    const ps = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true, encoding: "utf8" }
    );
    if (ps.status !== 0) {
      throw new Error(ps.stderr || ps.stdout || "Expand-Archive failed");
    }
    return;
  }
  const tar = spawnSync("tar", ["-xf", zipPath, "-C", destDir], { encoding: "utf8" });
  if (tar.status !== 0) {
    throw new Error(tar.stderr || "tar extract failed");
  }
}

function findMsX86Dir(extractedRoot) {
  const candidates = [
    path.join(extractedRoot, "MS", "x86"),
    path.join(extractedRoot, "MS", "X86"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "DDraw.dll")) || fs.existsSync(path.join(dir, "ddraw.dll"))) {
      return dir;
    }
  }
  // Nested single-root zip
  try {
    for (const name of fs.readdirSync(extractedRoot)) {
      const nested = path.join(extractedRoot, name, "MS", "x86");
      if (fs.existsSync(path.join(nested, "DDraw.dll")) || fs.existsSync(path.join(nested, "ddraw.dll"))) {
        return nested;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeDgVoodooConf(gameDir) {
  const confPath = path.join(gameDir, "dgVoodoo.conf");
  const body = `[General]
OutputAPI = d3d11_fl11_0
FastVideoMemoryAccess = true

[GeneralExt]
; PlayBound FreeTrain defaults — keep windowed-friendly on modern displays.

[DirectX]
VRAM = 256
dgVoodooWatermark = false
AppControlledScreenMode = true

[DirectXExt]
; Empty — rely on defaults for DirectDraw titles.
`;
  fs.writeFileSync(confPath, body, "utf8");
}

function registerDirectDrawComHkcu(ddrawPath) {
  if (process.platform !== "win32") return { ok: true, skipped: true };
  const abs = path.resolve(ddrawPath);
  if (!fs.existsSync(abs)) {
    return { ok: false, error: `DDRAW.dll missing at ${abs}` };
  }
  // Per-user COM registration — no elevation. CoCreateInstance prefers HKCU.
  const script = `
$ErrorActionPreference = 'Stop'
$clsid = '${CLSID_DIRECTDRAW}'
$path = 'HKCU:\\Software\\Classes\\CLSID\\' + $clsid + '\\InprocServer32'
New-Item -Path $path -Force | Out-Null
Set-ItemProperty -Path $path -Name '(default)' -Value '${abs.replace(/'/g, "''")}'
Set-ItemProperty -Path $path -Name 'ThreadingModel' -Value 'Both'
`;
  const ps = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    windowsHide: true,
    encoding: "utf8",
  });
  if (ps.status !== 0) {
    return { ok: false, error: (ps.stderr || ps.stdout || "HKCU COM registration failed").trim() };
  }
  return { ok: true };
}

/**
 * @param {{ userDataPath: string, downloadTo?: Function, sendProgress?: Function }} deps
 */
function createDirectDrawWrapper(deps) {
  const userDataPath = deps.userDataPath;
  const sendProgress = deps.sendProgress || (() => {});

  async function ensureDgVoodooExtracted() {
    const root = cacheRoot(userDataPath);
    const zipPath = path.join(root, `dgVoodoo${DGVOODOO_VERSION}.zip`);
    const extracted = path.join(root, "extracted");
    const marker = path.join(root, "ready.marker");

    if (fs.existsSync(marker) && findMsX86Dir(extracted)) {
      return { ok: true, msX86: findMsX86Dir(extracted) };
    }

    await fsp.mkdir(root, { recursive: true });
    sendProgress({ phase: "compatibility", message: "Downloading DirectDraw compatibility layer…" });

    if (!fs.existsSync(zipPath)) {
      const tmp = `${zipPath}.partial`;
      if (typeof deps.downloadTo === "function") {
        await deps.downloadTo(DGVOODOO_ZIP_URL, tmp);
      } else {
        await downloadFile(DGVOODOO_ZIP_URL, tmp);
      }
      await fsp.rename(tmp, zipPath);
    }

    await fsp.rm(extracted, { recursive: true, force: true });
    await fsp.mkdir(extracted, { recursive: true });
    sendProgress({ phase: "compatibility", message: "Preparing DirectDraw compatibility layer…" });
    extractZip(zipPath, extracted);

    const msX86 = findMsX86Dir(extracted);
    if (!msX86) {
      return { ok: false, error: "dgVoodoo zip did not contain MS/x86 DLLs" };
    }
    fs.writeFileSync(marker, new Date().toISOString(), "utf8");
    return { ok: true, msX86 };
  }

  async function installWrapperIntoGameDir(gameDir) {
    if (process.platform !== "win32") {
      return { ok: true, skipped: true, reason: "windows-only" };
    }
    if (!gameDir || !fs.existsSync(gameDir)) {
      return { ok: false, error: "Game directory missing" };
    }

    const prepared = await ensureDgVoodooExtracted();
    if (!prepared.ok) return prepared;

    for (const name of MS_X86_DLLS) {
      const src = path.join(prepared.msX86, name);
      const srcAlt = path.join(prepared.msX86, name.toLowerCase());
      const from = fs.existsSync(src) ? src : fs.existsSync(srcAlt) ? srcAlt : null;
      if (!from) continue;
      await fsp.copyFile(from, path.join(gameDir, name));
    }

    writeDgVoodooConf(gameDir);

    const ddraw = path.join(gameDir, "DDraw.dll");
    const ddrawAlt = path.join(gameDir, "ddraw.dll");
    const ddrawPath = fs.existsSync(ddraw) ? ddraw : ddrawAlt;
    const reg = registerDirectDrawComHkcu(ddrawPath);
    if (!reg.ok) {
      return { ok: false, error: reg.error };
    }

    return { ok: true, ddrawPath };
  }

  /**
   * Install wrapper into the game folder and ensure COM resolves.
   * Safe to call on every install/play — copies are idempotent.
   */
  async function ensureForGame(gameDir, opts = {}) {
    const slug = opts.slug || "";
    const entry = opts.entry || null;
    if (!needsDirectDrawWrapper(entry, slug)) {
      return { ok: true, skipped: true };
    }
    try {
      return await installWrapperIntoGameDir(gameDir);
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  return {
    ensureForGame,
    needsDirectDrawWrapper,
    isFreeTrainSlug,
    CLSID_DIRECTDRAW,
    DGVOODOO_ZIP_URL,
  };
}

module.exports = {
  createDirectDrawWrapper,
  needsDirectDrawWrapper,
  isFreeTrainSlug,
  CLSID_DIRECTDRAW,
  DGVOODOO_ZIP_URL,
  MS_X86_DLLS,
  writeDgVoodooConf,
  registerDirectDrawComHkcu,
  findMsX86Dir,
};
