/**
 * Compatibility Runner Service for PlayBound.
 *
 * Detects and coordinates Wine, Steam Proton, CrossOver, and Whisky runtimes
 * on macOS, Linux, and Steam Deck so Windows-only executables run seamlessly
 * without requiring custom per-game builds.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

/**
 * @typedef {Object} CompatibilityRunner
 * @property {string} id - Unique runner ID (e.g. 'proton-9.0', 'system-wine', 'crossover')
 * @property {string} name - Human readable display name
 * @property {'proton' | 'wine' | 'crossover' | 'whisky'} type - Runner type
 * @property {string} binaryPath - Path to executable binary (proton or wine/wine64)
 * @property {string} [steamPath] - Steam root directory if Proton
 * @property {string} [version] - Detected version string
 */

/**
 * Searches for all available Wine / Proton / CrossOver / Whisky runners on the system.
 * @param {{ appUserData?: string }} [opts]
 * @returns {CompatibilityRunner[]}
 */
function detectAvailableRunners(opts = {}) {
  const runners = [];
  const platform = process.platform;

  if (platform === "linux") {
    // 1. Steam / Steam Deck Proton detection
    const steamPaths = [
      path.join(os.homedir(), ".local", "share", "Steam"),
      path.join(os.homedir(), ".steam", "steam"),
      path.join(os.homedir(), ".steam", "root"),
      path.join(os.homedir(), ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
    ];

    for (const steamDir of steamPaths) {
      if (!fs.existsSync(steamDir)) continue;

      // Check standard Steamapps common folder for official Proton releases
      const commonDir = path.join(steamDir, "steamapps", "common");
      if (fs.existsSync(commonDir)) {
        try {
          const dirs = fs.readdirSync(commonDir);
          for (const d of dirs) {
            if (/^proton/i.test(d)) {
              const protonBin = path.join(commonDir, d, "proton");
              if (fs.existsSync(protonBin)) {
                runners.push({
                  id: `steam-${d.toLowerCase().replace(/[^a-z0-9.-]/g, "-")}`,
                  name: `Steam ${d}`,
                  type: "proton",
                  binaryPath: protonBin,
                  steamPath: steamDir,
                });
              }
            }
          }
        } catch {
          /* ignore readdir errors */
        }
      }

      // Check compatibilitytools.d for custom Proton-GE / Wine-GE
      const compatDir = path.join(steamDir, "compatibilitytools.d");
      if (fs.existsSync(compatDir)) {
        try {
          const dirs = fs.readdirSync(compatDir);
          for (const d of dirs) {
            const protonBin = path.join(compatDir, d, "proton");
            if (fs.existsSync(protonBin)) {
              runners.push({
                id: `ge-${d.toLowerCase().replace(/[^a-z0-9.-]/g, "-")}`,
                name: `${d} (Custom)`,
                type: "proton",
                binaryPath: protonBin,
                steamPath: steamDir,
              });
            }
          }
        } catch {
          /* ignore */
        }
      }
    }

    // 2. Lutris & Heroic Proton/Wine runners
    const lutrisRunners = path.join(os.homedir(), ".local", "share", "lutris", "runners", "wine");
    if (fs.existsSync(lutrisRunners)) {
      try {
        const dirs = fs.readdirSync(lutrisRunners);
        for (const d of dirs) {
          const wineBin = path.join(lutrisRunners, d, "bin", "wine");
          if (fs.existsSync(wineBin)) {
            runners.push({
              id: `lutris-${d.toLowerCase().replace(/[^a-z0-9.-]/g, "-")}`,
              name: `Lutris ${d}`,
              type: "wine",
              binaryPath: wineBin,
            });
          }
        }
      } catch {
        /* ignore */
      }
    }

    // 3. System Wine
    for (const binName of ["wine64", "wine"]) {
      const found = whichBinary(binName);
      if (found) {
        runners.push({
          id: `system-${binName}`,
          name: `System ${binName.toUpperCase()}`,
          type: "wine",
          binaryPath: found,
        });
        break; // Only keep the best system wine
      }
    }
  } else if (platform === "darwin") {
    // 1. CrossOver (Commercial Wine by CodeWeavers)
    const crossOverBin = "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine64";
    if (fs.existsSync(crossOverBin)) {
      runners.push({
        id: "crossover-wine64",
        name: "CrossOver (macOS)",
        type: "crossover",
        binaryPath: crossOverBin,
      });
    }

    // 2. Whisky / Apple Game Porting Toolkit (GPTK)
    const whiskyWineBin = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "com.isaacmarovitz.Whisky",
      "Libraries",
      "Wine",
      "bin",
      "wine64"
    );
    if (fs.existsSync(whiskyWineBin)) {
      runners.push({
        id: "whisky-gptk",
        name: "Whisky / Apple GPTK",
        type: "whisky",
        binaryPath: whiskyWineBin,
      });
    }

    // 3. Homebrew Wine
    for (const brewPath of ["/opt/homebrew/bin/wine64", "/usr/local/bin/wine64", "/opt/homebrew/bin/wine"]) {
      if (fs.existsSync(brewPath)) {
        runners.push({
          id: "homebrew-wine",
          name: "Homebrew Wine",
          type: "wine",
          binaryPath: brewPath,
        });
        break;
      }
    }
  }

  return runners;
}

/**
 * Returns the best default runner for the current system.
 * @param {CompatibilityRunner[]} [available]
 * @returns {CompatibilityRunner | null}
 */
function resolveDefaultRunner(available = null) {
  const runners = available || detectAvailableRunners();
  if (runners.length === 0) return null;

  // Linux: Prefer official Proton Hotfix / Proton 9 / latest Proton, then GE, then Wine
  if (process.platform === "linux") {
    const protonHotfix = runners.find((r) => r.id.includes("proton-hotfix") || r.id.includes("proton-experimental"));
    if (protonHotfix) return protonHotfix;

    const proton9 = runners.find((r) => r.id.includes("proton-9"));
    if (proton9) return proton9;

    const protonAny = runners.find((r) => r.type === "proton");
    if (protonAny) return protonAny;
  }

  // macOS: Prefer CrossOver, then Whisky, then Homebrew Wine
  if (process.platform === "darwin") {
    const crossOver = runners.find((r) => r.type === "crossover");
    if (crossOver) return crossOver;

    const whisky = runners.find((r) => r.type === "whisky");
    if (whisky) return whisky;
  }

  return runners[0];
}

/**
 * Locates or creates a dedicated Wine prefix directory for a specific game slug.
 * @param {string} gameSlug
 * @param {string} [appDataPath]
 * @returns {string} Absolute path to game prefix directory.
 */
function getGamePrefixDirectory(gameSlug, appDataPath = null) {
  const root =
    appDataPath ||
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support", "PlayBound")
      : path.join(os.homedir(), ".local", "share", "playbound"));

  const prefixDir = path.join(root, "prefixes", gameSlug || "default");
  if (!fs.existsSync(prefixDir)) {
    fs.mkdirSync(prefixDir, { recursive: true });
  }
  return prefixDir;
}

/**
 * Builds the executable command, argument list, and environment variables
 * to launch a Windows executable via the chosen compatibility runner.
 *
 * @param {string} targetExe - Absolute path to Windows .exe
 * @param {string[]} [programArgs] - Additional game arguments
 * @param {Object} [options]
 * @param {string} [options.gameSlug] - Game slug for prefix isolation
 * @param {CompatibilityRunner} [options.runner] - Specific runner to use
 * @param {string} [options.appDataPath] - Custom appData path
 * @returns {{ command: string, args: string[], env: Record<string, string | undefined>, cwd: string }}
 */
function buildRunnerLaunchSpec(targetExe, programArgs = [], options = {}) {
  const runner = options.runner || resolveDefaultRunner();
  if (!runner) {
    const err = new Error(
      process.platform === "darwin"
        ? "No Windows compatibility runner found. Install CrossOver, Whisky, or Wine to play Windows games on macOS."
        : "No Wine or Steam Proton runner found. Install Steam Proton or system Wine to play Windows games on Linux."
    );
    err.code = "RUNNER_MISSING";
    throw err;
  }

  const prefixDir = getGamePrefixDirectory(options.gameSlug || path.basename(targetExe, ".exe"), options.appDataPath);
  const cwd = path.dirname(targetExe);

  if (runner.type === "proton") {
    // Proton launch specification
    const env = {
      ...process.env,
      STEAM_COMPAT_DATA_PATH: prefixDir,
      STEAM_COMPAT_CLIENT_INSTALL_PATH: runner.steamPath || path.join(os.homedir(), ".local", "share", "Steam"),
      DXVK_HUD: process.env.DXVK_HUD || "0",
    };

    return {
      command: runner.binaryPath,
      args: ["run", targetExe, ...programArgs],
      env,
      cwd,
    };
  }

  // Wine / CrossOver / Whisky launch specification
  const env = {
    ...process.env,
    WINEPREFIX: prefixDir,
    WINEDEBUG: process.env.WINEDEBUG || "-all",
  };

  return {
    command: runner.binaryPath,
    args: [targetExe, ...programArgs],
    env,
    cwd,
  };
}

/**
 * Checks if a target executable requires a compatibility runner on the current host OS.
 * @param {string} filePath
 * @returns {boolean}
 */
function requiresCompatibilityRunner(filePath) {
  if (process.platform === "win32") return false;
  if (!filePath || typeof filePath !== "string") return false;
  const lower = filePath.toLowerCase();
  return lower.endsWith(".exe") || lower.endsWith(".msi");
}

function whichBinary(name) {
  try {
    const out = execFileSync("which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const p = out.trim();
    if (p && fs.existsSync(p)) return p;
  } catch {
    /* ignore */
  }
  return null;
}

module.exports = {
  detectAvailableRunners,
  resolveDefaultRunner,
  getGamePrefixDirectory,
  buildRunnerLaunchSpec,
  requiresCompatibilityRunner,
};
