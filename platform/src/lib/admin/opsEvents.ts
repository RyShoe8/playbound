export const LAUNCHER_OPS_EVENTS = [
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
