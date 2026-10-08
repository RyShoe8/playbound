import { listManagedHostRooms, requestManagedHostRoom, sendRoomCommand, stopManagedHostRoom } from "@/lib/gameHost/client";
import {
  ServerControlUnsupported,
  type ApplySettingsResult,
  type ServerControlAdapter,
  type ServerControlCapabilities,
  type ServerRuntimeState,
  type ServerSettingsView,
} from "./adapter";
import { buildRconCommands, parseStatus } from "./rcon";
import {
  coerceSettingValues,
  defaultSettingValues,
  getServerSettingProfile,
  strongestApplyMode,
  type ServerSettingValues,
} from "./settings";

type ManagedRef = {
  id: string;
  gameSlug: string;
  recipeSlug: string;
  editionSlug: string | null;
  mod: string | null;
  name: string;
  customerOwned?: boolean;
  /**
   * What the room is started with. For a customer server this includes
   * `maxPlayers` (its slot count), which the caller keeps out of the editable
   * definitions.
   */
  settings: ServerSettingValues;
  onChanged?: (values: ServerSettingValues) => Promise<void>;
};

/**
 * Control for a managed room (automatic Community Servers and PlayBound
 * Dedicated customer servers), scoped to a CommunityServer id.
 *
 * Same contract and the same rules as party VPS rooms (vpsAgent.ts): a game
 * whose profile declares a live control channel gets players, a console and
 * live apply over the agent's rcon transport; everything else restarts. The
 * agent generates and keeps the rcon password for managed rooms exactly as for
 * party rooms, so the platform never holds it.
 */
export function createManagedVpsAdapter(ref: ManagedRef): ServerControlAdapter {
  const profile = getServerSettingProfile(ref.gameSlug);
  const live = Boolean(profile?.controlChannel);
  const capabilities: ServerControlCapabilities = {
    settings: Boolean(profile),
    restart: true,
    players: live,
    console: live,
    liveApply: live,
  };

  const down = (status: ServerRuntimeState["status"], error: string | null = null): ServerRuntimeState => ({
    status, gameSlug: ref.gameSlug, host: null, port: null, name: ref.name, startedAt: null, error,
  });

  async function findRoom() {
    const result = await listManagedHostRooms();
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, room: result.rooms.find((r) => r.communityServerId === ref.id) || null, job: result.jobs[ref.id] };
  }

  async function state(): Promise<ServerRuntimeState> {
    const found = await findRoom();
    // "unknown", not "stopped": a panel told a healthy room is down will restart it.
    if (!found.ok) return down("unknown", found.error);
    const { room, job } = found;
    if (room) {
      return { status: "running", gameSlug: ref.gameSlug, host: room.host, port: room.port, name: room.name || ref.name, startedAt: room.createdAt ? new Date(room.createdAt) : null, error: null };
    }
    return down(job?.status === "pending" ? "pending" : job?.status === "failed" ? "failed" : "stopped", job?.error || null);
  }

  async function start(): Promise<ServerRuntimeState> {
    const result = await requestManagedHostRoom({ communityServerId: ref.id, gameSlug: ref.recipeSlug, editionSlug: ref.editionSlug, mod: ref.mod, name: ref.name, settings: ref.settings, customerOwned: ref.customerOwned === true });
    if (result.status === "failed") return down("failed", result.error || "Start failed");
    return state();
  }

  async function stop(): Promise<ServerRuntimeState> {
    const result = await stopManagedHostRoom(ref.id);
    if (!result.ok) return down("failed", result.error || "Stop failed");
    return state();
  }

  async function roomId(operation: string): Promise<string> {
    if (!live) throw new ServerControlUnsupported("vps-agent", operation);
    const found = await findRoom();
    if (!found.ok) throw new Error(found.error);
    if (!found.room?.roomId) throw new Error("The server isn't running.");
    return found.room.roomId;
  }

  return {
    kind: "vps-agent",
    capabilities,
    getStatus: state,
    async getSettings(): Promise<ServerSettingsView> {
      return { gameSlug: ref.gameSlug, definitions: profile?.settings ?? [], values: { ...defaultSettingValues(ref.gameSlug), ...ref.settings } };
    },
    async applySettings(input): Promise<ApplySettingsResult> {
      if (!profile) throw new ServerControlUnsupported("vps-agent", "change undeclared settings");
      const { values, rejected } = coerceSettingValues(ref.gameSlug, input);
      const current = { ...defaultSettingValues(ref.gameSlug), ...ref.settings };
      const changed = Object.keys(values).filter((key) => current[key] !== values[key]);
      if (!changed.length) return { applied: {}, rejected, outcome: "unchanged", state: await state() };

      const before = await state();
      const needsRestart = !live || changed.some((key) => profile.settings.find((s) => s.key === key)?.backend !== "rcon");

      // Stopped: nothing to disconnect. Save for the next start.
      if (before.status !== "running") {
        ref.settings = { ...current, ...values };
        await ref.onChanged?.(ref.settings);
        return { applied: values, rejected, outcome: "queued", state: before };
      }

      /*
       * One restart-backed key restarts the whole batch, so everything lands
       * together (see vpsAgent.ts for why a half-applied batch is worse).
       */
      if (needsRestart) {
        if (live && strongestApplyMode(ref.gameSlug, changed) !== "restart") {
          throw new ServerControlUnsupported("vps-agent", "apply that change without a restart");
        }
        ref.settings = { ...current, ...values };
        await ref.onChanged?.(ref.settings);
        const stopped = await stop();
        if (stopped.status === "failed") return { applied: values, rejected, outcome: "queued", state: stopped };
        return { applied: values, rejected, outcome: "restarted", state: await start() };
      }

      const id = await roomId("change settings without restarting");
      const applied: ServerSettingValues = {};
      const failures: { key: string; reason: string }[] = [];
      for (const { key, command } of buildRconCommands(ref.gameSlug, Object.fromEntries(changed.map((k) => [k, values[k]])))) {
        const sent = await sendRoomCommand(id, command);
        if (sent.ok) applied[key] = values[key];
        else failures.push({ key, reason: sent.error });
      }
      if (Object.keys(applied).length) {
        ref.settings = { ...ref.settings, ...applied };
        await ref.onChanged?.(ref.settings);
      }
      return { applied, rejected: [...rejected, ...failures], outcome: "applied-live", state: await state() };
    },
    async getPlayers() {
      const id = await roomId("list connected players");
      const sent = await sendRoomCommand(id, "status");
      if (!sent.ok) throw new Error(sent.error);
      return parseStatus(getServerSettingProfile(ref.gameSlug)?.controlChannel, sent.response).map((p) => ({ name: p.bot ? `${p.name} (bot)` : p.name, id: p.id, pingMs: p.pingMs, score: p.score }));
    },
    start,
    stop,
    async restart() {
      const stopped = await stop();
      return stopped.status === "failed" ? stopped : start();
    },
    async sendCommand(raw: string) {
      const id = await roomId("run console commands");
      const sent = await sendRoomCommand(id, raw);
      if (!sent.ok) throw new Error(sent.error);
      return sent.response;
    },
  };
}
