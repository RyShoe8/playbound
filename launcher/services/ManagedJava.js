/**
 * PlayBound-managed Temurin JDK — portable install under userData (no system PATH).
 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

const JAVA_MAJOR = "17";

let installPromise = null;

function isWindowsAppsStub(filePath) {
  const normalized = String(filePath || "").replace(/\//g, "\\").toLowerCase();
  return normalized.includes("\\windowsapps\\");
}

function isUsableJavaBinary(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  if (isWindowsAppsStub(filePath)) return false;
  try {
    execFileSync(filePath, ["-version"], {
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

function preferJavawBeside(found) {
  if (process.platform !== "win32" || !found || !/java\.exe$/i.test(found)) return found;
  const javaw = path.join(path.dirname(found), "javaw.exe");
  return fs.existsSync(javaw) ? javaw : found;
}

function managedJavaRoot(userDataPath) {
  return path.join(userDataPath, "runtimes", "java");
}

/**
 * Find javaw/java under a JDK/JRE root or a parent that contains versioned folders.
 * @param {string} root
 * @returns {string | null}
 */
function findJavaBinaryUnder(root) {
  if (!root || !fs.existsSync(root)) return null;
  const isWin = process.platform === "win32";
  const names = isWin ? ["javaw.exe", "java.exe"] : ["java"];

  const tryBinDir = (binDir) => {
    for (const name of names) {
      const p = path.join(binDir, name);
      if (isUsableJavaBinary(p)) return preferJavawBeside(p);
    }
    return null;
  };

  const direct = tryBinDir(path.join(root, "bin"));
  if (direct) return direct;

  // Adoptium zip extracts to e.g. jdk-17.0.x+y/
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return null;
  }
  entries.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
  for (const d of entries) {
    const found = tryBinDir(path.join(root, d.name, "bin"));
    if (found) return found;
  }
  return null;
}

function adoptiumOsArch() {
  let osName = "windows";
  if (process.platform === "darwin") osName = "mac";
  else if (process.platform === "linux") osName = "linux";

  let arch = "x64";
  const a = process.arch;
  if (a === "arm64" || a === "aarch64") arch = "aarch64";
  else if (a === "ia32" || a === "x86") arch = "x86";

  return { os: osName, arch };
}

function adoptiumDownloadUrl() {
  const { os: osName, arch } = adoptiumOsArch();
  // API redirects to the archive (.zip / .tar.gz). Follow redirects in fetch.
  return `https://api.adoptium.net/v3/binary/latest/${JAVA_MAJOR}/ga/${osName}/${arch}/jdk/hotspot/normal/eclipse?project=jdk`;
}

function archiveExtension() {
  return process.platform === "win32" ? ".zip" : ".tar.gz";
}

/**
 * @param {object} deps
 * @param {string} deps.userDataPath
 * @param {() => object} deps.loadSettings
 * @param {(s: object) => void} deps.saveSettings
 * @param {(url: string, dest: string) => Promise<void>} deps.downloadTo
 * @param {(payload: object) => void} [deps.onProgress]
 */
function createManagedJava(deps) {
  const { userDataPath, loadSettings, saveSettings, downloadTo, onProgress } = deps;

  function getRoot() {
    return managedJavaRoot(userDataPath);
  }

  function findManagedJavaBinary() {
    const settings = loadSettings();
    const savedBin = settings.managedJavaBinary;
    if (savedBin && isUsableJavaBinary(savedBin)) return preferJavawBeside(savedBin);

    const savedHome = settings.managedJavaHome;
    if (savedHome) {
      const fromHome = findJavaBinaryUnder(savedHome);
      if (fromHome) return fromHome;
    }

    return findJavaBinaryUnder(getRoot());
  }

  function persistManaged(javaBin) {
    const home = path.dirname(path.dirname(javaBin)); // .../jdk-x/bin/java → jdk-x
    const settings = loadSettings();
    saveSettings({
      ...settings,
      managedJavaHome: home,
      managedJavaBinary: javaBin,
    });
  }

  async function extractArchive(archivePath, destDir) {
    await fsp.mkdir(destDir, { recursive: true });
    if (process.platform === "win32") {
      // Expand-Archive needs .zip; -Force overwrites
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

    const r = spawnSync("tar", ["-xzf", archivePath, "-C", destDir], {
      encoding: "utf8",
      timeout: 600000,
    });
    if (r.status !== 0) {
      throw new Error((r.stderr || r.stdout || "tar extract failed").toString().slice(0, 400));
    }
  }

  /**
   * Ensure a managed JVM is installed. Concurrent callers share one install.
   * @param {{ force?: boolean }} [opts]
   * @returns {Promise<{ ok: boolean, javaBin?: string, error?: string, alreadyPresent?: boolean }>}
   */
  async function ensureManagedJava(opts = {}) {
    if (!opts.force) {
      const existing = findManagedJavaBinary();
      if (existing) {
        persistManaged(existing);
        return { ok: true, javaBin: existing, alreadyPresent: true };
      }
    }

    if (installPromise) return installPromise;

    installPromise = (async () => {
      try {
        onProgress?.({ phase: "java", message: "Downloading Java 17…" });
        const root = getRoot();
        await fsp.mkdir(root, { recursive: true });

        const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "playbound-java-"));
        const archivePath = path.join(tmpDir, `temurin-${JAVA_MAJOR}${archiveExtension()}`);
        try {
          await downloadTo(adoptiumDownloadUrl(), archivePath);
          onProgress?.({ phase: "java", message: "Installing Java 17…" });

          // Fresh extract into a staging folder, then replace root contents carefully
          const staging = path.join(tmpDir, "extract");
          await fsp.mkdir(staging, { recursive: true });
          await extractArchive(archivePath, staging);

          // Move extracted JDK folder(s) into managed root
          await fsp.mkdir(root, { recursive: true });
          const top = fs.readdirSync(staging, { withFileTypes: true }).filter((d) => d.isDirectory());
          if (!top.length) {
            // Sometimes archive is flat
            const flatBin = findJavaBinaryUnder(staging);
            if (!flatBin) throw new Error("Downloaded Java archive had no JVM binary");
            // Copy entire staging into root/current
            const target = path.join(root, "current");
            await fsp.rm(target, { recursive: true, force: true });
            await fsp.cp(staging, target, { recursive: true });
          } else {
            for (const d of top) {
              const from = path.join(staging, d.name);
              const to = path.join(root, d.name);
              await fsp.rm(to, { recursive: true, force: true });
              await fsp.cp(from, to, { recursive: true });
            }
          }

          const javaBin = findJavaBinaryUnder(root);
          if (!javaBin) throw new Error("Java installed but could not verify the binary");
          persistManaged(javaBin);
          onProgress?.({ phase: "java", message: "Java 17 ready" });
          return { ok: true, javaBin };
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
    const javaBin = findManagedJavaBinary();
    return {
      installed: Boolean(javaBin),
      javaBin: javaBin || null,
      home: loadSettings().managedJavaHome || getRoot(),
      version: JAVA_MAJOR,
    };
  }

  return {
    JAVA_MAJOR,
    getRoot,
    findManagedJavaBinary,
    ensureManagedJava,
    status,
    isUsableJavaBinary,
    adoptiumDownloadUrl,
  };
}

module.exports = {
  createManagedJava,
  findJavaBinaryUnder,
  isUsableJavaBinary,
  managedJavaRoot,
  JAVA_MAJOR,
};
