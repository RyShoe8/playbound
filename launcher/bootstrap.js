/**
 * bootstrap.js — Electron entry before main.js.
 *
 * Catches MODULE_NOT_FOUND / other load failures that would otherwise kill the
 * process before telemetry exists, writes last-crash.json, and best-effort
 * POSTs an `error` event so Admin auto-bugs still fire.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { app, dialog } = require("electron");

const DEFAULT_API_BASE = "https://playbound.club";
let crashReported = false;

function crashFilePath() {
  try {
    return path.join(app.getPath("userData"), "last-crash.json");
  } catch {
    return null;
  }
}

function readApiBase() {
  try {
    const settingsPath = path.join(app.getPath("userData"), "settings.json");
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const base = String(raw.apiBase || "").replace(/\/$/, "");
    if (base) return base;
  } catch {
    /* ignore */
  }
  return DEFAULT_API_BASE;
}

function classifyError(err) {
  const message = err?.message || String(err || "Unknown error");
  const code =
    err?.code === "MODULE_NOT_FOUND" || /Cannot find module/i.test(message)
      ? "MODULE_NOT_FOUND"
      : err?.code || "UNCAUGHT_EXCEPTION";
  return { code, message: String(message).slice(0, 1000) };
}

function writeLastCrash(payload) {
  const file = crashFilePath();
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

async function postErrorTelemetry(payload) {
  try {
    const version = (() => {
      try {
        return app.getVersion();
      } catch {
        return "unknown";
      }
    })();
    const body = {
      event: "error",
      properties: {
        code: payload.code,
        message: payload.message,
        source: "launcher",
        phase: payload.phase || "startup",
        launcherVersion: version,
        platform: process.platform,
        architecture: process.arch,
      },
      timestamp: new Date().toISOString(),
      sessionId: `crash-${Date.now()}`,
      anonymousId: `crash-${process.pid}-${Date.now()}`,
    };
    await fetch(`${readApiBase()}/api/telemetry`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": `playbound-launcher/${version} (${process.platform}; ${process.arch})`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    /* best effort */
  }
}

function reportCrash(err, phase = "startup") {
  if (crashReported) return;
  crashReported = true;
  const { code, message } = classifyError(err);
  const payload = {
    code,
    message,
    phase,
    stack: String(err?.stack || "").slice(0, 4000) || null,
    at: new Date().toISOString(),
  };
  writeLastCrash(payload);
  void postErrorTelemetry(payload);
}

process.on("uncaughtException", (err) => {
  reportCrash(err, "uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  reportCrash(err, "unhandledRejection");
});

try {
  require("./main.js");
} catch (err) {
  reportCrash(err, "startup");
  const { message } = classifyError(err);
  const show = () => {
    try {
      dialog.showErrorBox(
        "PlayBound failed to start",
        `${message}\n\nPlease reinstall from playbound.club or check for updates again.`
      );
    } catch {
      /* ignore */
    }
    try {
      app.quit();
    } catch {
      process.exit(1);
    }
  };
  if (app.isReady()) show();
  else app.whenReady().then(show).catch(() => process.exit(1));
}
