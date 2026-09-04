/**
 * PlayBound-managed DOSBox Staging — one portable install under userData
 * that every DOS game can share (TES: Arena official, later DOS titles).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

const DOSBOX_REPO = "dosbox-staging/dosbox-staging";
let installPromise = null;

function managedDosBoxRoot(userDataPath) {
  return path.join(userDataPath, "runtimes", "dosbox-staging");
}

function dosBoxBinaryNames() {
  if (process.platform === "win32") return ["dosbox-staging.exe", "dosbox.exe"];
  if (process.platform === "darwin") return ["DOSBox Staging", "dosbox-staging", "dosbox"];
  return ["dosbox-staging", "dosbox"];
}

function isUsableDosBoxBinary(filePath) {
  return Boolean(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile());
}

function findDosBoxBinaryUnder(root) {
  if (!root || !fs.existsSync(root)) return null;
  const names = dosBoxBinaryNames();
  const pending = [{ dir: root, depth: 0 }];
  while (pending.length) {
    const current = pending.shift();
    if (!current || current.depth > 6) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current.dir, entry.name);
      if (entry.isFile() && names.some((n) => n.toLowerCase() === entry.name.toLowerCase())) {
        if (isUsableDosBoxBinary(full)) return full;
      }
      if (entry.isDirectory() && entry.name !== "__MACOSX") {
        pending.push({ dir: full, depth: current.depth + 1 });
      }
    }
  }
  return null;
}

/**
 * Mount the folder that contains the DOS exe as C: so data files sit next to it.
 * TES: Arena's A.EXE lives in ARENA/, not the parent install folder.
 * @param {string} dosExePath
 * @param {string[]} [programArgs]
 * @returns {{ args: string[], cwd: string }}
 */
function dosBoxLaunchSpec(dosExePath, programArgs = []) {
  const exeDir = path.dirname(dosExePath);
  const exeName = path.basename(dosExePath);
  const mountPath = exeDir.replace(/\\/g, "/");
  const quoted = mountPath.includes(" ") ? `"${mountPath}"` : mountPath;
  const safeProgramArgs = programArgs.map((value) => {
    const arg = String(value);
    if (!arg || /[&|<>^\r\n]/.test(arg)) throw new Error("Unsafe DOS launch argument");
    return /\s/.test(arg) ? `"${arg.replace(/"/g, "")}"` : arg;
  });
  const command = [exeName, ...safeProgramArgs].join(" ");
  return {
    args: [
      "-noprimaryconf",
      "-nolocalconf",
      "-c",
      `mount c ${quoted}`,
      "-c",
      "c:",
      "-c",
      command,
      "-c",
      "exit",
    ],
    cwd: exeDir,
  };
}

function hostAssetPattern() {
  if (process.platform === "darwin") return /macos|osx|darwin/i;
  if (process.platform === "linux") return /linux/i;
  return /windows|win64|win32|msvc/i;
}

/**
 * Archive formats this platform can actually open.
 *
 * Matching only .zip meant macOS and Linux found nothing at all: DOSBox
 * Staging publishes a .dmg for macOS and a .tar.xz for Linux, and ships a zip
 * only for Windows. So every DOS game — Daggerfall, TES: Arena — failed on
 * those platforms at "No DOSBox Staging zip", before the game itself was ever
 * reached.
 *
 * Deliberately narrower than "anything": a Windows -setup.exe is an installer
 * to click through, not an archive to unpack, and picking it would swap a
 * clear failure for a stuck one.
 */
function hostArchivePattern() {
  if (process.platform === "darwin") return /\.dmg$/i;
  if (process.platform === "linux") return /\.(tar\.xz|tar\.gz|tgz|zip)$/i;
  return /\.zip$/i;
}

function pickDosBoxAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const osPat = hostAssetPattern();
  const archivePat = hostArchivePattern();
  const archPat =
    process.arch === "arm64" || process.arch === "aarch64" ? /arm64|aarch64/i : /x86_64|x64|amd64/i;
  const usable = list.filter(
    (a) => archivePat.test(a.name || "") && osPat.test(a.name || "")
  );
  const ranked = usable
    .filter((a) => !/debug|pdb|symbols/i.test(a.name || ""))
    .sort((a, b) => {
      const aArch = archPat.test(a.name) ? 1 : 0;
      const bArch = archPat.test(b.name) ? 1 : 0;
      return bArch - aArch;
    });
  return ranked[0] || usable[0] || null;
}

async function resolveDosBoxDownload() {
  const res = await fetch(`https://api.github.com/repos/${DOSBOX_REPO}/releases/latest`, {
    headers: { "user-agent": "playbound-launcher", accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${DOSBOX_REPO}`);
  const release = await res.json();
  const asset = pickDosBoxAsset(release.assets);
  if (!asset?.browser_download_url) {
    throw new Error(
      `No DOSBox Staging build this launcher can unpack for ${process.platform} in ${release.tag_name || "latest"}`
    );
  }
  return {
    url: asset.browser_download_url,
    name: asset.name,
    version: release.tag_name || "latest",
  };
}

function createManagedDosBox(deps) {
  const { userDataPath, loadSettings, saveSettings, downloadTo, onProgress } = deps;

  function getRoot() {
    return managedDosBoxRoot(userDataPath);
  }

  function findManagedDosBoxBinary() {
    const settings = loadSettings();
    const saved = settings.managedDosBoxBinary;
    if (saved && isUsableDosBoxBinary(saved)) return saved;
    return findDosBoxBinaryUnder(getRoot());
  }

  function persistManaged(bin) {
    const settings = loadSettings();
    saveSettings({
      ...settings,
      managedDosBoxBinary: bin,
      managedDosBoxHome: path.dirname(bin),
    });
  }

  async function extractArchive(archivePath, destDir) {
    await fsp.mkdir(destDir, { recursive: true });
    if (process.platform === "win32") {
      const ps = `
        $ErrorActionPreference = 'Stop'
        Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force
      `;
      const r = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
        { windowsHide: true, encoding: "utf8", timeout: 600000 }
      );
      if (r.status !== 0) {
        throw new Error((r.stderr || r.stdout || "Expand-Archive failed").toString().slice(0, 400));
      }
      return;
    }
    /*
     * macOS ships DOSBox as a disk image, which tar cannot read. Mount it
     * read-only and without a Finder window, copy what is inside, then detach
     * — leaving it mounted would keep a volume on the player's desktop.
     */
    if (process.platform === "darwin" && /\.dmg$/i.test(archivePath)) {
      const mountPoint = path.join(path.dirname(destDir), "dosbox-dmg-mount");
      await fsp.mkdir(mountPoint, { recursive: true });
      const attach = spawnSync(
        "hdiutil",
        ["attach", "-nobrowse", "-readonly", "-mountpoint", mountPoint, archivePath],
        { encoding: "utf8", timeout: 600000 }
      );
      if (attach.status !== 0) {
        throw new Error(
          (attach.stderr || attach.stdout || "hdiutil attach failed").toString().slice(0, 400)
        );
      }
      try {
        const copy = spawnSync("cp", ["-R", `${mountPoint}/.`, destDir], {
          encoding: "utf8",
          timeout: 600000,
        });
        if (copy.status !== 0) {
          throw new Error((copy.stderr || copy.stdout || "copy failed").toString().slice(0, 400));
        }
      } finally {
        spawnSync("hdiutil", ["detach", mountPoint], { encoding: "utf8", timeout: 120000 });
      }
      return;
    }

    const r = spawnSync("tar", ["-xf", archivePath, "-C", destDir], {
      encoding: "utf8",
      timeout: 600000,
    });
    if (r.status !== 0) {
      throw new Error((r.stderr || r.stdout || "tar extract failed").toString().slice(0, 400));
    }
  }

  /**
   * @param {{ force?: boolean }} [opts]
   * @returns {Promise<{ ok: boolean, dosBoxBin?: string, error?: string, alreadyPresent?: boolean }>}
   */
  async function ensureManagedDosBox(opts = {}) {
    if (!opts.force) {
      const existing = findManagedDosBoxBinary();
      if (existing) {
        persistManaged(existing);
        return { ok: true, dosBoxBin: existing, alreadyPresent: true };
      }
    }
    if (installPromise) return installPromise;

    installPromise = (async () => {
      try {
        onProgress?.({ phase: "dosbox", message: "Downloading DOSBox…" });
        const root = getRoot();
        await fsp.mkdir(root, { recursive: true });
        const dl = await resolveDosBoxDownload();
        const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "playbound-dosbox-"));
        const archivePath = path.join(tmpDir, dl.name || "dosbox-staging.zip");
        try {
          await downloadTo(dl.url, archivePath);
          onProgress?.({ phase: "dosbox", message: "Installing DOSBox…" });
          const staging = path.join(tmpDir, "extract");
          await fsp.mkdir(staging, { recursive: true });
          await extractArchive(archivePath, staging);

          await fsp.mkdir(root, { recursive: true });
          const top = fs.readdirSync(staging, { withFileTypes: true }).filter(
            (d) => d.isDirectory() && d.name !== "__MACOSX"
          );
          const files = fs.readdirSync(staging, { withFileTypes: true }).filter((d) => d.isFile());
          if (top.length === 1 && files.length === 0) {
            const from = path.join(staging, top[0].name);
            const to = path.join(root, "current");
            await fsp.rm(to, { recursive: true, force: true });
            await fsp.cp(from, to, { recursive: true });
          } else {
            const to = path.join(root, "current");
            await fsp.rm(to, { recursive: true, force: true });
            await fsp.cp(staging, to, { recursive: true });
          }

          const dosBoxBin = findDosBoxBinaryUnder(root);
          if (!dosBoxBin) throw new Error("DOSBox installed but the executable was not found");
          persistManaged(dosBoxBin);
          onProgress?.({ phase: "dosbox", message: "DOSBox ready" });
          return { ok: true, dosBoxBin };
        } finally {
          try {
            await fsp.rm(tmpDir, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        return { ok: false, error: err?.message || String(err) };
      } finally {
        installPromise = null;
      }
    })();

    return installPromise;
  }

  function status() {
    const dosBoxBin = findManagedDosBoxBinary();
    return {
      installed: Boolean(dosBoxBin),
      dosBoxBin: dosBoxBin || null,
      home: loadSettings().managedDosBoxHome || getRoot(),
    };
  }

  return {
    getRoot,
    findManagedDosBoxBinary,
    ensureManagedDosBox,
    status,
  };
}

module.exports = {
  createManagedDosBox,
  dosBoxLaunchSpec,
  findDosBoxBinaryUnder,
  managedDosBoxRoot,
  pickDosBoxAsset,
  DOSBOX_REPO,
};
