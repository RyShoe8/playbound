const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const Platform = require("../platform");
const { shouldLaunchThroughDosBox, dosExecutableMessage } = require("./executableFormat");
const { dosBoxLaunchSpec } = require("./ManagedDosBox");

const JAVA_MISSING_MSG =
  "Java 17+ is required to run this game. PlayBound can install it for you — try Play again, or install Java from Settings.";

const JAVA_EARLY_EXIT_MSG =
  "The game exited immediately. Install or update Java 17+ from https://adoptium.net/ then try again.";

/**
 * GameLauncher abstraction that handles executing games based on capabilities
 * instead of hardcoded .exe assumptions.
 */
class GameLauncher {
  /** Optional: () => string | null — PlayBound-managed Temurin path. */
  static managedJavaResolver = null;
  /** Optional: () => string | null — PlayBound-managed DOSBox Staging path. */
  static managedDosBoxResolver = null;

  /**
   * Locate a verified javaw (Windows) or java for launching .jar games.
   * Prefers PlayBound-managed JDK, then PATH / JAVA_HOME / common vendors.
   * @returns {string | null}
   */
  static resolveJavaBinary() {
    if (typeof this.managedJavaResolver === "function") {
      try {
        const managed = this.managedJavaResolver();
        if (managed && isUsableJavaBinary(managed)) return preferJavawBeside(managed, process.platform === "win32");
      } catch {
        /* ignore */
      }
    }

    const isWin = process.platform === "win32";
    const names = isWin ? ["javaw.exe", "java.exe"] : ["java"];

    for (const name of names) {
      for (const found of whichBinaryAll(isWin ? name.replace(/\.exe$/i, "") : name)) {
        const preferred = preferJavawBeside(found, isWin);
        if (isUsableJavaBinary(preferred)) return preferred;
      }
    }

    const home = process.env.JAVA_HOME;
    if (home) {
      for (const name of names) {
        const p = path.join(home, "bin", name);
        if (isUsableJavaBinary(p)) return p;
      }
    }

    if (isWin) {
      const fromCommon = findJavaInCommonWindowsPaths();
      if (fromCommon) return fromCommon;
    }

    return null;
  }

  /** @returns {string} Absolute path to a verified Java binary. */
  static assertJavaReady() {
    const bin = this.resolveJavaBinary();
    if (!bin) {
      const err = new Error(JAVA_MISSING_MSG);
      err.code = "JAVA_MISSING";
      throw err;
    }
    return bin;
  }

  /**
   * If exe is play.cmd/bat next to a jar (legacy github-jar installs), prefer the jar.
   * @param {string} exePath
   * @returns {string}
   */
  static preferJarBesideLauncher(exePath) {
    if (!exePath || !/\.(cmd|bat|sh)$/i.test(exePath)) return exePath;
    const dir = path.dirname(exePath);
    const mindustry = path.join(dir, "Mindustry.jar");
    if (fs.existsSync(mindustry)) return mindustry;
    try {
      const jars = fs.readdirSync(dir).filter((f) => /\.jar$/i.test(f));
      if (jars.length === 1) return path.join(dir, jars[0]);
      const preferred = jars.find((f) => /^mindustry/i.test(f));
      if (preferred) return path.join(dir, preferred);
    } catch {
      /* ignore */
    }
    return exePath;
  }

  static resolveDosBoxBinary() {
    if (typeof this.managedDosBoxResolver === "function") {
      try {
        const managed = this.managedDosBoxResolver();
        if (managed && fs.existsSync(managed)) return managed;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  /**
   * Spawns a game process detached and returns the child process.
   * @param {string} targetPath - Path to the executable, .jar, or .app bundle
   * @param {string[]} args - Additional arguments
   * @param {{ needsDosBox?: boolean, env?: Record<string, string | undefined> }} [opts]
   * @returns {import("child_process").ChildProcess}
   */
  static spawnGame(targetPath, args = [], opts = {}) {
    const env =
      opts.env && typeof opts.env === "object"
        ? { ...process.env, ...opts.env }
        : undefined;
    const launchPath = this.preferJarBesideLauncher(targetPath);

    if (/\.jar$/i.test(launchPath)) {
      const javaBin = this.assertJavaReady();
      const child = spawn(javaBin, ["-jar", launchPath, ...args], {
        cwd: path.dirname(launchPath),
        detached: true,
        stdio: "ignore",
        env,
        /*
         * false, for the same reason the native branch below says so.
         *
         * windowsHide sets STARTF_USESHOWWINDOW with SW_HIDE in the child's
         * STARTUPINFO, and LWJGL/GLFW — which every libGDX game uses — honours
         * nCmdShow when it creates its window. So `true` did not just hide a
         * console, it started the game with its window hidden: the process ran,
         * held a lock on the install folder so uninstall failed with "resource
         * busy or locked", and nothing ever appeared on screen.
         *
         * Nothing is lost by dropping it. resolveJavaBinary already prefers
         * javaw.exe, which has no console to hide; only a java.exe fallback
         * shows one, and a stray console beats an invisible game.
         */
        windowsHide: false,
      });
      return child;
    }

    if (/\.(cmd|bat)$/i.test(launchPath)) {
      const err = new Error(
        process.platform === "darwin"
          ? "This install points at a Windows script. Use Locate to pick the .app or .jar instead."
          : "This install points at a .bat/.cmd launcher. Use Locate to pick the game .exe or .jar instead."
      );
      err.code = "SHELL_LAUNCH_BLOCKED";
      throw err;
    }

    // macOS play.sh is a helper for Terminal; Play launches the jar/binary directly.
    if (/\.sh$/i.test(launchPath)) {
      const preferred = this.preferJarBesideLauncher(launchPath);
      if (preferred !== launchPath) return this.spawnGame(preferred, args, opts);
    }

    /*
     * DOS-era images never start natively: CreateProcess rejects them and
     * libuv reports EACCES. Wrap them in the shared DOSBox Staging runtime
     * instead of failing Play.
     */
    if (shouldLaunchThroughDosBox(launchPath, { needsDosBox: opts.needsDosBox })) {
      const dosBoxBin = this.resolveDosBoxBinary();
      if (!dosBoxBin) {
        const err = new Error(dosExecutableMessage(path.basename(launchPath)));
        err.code = "DOSBOX_MISSING";
        throw err;
      }
      const spec = dosBoxLaunchSpec(launchPath, args);
      return spawn(dosBoxBin, spec.args, {
        cwd: spec.cwd,
        detached: true,
        stdio: "ignore",
        env,
        windowsHide: false,
        shell: false,
      });
    }

    const launchCommand = Platform.getGameLaunchCommand(launchPath);
    const cmd = launchCommand[0];
    const finalArgs = [...launchCommand.slice(1), ...args];

    // For .app bundles, cwd should be the parent of the bundle, not Contents/.
    const cwd = String(launchPath).endsWith(".app")
      ? path.dirname(launchPath)
      : path.dirname(launchPath);

    return spawn(cmd, finalArgs, {
      cwd,
      detached: true,
      stdio: "ignore",
      env,
      // false so GUI games (Godot/OpenCiv3) can show a window; jars keep console hidden above.
      windowsHide: false,
      shell: false,
    });
  }
}

function isWindowsAppsStub(filePath) {
  const normalized = String(filePath || "").replace(/\//g, "\\").toLowerCase();
  return normalized.includes("\\windowsapps\\");
}

function preferJavawBeside(found, isWin) {
  if (!isWin || !found || !/java\.exe$/i.test(found)) return found;
  const javaw = path.join(path.dirname(found), "javaw.exe");
  return fs.existsSync(javaw) ? javaw : found;
}

function isUsableJavaBinary(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  if (isWindowsAppsStub(filePath)) return false;
  try {
    // `-version` writes to stderr on most JVMs; accept either stream / ignore content.
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

/** All PATH hits for a binary name (Windows `where` can return several). */
function whichBinaryAll(name) {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(cmd, [name], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return String(out || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && fs.existsSync(l));
  } catch {
    return [];
  }
}

function findJavaInCommonWindowsPaths() {
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs") : null,
  ].filter(Boolean);

  const vendors = [
    "Eclipse Adoptium",
    "Microsoft",
    "Amazon Corretto",
    "Zulu",
    "Java",
    "AdoptOpenJDK",
  ];

  for (const root of roots) {
    for (const vendor of vendors) {
      const base = path.join(root, vendor);
      if (!fs.existsSync(base)) continue;
      let entries = [];
      try {
        entries = fs.readdirSync(base, { withFileTypes: true });
      } catch {
        continue;
      }
      entries = entries
        .filter((d) => d.isDirectory())
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
      for (const d of entries) {
        for (const name of ["javaw.exe", "java.exe"]) {
          const p = path.join(base, d.name, "bin", name);
          if (isUsableJavaBinary(p)) return p;
        }
      }
    }
    const javaRoot = path.join(root, "Java");
    if (fs.existsSync(javaRoot)) {
      try {
        const entries = fs
          .readdirSync(javaRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
        for (const d of entries) {
          for (const name of ["javaw.exe", "java.exe"]) {
            const p = path.join(javaRoot, d.name, "bin", name);
            if (isUsableJavaBinary(p)) return p;
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

GameLauncher.JAVA_MISSING_MSG = JAVA_MISSING_MSG;
GameLauncher.JAVA_EARLY_EXIT_MSG = JAVA_EARLY_EXIT_MSG;

module.exports = GameLauncher;
