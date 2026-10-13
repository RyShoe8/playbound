import fs from "node:fs";
import os from "node:os";

export function createProcessMetrics({ fileSystem = fs, coreCount = () => os.cpus().length, now = () => performance.now() } = {}) {
  const cpuBaselines = new Map();
  function procGroupAndTicks(pid) {
    const stat = fileSystem.readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
    return { group: Number(fields[2]), ticks: Number(fields[11]) + Number(fields[12]), started: fields[19] };
  }

  function nodeTicks() {
    const first = fileSystem.readFileSync("/proc/stat", "utf8").split("\n", 1)[0];
    return first.split(/\s+/).slice(1).reduce((sum, value) => sum + Number(value), 0);
  }

  return function processMetrics(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return { available: false };
    try {
      const leader = procGroupAndTicks(pid);
      const sampledAt = now();
      const saved = cpuBaselines.get(pid);
      const previous = saved?.started === leader.started && saved?.group === leader.group ? saved : null;
      // /proc ticks are quantized. Resetting the baseline on every API read
      // produces huge ratios over millisecond intervals and loses good readings.
      // Share a one-second sample window across all consumers instead.
      if (previous && sampledAt - previous.sampledAt < 1000) return previous.result;
      // Managed rooms have their own process group. Count children and
      // AppImage wrappers even when they have been reparented to PID 1.
      const groupId = leader.group === pid ? pid : leader.group;
      let rssBytes = 0;
      let processTotal = 0;
      let processCount = 0;
      for (const name of fileSystem.readdirSync("/proc")) {
        if (!/^\d+$/.test(name)) continue;
        const childPid = Number(name);
        try {
          const sample = procGroupAndTicks(childPid);
          if (sample.group !== groupId) continue;
          const status = fileSystem.readFileSync(`/proc/${childPid}/status`, "utf8");
          rssBytes += Number(status.match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1] || 0) * 1024;
          processTotal += sample.ticks;
          processCount++;
        } catch { /* process exited while sampling */ }
      }
      if (!processCount) { cpuBaselines.delete(pid); return { available: false }; }
      const nodeTotal = nodeTicks();
      const cpuCores = previous && nodeTotal > previous.nodeTotal && processTotal >= previous.processTotal
        ? Math.max(0, (processTotal - previous.processTotal) / (nodeTotal - previous.nodeTotal) * coreCount())
        : null;
      const result = { available: true, rssBytes, cpuCores, processCount, scope: "process-group", sampleIntervalMs: previous ? sampledAt - previous.sampledAt : 0 };
      cpuBaselines.set(pid, { processTotal, nodeTotal, sampledAt, started: leader.started, group: leader.group, result });
      return result;
    } catch {
      cpuBaselines.delete(pid);
      return { available: false };
    }
  };
}

export const processMetrics = createProcessMetrics();
