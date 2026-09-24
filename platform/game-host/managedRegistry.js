/** Persistent managed-runtime manifest. No party room is stored here. */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_STATE_DIR = "/var/lib/playbound-host/state";

export function processIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const bootId = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = stat.lastIndexOf(")");
    const fields = stat.slice(close + 2).trim().split(/\s+/);
    const startedTick = fields[19]; // Linux proc field 22; remainder begins at field 3.
    if (!bootId || !startedTick) return null;
    return `${bootId}:${startedTick}`;
  } catch {
    return null;
  }
}

export function isSameProcess(pid, identity) {
  return Boolean(identity && processIdentity(pid) === identity);
}

export function processGroupMembers(leaderPid) {
  const members = [];
  try {
    for (const name of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue;
      const pid = Number(name);
      try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
        if (Number(fields[2]) !== leaderPid) continue;
        const identity = processIdentity(pid);
        if (identity) members.push({ pid, identity });
      } catch { /* process exited */ }
    }
  } catch { /* non-Linux test environment */ }
  return members;
}

export function rehydrateManagedRoom(saved) {
  return {
    ...saved, processIdentity: saved.identity, partyId: null, child: null,
    lastActivityAt: Date.now(), restarts: 0,
  };
}

function createRoomRegistry(fileName, valid, stateDir = process.env.GAME_HOST_STATE_DIR || DEFAULT_STATE_DIR) {
  const file = path.join(stateDir, fileName);
  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      return Array.isArray(data) ? data.filter(valid) : [];
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error; // A corrupt manifest must not be mistaken for an empty fleet.
    }
  }
  function write(rooms) {
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(rooms), { mode: 0o600 });
      fs.renameSync(temp, file);
    } finally {
      try { fs.unlinkSync(temp); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    }
  }
  return { read, write };
}

export function createManagedRegistry(stateDir) {
  return createRoomRegistry("managed-rooms.json", (r) => r && typeof r.communityServerId === "string", stateDir);
}

export function createPartyRegistry(stateDir) {
  return createRoomRegistry("party-rooms.json", (r) => r && typeof r.partyId === "string", stateDir);
}
