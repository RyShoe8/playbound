import fs from "node:fs";
import os from "node:os";

const cpuBaselines = new Map();

function procGroupAndTicks(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
  const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
  return { group: Number(fields[2]), ticks: Number(fields[11]) + Number(fields[12]) };
}

function nodeTicks() {
  const first = fs.readFileSync("/proc/stat", "utf8").split("\n", 1)[0];
  return first.split(/\s+/).slice(1).reduce((sum, value) => sum + Number(value), 0);
}

export function processMetrics(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return { available: false };
  try {
    const leader = procGroupAndTicks(pid);
    // Managed rooms have their own process group. Count children and
    // AppImage wrappers even when they have been reparented to PID 1.
    const groupId = leader.group === pid ? pid : leader.group;
    let rssBytes = 0;
    let processTotal = 0;
    let processCount = 0;
    for (const name of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(name)) continue;
      const childPid = Number(name);
      try {
        const sample = procGroupAndTicks(childPid);
        if (sample.group !== groupId) continue;
        const status = fs.readFileSync(`/proc/${childPid}/status`, "utf8");
        rssBytes += Number(status.match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1] || 0) * 1024;
        processTotal += sample.ticks;
        processCount++;
      } catch { /* process exited while sampling */ }
    }
    if (!processCount) return { available: false };
    const nodeTotal = nodeTicks();
    const previous = cpuBaselines.get(pid);
    cpuBaselines.set(pid, { processTotal, nodeTotal });
    const cpuCores = previous && nodeTotal > previous.nodeTotal
      ? Math.max(0, (processTotal - previous.processTotal) / (nodeTotal - previous.nodeTotal) * os.cpus().length)
      : null;
    return { available: true, rssBytes, cpuCores, processCount, scope: "process-group" };
  } catch {
    cpuBaselines.delete(pid);
    return { available: false };
  }
}
