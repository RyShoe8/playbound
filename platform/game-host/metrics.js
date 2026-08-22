/**
 * VPS resource metrics for the admin Connect dashboard.
 */

import fs from "node:fs";
import os from "node:os";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GAMES_ROOT = process.env.GAME_HOST_GAMES_DIR || "/opt/playbound-host/games";
const HOST_ROOT = process.env.GAME_HOST_INSTALL_ROOT || "/opt/playbound-host";

/** @type {{ rx: number, tx: number, at: number } | null} */
let netBaseline = null;
/** @type {{ idle: number, total: number, at: number } | null} */
let cpuBaseline = null;

function readAgentVersion() {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    return String(pkg.version || "unknown");
  } catch {
    return "unknown";
  }
}

function diskUsage(mountPath) {
  try {
    const st = fs.statfsSync(mountPath);
    const total = st.blocks * st.bsize;
    const free = st.bfree * st.bsize;
    const used = total - free;
    return {
      path: mountPath,
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      usedPercent: total > 0 ? Math.round((used / total) * 100) : 0,
    };
  } catch {
    return {
      path: mountPath,
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      usedPercent: 0,
      error: "unavailable",
    };
  }
}

async function readNetDev() {
  try {
    const raw = await readFile("/proc/net/dev", "utf8");
    let rx = 0;
    let tx = 0;
    let iface = "eth0";
    for (const line of raw.split("\n").slice(2)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      const name = parts[0].replace(":", "");
      if (name === "lo") continue;
      const r = Number(parts[1]) || 0;
      const t = Number(parts[9]) || 0;
      if (r + t >= rx + tx) {
        rx = r;
        tx = t;
        iface = name;
      }
    }
    return { iface, rxBytes: rx, txBytes: tx };
  } catch {
    return { iface: null, rxBytes: 0, txBytes: 0 };
  }
}

async function readCpuUsagePercent() {
  try {
    const raw = await readFile("/proc/stat", "utf8");
    const line = raw.split("\n").find((l) => l.startsWith("cpu "));
    if (!line) return null;
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0);
    const total = parts.reduce((a, b) => a + b, 0);
    const now = Date.now();
    if (!cpuBaseline) {
      cpuBaseline = { idle, total, at: now };
      return null;
    }
    const idleDelta = idle - cpuBaseline.idle;
    const totalDelta = total - cpuBaseline.total;
    cpuBaseline = { idle, total, at: now };
    if (totalDelta <= 0) return null;
    return Math.round((1 - idleDelta / totalDelta) * 100);
  } catch {
    return null;
  }
}

function mbps(bytesDelta, msDelta) {
  if (msDelta <= 0 || bytesDelta < 0) return 0;
  return Number(((bytesDelta * 8) / (msDelta / 1000) / 1_000_000).toFixed(2));
}

export async function collectMetrics(publicIp) {
  const now = Date.now();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const [load1, load5, load15] = os.loadavg();
  const cores = os.cpus().length || 1;
  const cpuUsagePercent = await readCpuUsagePercent();
  const net = await readNetDev();

  let bandwidth = {
    iface: net.iface,
    rxMbps: 0,
    txMbps: 0,
    rxBytesTotal: net.rxBytes,
    txBytesTotal: net.txBytes,
  };

  if (netBaseline) {
    const ms = now - netBaseline.at;
    bandwidth = {
      ...bandwidth,
      rxMbps: mbps(net.rxBytes - netBaseline.rx, ms),
      txMbps: mbps(net.txBytes - netBaseline.tx, ms),
    };
  }
  netBaseline = { rx: net.rxBytes, tx: net.txBytes, at: now };

  return {
    collectedAt: new Date(now).toISOString(),
    uptimeSec: Math.floor(os.uptime()),
    publicIp: publicIp || null,
    agentVersion: readAgentVersion(),
    cpu: {
      cores,
      load1: Number(load1.toFixed(2)),
      load5: Number(load5.toFixed(2)),
      load15: Number(load15.toFixed(2)),
      usagePercent: cpuUsagePercent,
    },
    memory: {
      totalBytes: totalMem,
      usedBytes: usedMem,
      freeBytes: freeMem,
      usedPercent: Math.round((usedMem / totalMem) * 100),
    },
    storage: [
      diskUsage("/"),
      diskUsage(HOST_ROOT),
      diskUsage(GAMES_ROOT),
    ],
    bandwidth,
  };
}
