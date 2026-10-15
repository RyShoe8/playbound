import { execFileSync } from "node:child_process";

/** Root-owned activation state is the only authority for nonempty legacy data.
 * Agent-owned files, flags and a successful old checkpoint are insufficient.
 */
export function verifiedIdentityMigration(serverId, home, execute = execFileSync) {
  if (!/^[a-f0-9]{24}$/.test(serverId || "") || home !== "/var/lib/playbound-host") return false;
  try {
    const result = JSON.parse(execute("/usr/bin/sudo", ["-n", "/usr/local/libexec/playbound-customer-runtime", "migration", serverId], {
      encoding: "utf8", timeout: 4000, maxBuffer: 4096,
      env: { PATH: "/usr/bin:/usr/games", LANG: "C.UTF-8" }, stdio: ["ignore", "pipe", "pipe"],
    }));
    return result.serverId === serverId && result.migrationReady === true;
  } catch { return false; }
}
