/**
 * PlayBound-managed .NET Desktop Runtime — portable under userData (no admin).
 *
 * Space Station 14's Windows launcher is framework-dependent (net10.0) and
 * expects a system install; Linux/macOS packages already ship their own
 * `dotnet/` folder. We download Microsoft's Windows Desktop Runtime zip into
 * userData and launch with DOTNET_ROOT so the player never hits the download
 * page.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

/** Major version SS14.Launcher currently targets (Launcher.props TargetFramework). */
const DOTNET_MAJOR = 10;

const RELEASE_METADATA_URL =
  "https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json";

let installPromise = null;

function managedDotNetRoot(userDataPath) {
  return path.join(userDataPath, "runtimes", "dotnet");
}

function winRid() {
  return process.arch === "arm64" ? "win-arm64" : "win-x64";
}

function isUsableDotNetRoot(root) {
  if (!root || !fs.existsSync(root)) return false;
  const host = path.join(root, process.platform === "win32" ? "dotnet.exe" : "dotnet");
  if (!fs.existsSync(host)) return false;
  // Prefer Desktop (what the Windows error dialog offers); accept NETCore alone
  // for Avalonia apps that only framework-reference Microsoft.NETCore.App.
  return (
    hasMajorUnder(path.join(root, "shared", "Microsoft.WindowsDesktop.App"), DOTNET_MAJOR) ||
    hasMajorUnder(path.join(root, "shared", "Microsoft.NETCore.App"), DOTNET_MAJOR)
  );
}

function hasMajorUnder(dir, major) {
  if (!fs.existsSync(dir)) return false;
  try {
    return fs.readdirSync(dir).some((name) => name === String(major) || name.startsWith(`${major}.`));
  } catch {
    return false;
  }
}

/**
 * Default system install locations and an already-set DOTNET_ROOT.
 * @returns {string[]}
 */
function candidateSystemRoots() {
  const out = [];
  if (process.env.DOTNET_ROOT) out.push(process.env.DOTNET_ROOT);
  if (process.platform === "win32") {
    out.push(path.join(process.env.ProgramFiles || "C:\\Program Files", "dotnet"));
    out.push(path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "dotnet"));
  } else if (process.platform === "darwin") {
    out.push("/usr/local/share/dotnet");
  } else {
    out.push("/usr/share/dotnet");
    out.push("/usr/lib/dotnet");
  }
  return [...new Set(out.filter(Boolean))];
}

/**
 * True when a system (or DOTNET_ROOT) install already has the major we need.
 * Managed installs are skipped in that case — no need to ship a second copy.
 */
function findSystemDotNetRoot(major = DOTNET_MAJOR) {
  for (const root of candidateSystemRoots()) {
    if (
      hasMajorUnder(path.join(root, "shared", "Microsoft.WindowsDesktop.App"), major) ||
      hasMajorUnder(path.join(root, "shared", "Microsoft.NETCore.App"), major)
    ) {
      return root;
    }
  }
  return null;
}

/**
 * Resolve the Windows Desktop Runtime zip for the latest patch of this major.
 * @param {string} [rid]
 * @returns {Promise<{ url: string, version: string, name: string, hash?: string }>}
 */
async function resolveDesktopRuntimeZip(rid = winRid()) {
  const res = await fetch(RELEASE_METADATA_URL, {
    headers: { Accept: "application/json", "User-Agent": "PlayBound-Launcher" },
  });
  if (!res.ok) throw new Error(`Could not read .NET release metadata (${res.status})`);
  const data = await res.json();
  const latest = String(data["latest-runtime"] || "");
  const releases = Array.isArray(data.releases) ? data.releases : [];
  const release =
    releases.find((r) => String(r["release-version"] || "") === latest) || releases[0];
  if (!release) throw new Error("No .NET 10 releases listed");

  const files = Array.isArray(release.windowsdesktop?.files) ? release.windowsdesktop.files : [];
  const zip = files.find(
    (f) => f && f.rid === rid && typeof f.url === "string" && /\.zip$/i.test(f.name || f.url)
  );
  if (!zip?.url) {
    throw new Error(`No Windows Desktop Runtime zip for ${rid} in .NET ${latest || "10"}`);
  }
  return {
    url: zip.url,
    version: String(release.windowsdesktop?.version || latest || DOTNET_MAJOR),
    name: zip.name || path.basename(zip.url),
    hash: typeof zip.hash === "string" ? zip.hash : undefined,
  };
}

/**
 * Env vars that make an apphost (SS14.Launcher.exe) use our portable runtime.
 * @param {string} root
 * @returns {Record<string, string>}
 */
function launchEnvForRoot(root) {
  return {
    DOTNET_ROOT: root,
    // Prefer our tree over a half-installed system copy that lacks this major.
    DOTNET_MULTILEVEL_LOOKUP: "0",
  };
}

/**
 * @param {object} deps
 * @param {string} deps.userDataPath
 * @param {() => object} deps.loadSettings
 * @param {(s: object) => void} deps.saveSettings
 * @param {(url: string, dest: string) => Promise<void>} deps.downloadTo
 * @param {(payload: object) => void} [deps.onProgress]
 */
function createManagedDotNet(deps) {
  const { userDataPath, loadSettings, saveSettings, downloadTo, onProgress } = deps;

  function getRoot() {
    return managedDotNetRoot(userDataPath);
  }

  function findManagedDotNetRoot() {
    const settings = loadSettings();
    const saved = settings.managedDotNetRoot;
    if (saved && isUsableDotNetRoot(saved)) return saved;
    const current = path.join(getRoot(), "current");
    if (isUsableDotNetRoot(current)) return current;
    if (isUsableDotNetRoot(getRoot())) return getRoot();
    return null;
  }

  function persistManaged(root, version) {
    const settings = loadSettings();
    saveSettings({
      ...settings,
      managedDotNetRoot: root,
      managedDotNetVersion: version || settings.managedDotNetVersion || String(DOTNET_MAJOR),
    });
  }

  async function extractZip(archivePath, destDir) {
    await fsp.mkdir(destDir, { recursive: true });
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
  }

  /**
   * Resolve a root the game can use, installing a portable copy when needed.
   *
   * Non-Windows platforms return ok without a root — SS14's Linux/mac packages
   * already bundle their runtime, and other titles that need this will ship
   * their own until we add those platforms here.
   *
   * @param {{ force?: boolean, major?: number }} [opts]
   * @returns {Promise<{ ok: boolean, root?: string | null, source?: 'system' | 'managed', version?: string, error?: string, alreadyPresent?: boolean, skipped?: boolean }>}
   */
  async function ensureManagedDotNet(opts = {}) {
    if (process.platform !== "win32") {
      return { ok: true, root: null, skipped: true };
    }

    const major = Number(opts.major) || DOTNET_MAJOR;

    if (!opts.force) {
      const system = findSystemDotNetRoot(major);
      if (system) {
        return { ok: true, root: system, source: "system", alreadyPresent: true };
      }
      const managed = findManagedDotNetRoot();
      if (managed) {
        return { ok: true, root: managed, source: "managed", alreadyPresent: true };
      }
    }

    if (installPromise) return installPromise;

    installPromise = (async () => {
      try {
        onProgress?.({
          phase: "dotnet",
          message: `Downloading .NET ${major} Desktop Runtime…`,
        });
        const asset = await resolveDesktopRuntimeZip(winRid());
        const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "playbound-dotnet-"));
        const archivePath = path.join(tmpDir, asset.name || `windowsdesktop-runtime-${winRid()}.zip`);
        try {
          await downloadTo(asset.url, archivePath);
          onProgress?.({
            phase: "dotnet",
            message: `Installing .NET ${asset.version}…`,
          });

          const staging = path.join(tmpDir, "extract");
          await fsp.mkdir(staging, { recursive: true });
          await extractZip(archivePath, staging);

          // Zip contents are the runtime root itself (dotnet.exe + shared/).
          const extractedRoot = isUsableDotNetRoot(staging)
            ? staging
            : fs
                .readdirSync(staging, { withFileTypes: true })
                .filter((d) => d.isDirectory())
                .map((d) => path.join(staging, d.name))
                .find((dir) => isUsableDotNetRoot(dir));

          if (!extractedRoot) {
            throw new Error("Downloaded .NET archive had no usable runtime");
          }

          const target = path.join(getRoot(), "current");
          await fsp.mkdir(getRoot(), { recursive: true });
          await fsp.rm(target, { recursive: true, force: true });
          await fsp.cp(extractedRoot, target, { recursive: true });

          if (!isUsableDotNetRoot(target)) {
            throw new Error(".NET installed but could not verify the runtime");
          }
          persistManaged(target, asset.version);
          onProgress?.({
            phase: "dotnet",
            message: `.NET ${asset.version} ready`,
          });
          return {
            ok: true,
            root: target,
            source: "managed",
            version: asset.version,
          };
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
    const system = findSystemDotNetRoot(DOTNET_MAJOR);
    const managed = findManagedDotNetRoot();
    return {
      installed: Boolean(system || managed),
      source: system ? "system" : managed ? "managed" : null,
      root: system || managed || null,
      version: loadSettings().managedDotNetVersion || String(DOTNET_MAJOR),
      major: DOTNET_MAJOR,
    };
  }

  /**
   * Env to merge into the child process when launching a framework-dependent
   * app against a managed (or non-default) root. System installs at the default
   * path need nothing — the apphost finds them on its own.
   */
  function launchEnv(root) {
    if (!root) return {};
    const systemDefault = path.join(process.env.ProgramFiles || "C:\\Program Files", "dotnet");
    if (path.resolve(root).toLowerCase() === path.resolve(systemDefault).toLowerCase()) {
      return {};
    }
    return launchEnvForRoot(root);
  }

  return {
    DOTNET_MAJOR,
    getRoot,
    findManagedDotNetRoot,
    findSystemDotNetRoot,
    ensureManagedDotNet,
    launchEnv,
    status,
    resolveDesktopRuntimeZip,
  };
}

/**
 * Catalog / slug → major version this title needs, or null.
 * @param {{ slug?: string, needsDotNetMajor?: number | string } | null | undefined} entry
 */
function requiredDotNetMajor(entry) {
  if (!entry) return null;
  const fromField = Number(entry.needsDotNetMajor);
  if (Number.isFinite(fromField) && fromField > 0) return fromField;
  // Windows SS14.Launcher is framework-dependent on net10.0 until they ship a
  // self-contained build; keep working even before the catalog flag syncs.
  if (entry.slug === "space-station-14") return DOTNET_MAJOR;
  return null;
}

module.exports = {
  createManagedDotNet,
  managedDotNetRoot,
  findSystemDotNetRoot,
  isUsableDotNetRoot,
  hasMajorUnder,
  resolveDesktopRuntimeZip,
  launchEnvForRoot,
  requiredDotNetMajor,
  winRid,
  DOTNET_MAJOR,
  RELEASE_METADATA_URL,
};
