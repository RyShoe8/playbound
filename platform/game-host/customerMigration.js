import { execFileSync } from "node:child_process";

/** Root-owned activation state is the only authority for nonempty legacy data.
 * Agent-owned files, flags and a successful old checkpoint are insufficient.
 */
export function identityMigrationMetadata(serverId, home, execute = execFileSync) {
  if (!/^[a-f0-9]{24}$/.test(serverId || "") || home !== "/var/lib/playbound-host") return null;
  try {
    const result = JSON.parse(execute("/usr/bin/sudo", ["-n", "/usr/local/libexec/playbound-customer-runtime", "migration", serverId], {
      encoding: "utf8", timeout: 4000, maxBuffer: 4096,
      env: { PATH: "/usr/bin:/usr/games", LANG: "C.UTF-8" }, stdio: ["ignore", "pipe", "pipe"],
    }));
    if (result.serverId !== serverId || result.migrationReady !== true || (result.identityProfile !== undefined && !["teeworlds-unix-v1","bzflag-unix-v1","hedgewars-unix-v1","openttd-unix-v1","luanti-unix-v1","openarena-unix-v1","battle-for-wesnoth-unix-v1","supertuxkart-unix-v1","0-ad-unix-v1","ysoccer-unix-v1"].includes(result.identityProfile)) || ![undefined, null, "public-game-v1"].includes(result.networkProfile)) return null;
    return { networkProfile: result.networkProfile || null, identityProfile: result.identityProfile || "teeworlds-unix-v1" };
  } catch { return null; }
}

export function verifiedIdentityMigration(serverId, home, execute = execFileSync) {
  return identityMigrationMetadata(serverId, home, execute) !== null;
}
