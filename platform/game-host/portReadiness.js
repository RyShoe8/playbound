import fs from "node:fs";

/** Check the kernel socket table without briefly claiming the port ourselves.
 * A bind probe during startup can race the game and crash it with EADDRINUSE. */
export function procNetHasPort(contents, port, tcp = false) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  for (const line of contents.split("\n").slice(1)) {
    const fields = line.trim().split(/\s+/);
    const local = fields[1];
    if (!local?.includes(":")) continue;
    const boundPort = Number.parseInt(local.slice(local.lastIndexOf(":") + 1), 16);
    if (boundPort === port && (!tcp || fields[3] === "0A")) return true;
  }
  return false;
}

export function isLinuxPortBound(port, protocol, readFile = fs.readFileSync) {
  const families = protocol === "tcp" ? ["tcp", "tcp6"]
    : protocol === "udp" ? ["udp", "udp6"]
      : ["tcp", "tcp6", "udp", "udp6"];
  for (const family of families) {
    try {
      if (procNetHasPort(readFile(`/proc/net/${family}`, "utf8"), port, family.startsWith("tcp"))) return true;
    } catch {
      // A missing IPv6 table is normal on hosts with IPv6 disabled.
    }
  }
  return false;
}
