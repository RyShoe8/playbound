/**
 * DirectDraw compatibility for legacy Windows titles (FreeTrain).
 *
 * FreeTrain uses Managed DirectX-style CoCreateInstance on CLSID_DirectDraw
 * ({E1211353-8E94-11D1-8808-00C04FC2C602}). Modern Windows often returns
 * 80040154 (class not registered). Putting dgVoodoo2's MS/x86 DDRAW.dll next
 * to the game is not enough for COM — CoCreateInstance reads the registry.
 *
 * Seamless fix (no admin):
 *   1. Prefer MS/x86 DLLs already beside the game, then bundled launcher
 *      resources (never the full GitHub zip — Windows Defender flags it as
 *      Trojan:Win32/Kepavll!rfn and Expand-Archive fails silently).
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

/** Optional PlayBound mirror of only MS/x86 — never the full Defender-flagged zip. */
const DGVOODOO_MS_X86_MIRROR_URL =
  process.env.PLAYBOUND_DGVOODOO_MS_X86_URL ||
  "https://mirror.playbound.club/launcher-packages/runtimes/dgvoodoo/2_87_4/ms-x86.zip";

/** Classic DirectDraw COM class FreeTrain's DirectDraw.NET constructs. */
const CLSID_DIRECTDRAW = "{E1211353-8E94-11D1-8808-00C04FC2C602}";

const MS_X86_DLLS = ["DDraw.dll", "D3DImm.dll", "D3D8.dll", "D3D9.dll"];

const FREETRAIN_SLUGS = new Set(["freetrain", "free-train"]);

const AV_BLOCK_MSG =
  "Windows Defender (or another antivirus) blocked the DirectDraw compatibility files. " +
  "PlayBound ships only the MS/x86 DLLs — if this keeps failing, allowlist the FreeTrain " +
  "folder under PlayBound\\Games, then try Play again.";

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

/** Packaged with the launcher — preferred over any network download. */
function bundledMsX86Dir() {
  const candidates = [
    path.join(process.resourcesPath || "", "dgvoodoo-ms-x86"),
    path.join(__dirname, "..", "resources", "dgvoodoo-ms-x86"),
  ];
  for (const dir of candidates) {
    if (dirHasMsX86Dlls(dir)) return dir;
  }
  return null;
}

function dirHasMsX86Dlls(dir) {
  if (!dir || !fs.existsSync(dir)) return false;
  return (
    fs.existsSync(path.join(dir, "DDraw.dll")) || fs.existsSync(path.join(dir, "ddraw.dll"))
  );
}

function msX86DirFromGameDir(gameDir) {
  if (!gameDir || !fs.existsSync(gameDir)) return null;
  if (dirHasMsX86Dlls(gameDir)) return gameDir;
  return null;
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

function looksLikeAvBlock(stderr, stdout) {
  const text = `${stderr || ""}\n${stdout || ""}`;
  return /virus|trojan|malware|potentially unwanted|quarantine|Defender|Operation did not complete successfully/i.test(
    text
  );
}

function extractZip(zipPath, destDir) {
  // Prefer PowerShell Expand-Archive on Windows; fall back to tar on others.
  if (process.platform === "win32") {
    const ps = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true, encoding: "utf8" }
    );
    if (ps.status !== 0) {
      if (looksLikeAvBlock(ps.stderr, ps.stdout)) {
        throw new Error(AV_BLOCK_MSG);
      }
      throw new Error((ps.stderr || ps.stdout || "Expand-Archive failed").trim());
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
    extractedRoot,
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
      const flat = path.join(extractedRoot, name);
      if (dirHasMsX86Dlls(flat)) return flat;
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
  /*
   * Per-user COM registration — no elevation. CoCreateInstance prefers HKCU.
   *
   * FreeTrain is 32-bit. On 64-bit Windows, a 32-bit process reads the COM
   * class from Wow6432Node; writing only the native CLSID path leaves
   * CoCreateInstance with 80040154 even when DDraw.dll sits beside the exe.
   */
  const dll = abs.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
$clsid = '${CLSID_DIRECTDRAW}'
$dll = '${dll}'
$paths = @(
  ('HKCU:\\Software\\Classes\\CLSID\\' + $clsid + '\\InprocServer32'),
  ('HKCU:\\Software\\Classes\\Wow6432Node\\CLSID\\' + $clsid + '\\InprocServer32')
)
foreach ($path in $paths) {
  New-Item -Path $path -Force | Out-Null
  Set-ItemProperty -Path $path -Name '(default)' -Value $dll
  Set-ItemProperty -Path $path -Name 'ThreadingModel' -Value 'Both'
}
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
 * @param {{ userDataPath: string, downloadTo?: Function, sendProgress?: Function, msX86MirrorUrl?: string }} deps
 */
function createDirectDrawWrapper(deps) {
  const userDataPath = deps.userDataPath;
  const sendProgress = deps.sendProgress || (() => {});
  const mirrorUrl = deps.msX86MirrorUrl || DGVOODOO_MS_X86_MIRROR_URL;

  async function resolveMsX86Source(gameDir) {
    const fromGame = msX86DirFromGameDir(gameDir);
    if (fromGame) return { ok: true, msX86: fromGame, source: "game-dir" };

    const bundled = bundledMsX86Dir();
    if (bundled) return { ok: true, msX86: bundled, source: "bundled" };

    // Optional small mirror zip of MS/x86 only — never the full GitHub release.
    const root = cacheRoot(userDataPath);
    const zipPath = path.join(root, "ms-x86.zip");
    const extracted = path.join(root, "extracted-ms-x86");
    const marker = path.join(root, "ms-x86.ready");

    if (fs.existsSync(marker) && findMsX86Dir(extracted)) {
      return { ok: true, msX86: findMsX86Dir(extracted), source: "mirror-cache" };
    }

    await fsp.mkdir(root, { recursive: true });
    sendProgress({
      phase: "compatibility",
      message: "Downloading DirectDraw compatibility layer…",
    });

    try {
      if (!fs.existsSync(zipPath)) {
        const tmp = `${zipPath}.partial`;
        if (typeof deps.downloadTo === "function") {
          await deps.downloadTo(mirrorUrl, tmp);
        } else {
          await downloadFile(mirrorUrl, tmp);
        }
        await fsp.rename(tmp, zipPath);
      }

      await fsp.rm(extracted, { recursive: true, force: true });
      await fsp.mkdir(extracted, { recursive: true });
      sendProgress({
        phase: "compatibility",
        message: "Preparing DirectDraw compatibility layer…",
      });
      extractZip(zipPath, extracted);

      const msX86 = findMsX86Dir(extracted);
      if (!msX86) {
        return {
          ok: false,
          error:
            "DirectDraw compatibility package did not contain MS/x86 DLLs. " + AV_BLOCK_MSG,
        };
      }
      fs.writeFileSync(marker, new Date().toISOString(), "utf8");
      return { ok: true, msX86, source: "mirror" };
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (looksLikeAvBlock(msg, "") || /virus|trojan|Defender/i.test(msg)) {
        return { ok: false, error: AV_BLOCK_MSG };
      }
      // Bundled resources should normally exist; mirror is a fallback.
      return {
        ok: false,
        error:
          msg ||
          "Could not prepare the DirectDraw compatibility layer. Reinstall FreeTrain from PlayBound, or allowlist the game folder.",
      };
    }
  }

  async function installWrapperIntoGameDir(gameDir, opts = {}) {
    if (process.platform !== "win32") {
      return { ok: true, skipped: true, reason: "windows-only" };
    }
    if (!gameDir || !fs.existsSync(gameDir)) {
      return { ok: false, error: "Game directory missing" };
    }

    const prepared = await resolveMsX86Source(gameDir);
    if (!prepared.ok) return prepared;

    // Already present beside the exe — still ensure conf + COM registration.
    if (prepared.source !== "game-dir") {
      for (const name of MS_X86_DLLS) {
        const src = path.join(prepared.msX86, name);
        const srcAlt = path.join(prepared.msX86, name.toLowerCase());
        const from = fs.existsSync(src) ? src : fs.existsSync(srcAlt) ? srcAlt : null;
        if (!from) continue;
        await fsp.copyFile(from, path.join(gameDir, name));
      }
    }

    if (!dirHasMsX86Dlls(gameDir)) {
      return {
        ok: false,
        error:
          "DirectDraw compatibility DLLs are missing beside FreeTrain.exe. " + AV_BLOCK_MSG,
      };
    }

    writeDgVoodooConf(gameDir);

    const ddraw = path.join(gameDir, "DDraw.dll");
    const ddrawAlt = path.join(gameDir, "ddraw.dll");
    const ddrawPath = fs.existsSync(ddraw) ? ddraw : ddrawAlt;
    /*
     * Unit tests must not rewrite HKCU CLSID_DirectDraw — a temp gameDir
     * would otherwise leave CoCreateInstance pointing at a deleted path and
     * FreeTrain would crash with 80040154 until the next real Play.
     */
    if (!opts.skipComRegistration) {
      const reg = registerDirectDrawComHkcu(ddrawPath);
      if (!reg.ok) {
        return { ok: false, error: reg.error };
      }
    }

    return { ok: true, ddrawPath, source: prepared.source };
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
      return await installWrapperIntoGameDir(gameDir, opts);
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (looksLikeAvBlock(msg, "")) {
        return { ok: false, error: AV_BLOCK_MSG };
      }
      return { ok: false, error: msg };
    }
  }

  return {
    ensureForGame,
    needsDirectDrawWrapper,
    isFreeTrainSlug,
    CLSID_DIRECTDRAW,
    resolveMsX86Source,
    bundledMsX86Dir,
    DGVOODOO_MS_X86_MIRROR_URL: mirrorUrl,
  };
}

module.exports = {
  createDirectDrawWrapper,
  needsDirectDrawWrapper,
  isFreeTrainSlug,
  CLSID_DIRECTDRAW,
  MS_X86_DLLS,
  AV_BLOCK_MSG,
  DGVOODOO_MS_X86_MIRROR_URL,
  writeDgVoodooConf,
  registerDirectDrawComHkcu,
  findMsX86Dir,
  bundledMsX86Dir,
  dirHasMsX86Dlls,
  extractZip,
  looksLikeAvBlock,
};
