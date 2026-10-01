/**
 * World-data restore points for a paid server (saved games, player data), kept
 * on the game host beside the server. The Backups tab's other restore points
 * only hold PlayBound's configuration for the server (see backups.ts).
 *
 * Only games whose data lives in one folder per customer server are listed;
 * each is recorded in game-host/dedicatedDataBackups.js, and a test keeps the
 * two lists identical.
 */
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import { worldBackupOnHost, type WorldBackupInfo } from "@/lib/gameHost/client";
import { authorizeServer, recordActivity, type Fail } from "./access";
import { retentionFor } from "./backups";

export const WORLD_BACKUP_GAMES = [
  "mindustry", "openttd", "luanti", "freeciv", "morrowind",
  "terraria", "factorio", "core-keeper", "vintage-story", "rimworld-together",
  "barotrauma", "dont-starve-together", "necesse",
] as const;

export function hasWorldBackups(recipeSlug: string): boolean {
  return (WORLD_BACKUP_GAMES as readonly string[]).includes(recipeSlug);
}

async function recipeFor(server: { profileKey: string; gameSlug: string }): Promise<string> {
  const profile = await CommunityServerProfile.findOne({ key: server.profileKey }).select({ recipeSlug: 1 }).lean();
  return profile?.recipeSlug || server.gameSlug;
}

/** A server that is running, starting, or wanted running must not have its world swapped underneath it. */
export function isStoppedForRestore(server: { desiredState?: string | null; runtimeState?: string | null; slotsHeld?: unknown }): boolean {
  return server.desiredState !== "running" && !["running", "pending"].includes(String(server.runtimeState || "")) && !server.slotsHeld;
}

export async function listWorldData(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:view");
  if ("error" in auth) return auth;
  const recipe = await recipeFor(auth.server);
  if (!hasWorldBackups(recipe)) return { supported: false as const, backups: [] as WorldBackupInfo[], retention: 0, status: 200 as const };
  const retention = await retentionFor(auth.server);
  const result = await worldBackupOnHost(serverId, { action: "list", gameSlug: recipe });
  // A host that cannot answer is reported, not shown as "no backups".
  if (!result.ok) return { error: result.error, status: 503 } satisfies Fail;
  return { supported: true as const, backups: result.backups || [], retention, status: 200 as const };
}

export async function createWorldDataBackup(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:create_backup");
  if ("error" in auth) return auth;
  const recipe = await recipeFor(auth.server);
  if (!hasWorldBackups(recipe)) return { error: "This game has no world data to back up.", status: 400 } satisfies Fail;
  const result = await worldBackupOnHost(serverId, { action: "create", gameSlug: recipe, retention: Math.max(1, await retentionFor(auth.server)) });
  if (!result.ok) return { error: result.error, status: 409 } satisfies Fail;
  await recordActivity(serverId, { id: userId }, "world_backup_created");
  return { ok: true as const, backup: result.backup, status: 200 as const };
}

export async function restoreWorldDataBackup(userId: string, serverId: string, backupId: string) {
  const auth = await authorizeServer(userId, serverId, "server:restore_backup");
  if ("error" in auth) return auth;
  const recipe = await recipeFor(auth.server);
  if (!hasWorldBackups(recipe)) return { error: "This game has no world data to restore.", status: 400 } satisfies Fail;
  if (!/^[0-9a-f-]{36}$/i.test(backupId)) return { error: "No such world backup.", status: 404 } satisfies Fail;
  if (!isStoppedForRestore(auth.server)) return { error: "Stop the server before restoring its world data.", status: 409 } satisfies Fail;
  const result = await worldBackupOnHost(serverId, { action: "restore", gameSlug: recipe, backupId, retention: Math.max(1, await retentionFor(auth.server)) });
  if (!result.ok) return { error: result.error, status: 409 } satisfies Fail;
  await recordActivity(serverId, { id: userId }, "world_backup_restored");
  return { ok: true as const, status: 200 as const };
}
