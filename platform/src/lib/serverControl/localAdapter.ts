/**
 * Server control for a room hosted on the leader's own PC.
 *
 * Read docs/server-control.md before changing this. The shape follows from one
 * fact that is easy to forget: **nothing can call into a home machine.** That
 * is why Connect exists at all, and it means this adapter cannot talk to the
 * server. It records what the host wants and the leader's launcher reconciles
 * against it.
 *
 * So `applySettings` returns `queued` — honest, and what the panel has to be
 * able to show. The launcher acks by reporting the revision it has actually
 * applied.
 *
 * What crosses the boundary is *desired state*, never a command. The launcher
 * owns the dedicated process and decides how to reach that state, so a
 * compromised platform can ask for a different map and nothing else. The
 * command-relay design this replaced could not offer that.
 */

import {
  ServerControlUnsupported,
  type ApplySettingsResult,
  type ServerControlAdapter,
  type ServerControlCapabilities,
  type ServerPlayer,
  type ServerRuntimeState,
  type ServerSettingsView,
} from "./adapter";
import {
  coerceSettingValues,
  defaultSettingValues,
  getServerSettingProfile,
  type ServerSettingValues,
} from "./settings";

export interface LocalRoomRef {
  partyId: string;
  gameSlug: string;
  /** The launcher has confirmed a listener; before that there is no server. */
  ready: boolean;
  host: string | null;
  port: number | null;
  /** What the host has asked for. */
  settings: ServerSettingValues;
  /** Bumped on every change; the launcher reports back the one it has applied. */
  desiredRevision: number;
  appliedRevision: number;
  lastError?: string | null;
}

export interface LocalAdapterOptions {
  room: LocalRoomRef;
  /** Persist desired state. The adapter does not own the party document. */
  save?: (next: { settings: ServerSettingValues; desiredRevision: number }) => Promise<void>;
}

/**
 * A local dedicated server is a process the launcher started, not the host's
 * game — so restarting it is a real control rather than a crash with a button
 * on it. It disconnects the room, exactly like restarting the VPS one.
 */
function capabilitiesFor(): ServerControlCapabilities {
  return {
    settings: true,
    restart: true,
    /*
     * Everything is delivered at spawn, so every change costs a restart no
     * matter what the game's schema says an individual setting could do. The
     * panel reads this rather than the apply mode alone — a warning that says
     * "nobody is disconnected" over a restart would be worse than no warning.
     */
    liveApply: false,
    players: false,
    console: false,
  };
}

export function createLocalAdapter(opts: LocalAdapterOptions): ServerControlAdapter {
  const ref: LocalRoomRef = { ...opts.room, settings: { ...opts.room.settings } };

  function state(): ServerRuntimeState {
    /*
     * Behind means the launcher has not yet caught up with a change, which is
     * "pending" rather than "running" — the room on the host's PC is still the
     * old one, and saying otherwise would have the panel show settings that
     * are not in force.
     */
    const behind = ref.appliedRevision < ref.desiredRevision;
    return {
      status: ref.lastError ? "failed" : !ref.ready ? "pending" : behind ? "pending" : "running",
      gameSlug: ref.gameSlug,
      host: ref.ready ? ref.host : null,
      port: ref.ready ? ref.port : null,
      name: null,
      startedAt: null,
      error: ref.lastError ?? null,
    };
  }

  return {
    kind: "local",
    capabilities: capabilitiesFor(),

    async getStatus() {
      return state();
    },

    async getSettings(): Promise<ServerSettingsView> {
      const profile = getServerSettingProfile(ref.gameSlug);
      // Our record is the only record: there is no agent on the host's machine
      // that we can ask what the server was started with.
      return {
        gameSlug: ref.gameSlug,
        definitions: profile?.settings ?? [],
        values: { ...defaultSettingValues(ref.gameSlug), ...ref.settings },
      };
    },

    async applySettings(input: Record<string, unknown>): Promise<ApplySettingsResult> {
      const { values, rejected } = coerceSettingValues(ref.gameSlug, input);
      const current = { ...defaultSettingValues(ref.gameSlug), ...ref.settings };
      const changed = Object.keys(values).filter((key) => current[key] !== values[key]);

      if (!changed.length) {
        return { applied: {}, rejected, outcome: "unchanged", state: state() };
      }
      if (!getServerSettingProfile(ref.gameSlug)) {
        throw new ServerControlUnsupported("local", "change settings on this game");
      }

      ref.settings = { ...ref.settings, ...Object.fromEntries(changed.map((k) => [k, values[k]])) };
      ref.desiredRevision += 1;
      await opts.save?.({ settings: ref.settings, desiredRevision: ref.desiredRevision });

      return {
        applied: Object.fromEntries(changed.map((k) => [k, values[k]])),
        rejected,
        outcome: "queued",
        state: state(),
      };
    },

    async restart(): Promise<ServerRuntimeState> {
      /*
       * A restart with no settings change is still a new revision. The launcher
       * reconciles on the number, so bumping it is the only way to ask for one —
       * and it is why the field is a revision rather than a settings hash.
       */
      ref.desiredRevision += 1;
      await opts.save?.({ settings: ref.settings, desiredRevision: ref.desiredRevision });
      return state();
    },

    async start(): Promise<ServerRuntimeState> {
      return this.restart();
    },

    async stop(): Promise<ServerRuntimeState> {
      throw new ServerControlUnsupported("local", "stop a server from off the host's machine");
    },
    async getPlayers(): Promise<ServerPlayer[]> {
      throw new ServerControlUnsupported("local", "list connected players");
    },
    async sendCommand(): Promise<string> {
      throw new ServerControlUnsupported("local", "run raw commands");
    },
  };
}
