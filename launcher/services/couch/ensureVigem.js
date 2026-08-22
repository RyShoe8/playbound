/**
 * Ensure ViGEmBus + vigemclient are ready for Couch Mode.
 * Bundled setup is installed silently (elevated) when the driver is missing.
 * Users never visit GitHub or configure anything.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { createProvider } = require("./VirtualControllerProvider");

const SETUP_NAME = "ViGEmBus_Setup.exe";

/**
 * Resolve path to the vendored ViGEmBus setup EXE.
 * Packaged: <resources>/vigem/ViGEmBus_Setup.exe
 * Dev: launcher/resources/vigem/ViGEmBus_Setup.exe
 */
function resolveSetupPath() {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "vigem", SETUP_NAME));
  }
  // electron.app may not be required here; walk from this file for dev.
  candidates.push(
    path.join(__dirname, "..", "..", "resources", "vigem", SETUP_NAME)
  );
  try {
    const { app } = require("electron");
    if (app && !app.isPackaged) {
      candidates.push(path.join(app.getAppPath(), "resources", "vigem", SETUP_NAME));
    }
  } catch {
    /* not in electron yet */
  }
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function probeProvider() {
  const provider = createProvider();
  return provider.probe();
}

/**
 * Run the bundled setup elevated + silent. Returns when the process exits.
 * @returns {Promise<{ ok: boolean, code?: number, error?: string }>}
 */
function installBundledSetup(setupPath) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve({ ok: false, error: "Virtual controllers are Windows-only." });
      return;
    }
    // PowerShell Start-Process -Verb RunAs triggers UAC; /quiet is silent after Allow.
    const ps = `
$p = Start-Process -FilePath ${JSON.stringify(setupPath)} -ArgumentList '/quiet' -Verb RunAs -Wait -PassThru
exit $p.ExitCode
`;
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { windowsHide: true }
    );
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.on("error", (err) => {
      done({ ok: false, error: err.message || String(err) });
    });
    child.on("close", (code) => {
      // UAC cancel often yields non-zero; treat 0 as success and re-probe either way.
      done({ ok: code === 0, code: code == null ? -1 : code });
    });
  });
}

/**
 * Non-elevated quiet attempt (works if already admin). Used as a quick path.
 */
function tryQuietInstall(setupPath) {
  const result = spawnSync(setupPath, ["/quiet"], {
    windowsHide: true,
    timeout: 120_000,
  });
  return {
    ok: result.status === 0,
    code: result.status,
    error: result.error ? result.error.message : undefined,
  };
}

/**
 * Ensure the virtual controller stack works.
 * @param {(msg: string) => void} [onStatus]
 * @returns {Promise<{ ok: boolean, reason?: string, installed?: boolean }>}
 */
async function ensureVigem(onStatus) {
  const status = typeof onStatus === "function" ? onStatus : () => {};

  status("Checking controllers…");
  let probe = await probeProvider();
  if (probe.ok) {
    return { ok: true, installed: false };
  }

  const setupPath = resolveSetupPath();
  if (!setupPath) {
    return {
      ok: false,
      reason:
        "Controller support is missing from this PlayBound build. Reinstall PlayBound and try again.",
    };
  }

  status("Setting up controllers…");
  // Prefer elevated silent install (UAC once). Fallback to direct /quiet if already elevated.
  let install = await installBundledSetup(setupPath);
  if (!install.ok) {
    status("Retrying controller setup…");
    install = tryQuietInstall(setupPath);
  }

  status("Finishing controller setup…");
  // Driver may need a moment after setup exits.
  await new Promise((r) => setTimeout(r, 1500));
  probe = await probeProvider();
  if (probe.ok) {
    return { ok: true, installed: true };
  }

  if (install.code === 1223 || install.code === 1602) {
    // ERROR_CANCELLED / user cancelled UAC-ish
    return {
      ok: false,
      reason:
        "Windows needs permission to enable controllers. Click Start Couch Mode again and choose Allow.",
    };
  }

  return {
    ok: false,
    reason:
      probe.reason ||
      "Could not enable controllers. Click Start Couch Mode again and allow the Windows security prompt.",
  };
}

module.exports = {
  ensureVigem,
  resolveSetupPath,
  probeProvider,
};
