import { listManagedHostRooms, requestManagedHostRoom, stopManagedHostRoom } from "@/lib/gameHost/client";
import {
  ServerControlUnsupported,
  type ServerControlAdapter,
  type ServerRuntimeState,
  type ServerSettingsView,
} from "./adapter";
import { coerceSettingValues, defaultSettingValues, getServerSettingProfile, type ServerSettingValues } from "./settings";

type ManagedRef = {
  id: string;
  gameSlug: string;
  recipeSlug: string;
  editionSlug: string | null;
  mod: string | null;
  name: string;
  settings: ServerSettingValues;
  onChanged?: (values: ServerSettingValues) => Promise<void>;
};

/** Same control contract as party VPS rooms, scoped to a CommunityServer ID. */
export function createManagedVpsAdapter(ref: ManagedRef): ServerControlAdapter {
  const profile = getServerSettingProfile(ref.gameSlug);
  const capabilities = { settings: Boolean(profile), players: false, console: false, restart: true, liveApply: false };

  async function state(): Promise<ServerRuntimeState> {
    const result = await listManagedHostRooms();
    if (!result.ok) return { status: "unknown", gameSlug: ref.gameSlug, host: null, port: null, name: ref.name, startedAt: null, error: result.error };
    const room = result.rooms.find((r) => r.communityServerId === ref.id);
    if (room) return { status: "running", gameSlug: ref.gameSlug, host: room.host, port: room.port, name: room.name || ref.name, startedAt: room.createdAt ? new Date(room.createdAt) : null, error: null };
    const job = result.jobs[ref.id];
    return { status: job?.status === "pending" ? "pending" : job?.status === "failed" ? "failed" : "stopped", gameSlug: ref.gameSlug, host: null, port: null, name: ref.name, startedAt: null, error: job?.error || null };
  }

  async function start(): Promise<ServerRuntimeState> {
    const result = await requestManagedHostRoom({ communityServerId: ref.id, gameSlug: ref.recipeSlug, editionSlug: ref.editionSlug, mod: ref.mod, name: ref.name, settings: ref.settings });
    if (result.status === "failed") return { status: "failed", gameSlug: ref.gameSlug, host: null, port: null, name: ref.name, startedAt: null, error: result.error || "Start failed" };
    return state();
  }

  async function stop(): Promise<ServerRuntimeState> {
    const result = await stopManagedHostRoom(ref.id);
    if (!result.ok) return { status: "failed", gameSlug: ref.gameSlug, host: null, port: null, name: ref.name, startedAt: null, error: result.error || "Stop failed" };
    return state();
  }

  return {
    kind: "vps-agent",
    capabilities,
    getStatus: state,
    async getSettings(): Promise<ServerSettingsView> {
      return { gameSlug: ref.gameSlug, definitions: profile?.settings ?? [], values: { ...defaultSettingValues(ref.gameSlug), ...ref.settings } };
    },
    async applySettings(input) {
      if (!profile) throw new ServerControlUnsupported("vps-agent", "change undeclared settings");
      const { values, rejected } = coerceSettingValues(ref.gameSlug, input);
      const current = { ...defaultSettingValues(ref.gameSlug), ...ref.settings };
      const changed = Object.keys(values).filter((key) => current[key] !== values[key]);
      if (!changed.length) return { applied: {}, rejected, outcome: "unchanged" as const, state: await state() };
      ref.settings = { ...current, ...values };
      await ref.onChanged?.(ref.settings);
      const before = await state();
      if (before.status === "running") {
        const stopped = await stop();
        if (stopped.status === "failed") return { applied: values, rejected, outcome: "queued" as const, state: stopped };
        return { applied: values, rejected, outcome: "queued" as const, state: await start() };
      }
      return { applied: values, rejected, outcome: "queued" as const, state: before };
    },
    async getPlayers() { throw new ServerControlUnsupported("vps-agent", "list managed players by name"); },
    start,
    stop,
    async restart() { const stopped = await stop(); return stopped.status === "failed" ? stopped : start(); },
    async sendCommand() { throw new ServerControlUnsupported("vps-agent", "send a managed console command"); },
  };
}
