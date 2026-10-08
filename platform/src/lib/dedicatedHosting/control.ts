/**
 * Server Control for customer servers.
 *
 * The same ServerControlAdapter the party panel and admin use, scoped to one
 * customer server, with PlayBound Dedicated's rules layered on top:
 *  - every call is authorised for the specific permission it needs;
 *  - the slot count is the product, so a game's own "player slots" setting is
 *    never offered and never accepted — the size comes from the allocation;
 *  - console commands pass the customer console guard;
 *  - everything that changes the server is written to its activity log.
 */
import CommunityServer from "@/lib/models/CommunityServer";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import { createManagedVpsAdapter } from "@/lib/serverControl/managedVps";
import { consoleCommandProblem, kickCommand } from "@/lib/serverControl/rcon";
import { getServerSettingProfile, type ServerSettingValues } from "@/lib/serverControl/settings";
import { ServerControlUnsupported } from "@/lib/serverControl/adapter";
import { authorizeServer, recordActivity, ROLE_PERMISSIONS, type Fail } from "./access";
import { customerServerView } from "./view";


/** Keys PlayBound owns on a customer server: the game's slot setting. */
function lockedKeys(server: { gameSlug: string }): Set<string> {
  const profile = getServerSettingProfile(server.gameSlug);
  return new Set((profile?.settings ?? []).filter((s) => s.feature === "slots").map((s) => s.key));
}

function stripLocked(server: { gameSlug: string }, values: Record<string, unknown>): Record<string, unknown> {
  const locked = lockedKeys(server);
  return Object.fromEntries(Object.entries(values).filter(([k]) => !locked.has(k) && k !== "maxPlayers"));
}

async function adapterFor(server: {
  _id: unknown; gameSlug: string; profileKey: string; editionSlug?: string | null; mod?: string | null;
  name: string; allocatedSlots: number; settings?: Record<string, unknown> | null;
}) {
  const profile = await CommunityServerProfile.findOne({ key: server.profileKey }).select({ recipeSlug: 1 }).lean();
  const saved = stripLocked(server, server.settings || {}) as ServerSettingValues;
  return createManagedVpsAdapter({
    id: String(server._id),
    gameSlug: server.gameSlug,
    recipeSlug: profile?.recipeSlug || server.gameSlug,
    editionSlug: server.editionSlug || null,
    mod: server.mod || null,
    name: server.name,
    customerOwned: true,
    settings: { ...saved, maxPlayers: server.allocatedSlots },
    onChanged: async (values) => {
      await CommunityServer.updateOne({ _id: server._id }, { $set: { settings: stripLocked(server, values) } });
    },
  });
}

/** Everything the Server Control page renders, for the caller's role. */
export async function getControl(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:view");
  if ("error" in auth) return auth;
  const { server, role } = auth;
  const adapter = await adapterFor(server);
  const [status, view] = await Promise.all([adapter.getStatus(), adapter.getSettings()]);
  const locked = lockedKeys(server);
  const values = { ...view.values };
  for (const k of [...locked, "maxPlayers"]) delete values[k];
  return {
    server: customerServerView(server.toObject() as Record<string, unknown>),
    role,
    permissions: [...ROLE_PERMISSIONS[role]],
    capabilities: adapter.capabilities,
    /** A Maps tab: the game declares its maps and can change them over its live channel. */
    maps: Boolean(getServerSettingProfile(server.gameSlug)?.maps && adapter.capabilities.liveApply) ||
      Boolean(getServerSettingProfile(server.gameSlug)?.settings.some((d) => d.feature === "map")),
    status,
    definitions: view.definitions.filter((d) => !locked.has(d.key)),
    values,
  };
}

/** Apply settings. Map-only changes need change_map (moderators have it); anything else needs configure. */
export async function applyControlSettings(userId: string, serverId: string, input: Record<string, unknown>) {
  const view = await authorizeServer(userId, serverId, "server:view");
  if ("error" in view) return view;
  const clean = stripLocked(view.server, input || {});
  const keys = Object.keys(clean);
  if (!keys.length) return { error: "Nothing to change.", status: 400 } satisfies Fail;
  const profile = getServerSettingProfile(view.server.gameSlug);
  const mapOnly = keys.every((k) => profile?.settings.find((s) => s.key === k)?.feature === "map");
  const auth = await authorizeServer(userId, serverId, mapOnly ? "server:change_map" : "server:configure");
  if ("error" in auth) return auth;
  const adapter = await adapterFor(auth.server);
  try {
    const result = await adapter.applySettings(clean);
    const applied = Object.entries(result.applied);
    if (applied.length) {
      const labels = applied.map(([k, v]) => `${profile?.settings.find((s) => s.key === k)?.label || k}: ${String(v)}`);
      await recordActivity(serverId, { id: userId }, mapOnly ? "map_changed" : "settings_changed", `${labels.join(", ")} (${result.outcome})`);
    }
    if (result.outcome === "restarted") {
      await CommunityServer.updateOne({ _id: serverId }, { $set: { runtimeState: result.state.status === "running" ? "running" : "pending", decisionReason: "SETTINGS_RESTART" } });
    }
    return { ...result, status: 200 as const };
  } catch (err) {
    if (err instanceof ServerControlUnsupported) return { error: err.message, status: 400 } satisfies Fail;
    return { error: err instanceof Error ? err.message : "The server didn't accept the change.", status: 503 } satisfies Fail;
  }
}

export async function listPlayers(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:view");
  if ("error" in auth) return auth;
  const adapter = await adapterFor(auth.server);
  if (!adapter.capabilities.players) return { error: "This game doesn't report its players.", status: 400 } satisfies Fail;
  try {
    return { players: await adapter.getPlayers(), status: 200 as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't read the player list.", status: 503 } satisfies Fail;
  }
}

/** Kick by the id the game's `status` shows, in that engine's own syntax. */
export async function kickPlayer(userId: string, serverId: string, playerId: string, playerName?: string) {
  const auth = await authorizeServer(userId, serverId, "server:kick_players");
  if ("error" in auth) return auth;
  if (!/^\d{1,3}$/.test(String(playerId))) return { error: "Unknown player.", status: 400 } satisfies Fail;
  const adapter = await adapterFor(auth.server);
  if (!adapter.capabilities.players) return { error: "This game doesn't support kicking from PlayBound.", status: 400 } satisfies Fail;
  try {
    await adapter.sendCommand(kickCommand(getServerSettingProfile(auth.server.gameSlug)?.controlChannel, String(playerId)));
    await recordActivity(serverId, { id: userId }, "player_kicked", playerName || `client ${playerId}`);
    return { ok: true as const, status: 200 as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kick failed.", status: 503 } satisfies Fail;
  }
}

export async function runConsole(userId: string, serverId: string, command: string) {
  const auth = await authorizeServer(userId, serverId, "server:console");
  if ("error" in auth) return auth;
  const problem = consoleCommandProblem(command);
  if (problem) return { error: problem, status: 400 } satisfies Fail;
  const adapter = await adapterFor(auth.server);
  if (!adapter.capabilities.console) return { error: "This game has no console PlayBound can reach.", status: 400 } satisfies Fail;
  try {
    const output = await adapter.sendCommand(command.trim());
    await recordActivity(serverId, { id: userId }, "console_command", command.trim());
    return { output: output.replace(/\^[0-9a-z]/gi, "").slice(0, 20_000), status: 200 as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The server didn't answer.", status: 503 } satisfies Fail;
  }
}
