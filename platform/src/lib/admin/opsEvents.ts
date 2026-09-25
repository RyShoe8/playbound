export const LAUNCHER_OPS_EVENTS = [
  "launcher_install",
  "launch_attempted",
  "launch_failed",
  "launch_exe_repaired",
  "install_failed",
  "edition_installed",
  "edition_launched",
  "edition_updated",
  "edition_uninstalled",
  "session_started",
  "session_ended",
  "game_ended",
  "join_attempted",
  "exe_located",
  "exe_locate_failed",
  "java_runtime_install_started",
  "java_runtime_install_succeeded",
  "java_runtime_install_failed",
  "error",
] as const;

/**
 * Events merged into Recent events on /admin/analytics, however rare they are.
 *
 * Recent events is the latest forty rows, which whatever fires most completely
 * dominates. An event that fires once per installation is therefore never in it
 * by chance, and could be arriving steadily while looking absent.
 *
 * `launcher_install` is the case that prompted this. It fires once per launcher
 * installation and never again — telemetry.js keys the receipt to
 * settings.analyticsId, and settings.json survives upgrades, so installing a
 * newer build does not re-fire it. The /admin Launcher Installs tile does not
 * settle the question either: it counts distinct anonymousIds over all traffic
 * tagged browser "Launcher", not this event, so it reads the same whether or not
 * the event has ever arrived.
 *
 * Deliberately only affects Recent events. Top events stays a straight ranking —
 * if one of these places in the top fifteen it earned the spot on its own.
 *
 * Keep this list short: it is one extra indexed query whose rows share a table
 * people read at a glance.
 */
export const PINNED_ANALYTICS_EVENTS = [
  "launcher_install",
  "launcher_connected",
  "install_failed",
  "launch_failed",
  "error",
] as const;

export const PARTY_OPS_EVENTS = [
  "party_created",
  "party_joined",
  "party_left",
  "party_ended",
  "party_member_dropped_offline",
  "party_game_set",
  "party_edition_set",
  "party_join_game",
  "party_hosted_ready",
  "party_hosted_failed",
  "party_lan_ready",
  "party_lan_failed",
  "party_failed",
  "party_config_sync",
  "party_chat_failed",
] as const;

export const COMMUNITY_OPS_EVENTS = [
  "community_server_start",
  "community_server_failed",
  "community_server_recovery",
  "community_server_recovery_exhausted",
  "community_server_rotated",
  "community_server_stop_failed",
  "community_server_capacity_blocked",
  "community_server_reconcile_failed",
] as const;

export type OpsFamily = "all" | "launcher" | "party" | "servers";

export function eventsForFamily(family: OpsFamily): string[] | null {
  if (family === "launcher") return [...LAUNCHER_OPS_EVENTS];
  if (family === "party") return [...PARTY_OPS_EVENTS];
  if (family === "servers") return [...COMMUNITY_OPS_EVENTS];
  return null;
}

export function familyForArea(area: string | null): OpsFamily {
  if (area === "install") return "launcher";
  if (area === "party") return "party";
  if (area === "hosting" || area === "servers") return "servers";
  return "all";
}
