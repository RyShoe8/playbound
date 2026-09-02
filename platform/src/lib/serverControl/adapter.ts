/**
 * One way to control a game server, wherever it physically runs.
 *
 * PlayBound-hosted rooms and rooms on a player's own PC present the same
 * controls, so everything above this line — party window, admin, the eventual
 * overlay — talks to this interface and never to a provider. See
 * docs/server-control.md for why the seam is here rather than around a vendor.
 *
 * An adapter declares what it can actually do. Nothing renders a control the
 * adapter cannot honour, and a method outside `capabilities` throws
 * ServerControlUnsupported rather than pretending — the same principle as the
 * multiplayer adapter rows, where absence is meaningful.
 */

import type {
  ServerSettingDefinition,
  ServerSettingValues,
} from "./settings";

export type ServerControlKind = "vps-agent" | "local";

export type ServerStatus =
  /** Process is up and reachable. */
  | "running"
  /** Deliberately not running. */
  | "stopped"
  /** Asked for, not up yet. */
  | "pending"
  /** Tried and failed; `error` says why. */
  | "failed"
  /** The control plane could not be reached, so we do not know. */
  | "unknown";

export interface ServerRuntimeState {
  status: ServerStatus;
  gameSlug: string;
  host: string | null;
  port: number | null;
  name: string | null;
  startedAt: Date | null;
  error: string | null;
}

export interface ServerPlayer {
  name: string;
  /** Provider-specific id, when there is one stable enough to act on. */
  id?: string | null;
  pingMs?: number | null;
  score?: number | null;
}

/** What the host is looking at: the controls, and what they are currently set to. */
export interface ServerSettingsView {
  gameSlug: string;
  definitions: readonly ServerSettingDefinition[];
  /** Defaults with the running server's overrides applied. */
  values: ServerSettingValues;
}

export interface ApplySettingsResult {
  /** The values that took effect. */
  applied: ServerSettingValues;
  /** Values the schema refused, with a reason each, so a form can show them all. */
  rejected: { key: string; reason: string }[];
  /**
   * What it cost. `applied-live` went over the control channel and dropped
   * nobody; `restarted` disconnected the room; `queued` is waiting for the
   * host's launcher to pick it up, because nothing can call into a home
   * machine. The distinction is the whole reason `apply` exists, so it
   * survives all the way out to the caller.
   */
  outcome: "unchanged" | "applied-live" | "restarted" | "queued";
  state: ServerRuntimeState;
}

export interface ServerControlCapabilities {
  /** Can read and change declared settings. */
  settings: boolean;
  /** Can list who is connected. Needs a live control channel. */
  players: boolean;
  /** Can run raw commands. Advanced surface only, never the primary UI. */
  console: boolean;
  /** Can restart the process in place. */
  restart: boolean;
  /** Can apply a change without restarting. False until there is an RCON channel. */
  liveApply: boolean;
}

/**
 * Thrown when a caller asks for something this adapter's `capabilities` already
 * said it cannot do. It is a programming error rather than a runtime condition —
 * the UI reads capabilities and should never have offered the control.
 */
export class ServerControlUnsupported extends Error {
  constructor(kind: ServerControlKind, operation: string) {
    super(`The ${kind} server control adapter cannot ${operation}.`);
    this.name = "ServerControlUnsupported";
  }
}

export interface ServerControlAdapter {
  readonly kind: ServerControlKind;
  readonly capabilities: ServerControlCapabilities;

  getStatus(): Promise<ServerRuntimeState>;
  getSettings(): Promise<ServerSettingsView>;
  applySettings(input: Record<string, unknown>): Promise<ApplySettingsResult>;
  getPlayers(): Promise<ServerPlayer[]>;

  start(): Promise<ServerRuntimeState>;
  stop(): Promise<ServerRuntimeState>;
  restart(): Promise<ServerRuntimeState>;

  /** Raw passthrough. Gated behind an advanced surface, never offered by default. */
  sendCommand(raw: string): Promise<string>;
}
