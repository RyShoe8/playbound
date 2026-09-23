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
 * Events the analytics page always shows, however rare they are.
 *
 * Top events is a top-15 ranking over seven days, so anything that fires once
 * per install or only on failure can never appear there — it is outranked by
 * page_view and session_started forever. That is exactly backwards for
 * operational events, where a count of zero is the interesting reading.
 *
 * `launcher_install` is the case that prompted this. It fires once per launcher
 * installation and never again — settings.json survives upgrades, so even
 * reinstalling a new build does not re-fire it — which made it invisible in both
 * Top events and the latest-40 Recent events, with no way to tell "rare" from
 * "never arriving". The /admin Launcher Installs tile does not settle it either:
 * that counts distinct anonymousIds over all launcher traffic, not this event.
 *
 * Keep this list short. Every entry costs two indexed counts per page load and
 * takes a row in a table people read at a glance.
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

export type OpsFamily = "all" | "launcher" | "party";

export function eventsForFamily(family: OpsFamily): string[] | null {
  if (family === "launcher") return [...LAUNCHER_OPS_EVENTS];
  if (family === "party") return [...PARTY_OPS_EVENTS];
  return null;
}

export function familyForArea(area: string | null): OpsFamily {
  if (area === "install") return "launcher";
  if (area === "party") return "party";
  return "all";
}
