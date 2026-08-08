/**
 * Typed event catalog for Playbound telemetry.
 *
 * `telemetry.track("game_started", { gameId, ... })` autocompletes props.
 * Unknown extra keys are still allowed via index signature on each props bag
 * so providers can receive auto-attached metadata without fighting the type.
 */

type Extra = { [key: string]: unknown };

/**
 * Identity carried by every edition-scoped event.
 *
 * Kept as one alias so adding a dimension later (edition type, certification
 * level) reaches all edition events at once instead of drifting per event.
 */
type EditionProps = {
  gameId?: string;
  gameSlug?: string;
  gameTitle?: string;
  editionId?: string;
  editionSlug?: string;
  editionName?: string;
  editionType?: string;
};

export type TelemetryEventMap = {
  page_view: { path?: string; title?: string } & Extra;
  signup: { method?: string } & Extra;
  login: { method?: string } & Extra;
  logout: Extra;
  game_viewed: { gameId?: string; gameSlug?: string; gameTitle?: string } & Extra;
  game_started: {
    gameId?: string;
    gameSlug?: string;
    gameTitle?: string;
    installMethod?: string;
    platform?: string;
  } & Extra;
  game_finished: { gameId?: string; gameSlug?: string; durationMs?: number } & Extra;
  game_installed: {
    gameId?: string;
    gameSlug?: string;
    installMethod?: string;
  } & Extra;
  /** First-time PlayBound launcher account link (not reconnects). */
  launcher_connected: { firstConnect?: boolean } & Extra;
  mod_installed: {
    modSlug?: string;
    baseGameSlug?: string;
    installMethod?: string;
    version?: string;
  } & Extra;
  install_clicked: {
    gameId?: string;
    gameSlug?: string;
    source?: string;
  } & Extra;
  steam_clicked: { gameId?: string; gameSlug?: string; steamAppId?: string } & Extra;
  official_download_clicked: {
    gameId?: string;
    gameSlug?: string;
    url?: string;
  } & Extra;
  favorite_added: { gameId?: string; gameSlug?: string } & Extra;
  favorite_removed: { gameId?: string; gameSlug?: string } & Extra;
  review_created: { gameId?: string; gameSlug?: string; rating?: number } & Extra;
  review_updated: { gameId?: string; gameSlug?: string; rating?: number } & Extra;
  discussion_created: { gameId?: string; topicId?: string } & Extra;
  discussion_reply: { topicId?: string; gameId?: string } & Extra;
  discussion_upvote: { topicId?: string; targetType?: string } & Extra;
  discussion_report: { topicId?: string; reason?: string } & Extra;
  guide_viewed: { guideId?: string; gameSlug?: string } & Extra;
  server_viewed: { serverId?: string; gameSlug?: string } & Extra;
  server_join_clicked: { serverId?: string; gameSlug?: string } & Extra;
  discord_clicked: { source?: string } & Extra;
  newsletter_signup: { source?: string } & Extra;
  newsletter_unsubscribe: Extra;
  achievement_earned: { achievementId?: string; gameSlug?: string } & Extra;
  /**
   * ── Editions ────────────────────────────────────────────────────────────
   * Every edition event carries both gameId/gameSlug and editionId/editionSlug
   * so funnels can be read at either level: "how many installs did World of
   * Warcraft get" and "how many of those were Turtle WoW".
   *
   * `editionId` is the database id, or `virtual:<gameSlug>` for the synthesized
   * Official edition of a game that has none stored — so games predating
   * editions still report cleanly instead of dropping out of the funnel.
   *
   * These are additive. The existing game_* events above are unchanged and
   * still fire; edition events sit alongside them rather than replacing them.
   */
  edition_view: EditionProps & Extra;
  edition_installed: EditionProps & { installMethod?: string; version?: string } & Extra;
  edition_launched: EditionProps & { installMethod?: string } & Extra;
  edition_updated: EditionProps & { fromVersion?: string; toVersion?: string } & Extra;
  edition_uninstalled: EditionProps & Extra;
  edition_install_clicked: EditionProps & { installMethod?: string; source?: string } & Extra;
  edition_community_clicked: EditionProps & { destination?: string } & Extra;

  /**
   * Play sessions, reported by the launcher.
   *
   * `game_ended` is edition-aware and distinct from the older `game_finished`
   * above, which is kept firing so existing dashboards keep working.
   */
  game_ended: EditionProps & { durationMs?: number } & Extra;
  session_started: EditionProps & { sessionKind?: string } & Extra;
  session_ended: EditionProps & { durationMs?: number; sessionKind?: string } & Extra;

  search: { query?: string; resultsCount?: number } & Extra;
  filter_changed: { surface?: string; filters?: Record<string, unknown> } & Extra;
  error: { message?: string; code?: string; source?: string } & Extra;

  friend_invite_sent: { mode?: string } & Extra;
  friend_request_sent: { targetUserId?: string } & Extra;
  friend_request_accepted: { friendshipId?: string; via?: string } & Extra;
  friend_request_declined: { friendshipId?: string } & Extra;
  friend_removed: { friendId?: string } & Extra;
  user_blocked: { targetUserId?: string } & Extra;
  friends_page_viewed: Extra;
  friend_profile_viewed: { username?: string } & Extra;
  friend_view_game_clicked: { gameSlug?: string; friendId?: string } & Extra;
  friend_discord_clicked: { source?: string } & Extra;
  appear_offline_toggled: { enabled?: boolean } & Extra;

  hardware_profile_created: {
    os?: string;
    arch?: string;
    cpuTier?: string;
    gpuTier?: string;
    ramMB?: number | null;
    gpuCount?: number;
  } & Extra;
  hardware_profile_updated: {
    os?: string;
    arch?: string;
    cpuTier?: string;
    gpuTier?: string;
    ramMB?: number | null;
    gpuCount?: number;
  } & Extra;
  hardware_profile_deleted: Extra;
  compatibility_checked: { gameSlug?: string; verdict?: string; hasProfile?: boolean } & Extra;
  game_compatibility_viewed: { gameSlug?: string; verdict?: string } & Extra;
  hardware_details_expanded: Extra;
  runs_great_filter_used: { filter?: string } & Extra;
  check_compatibility_cta_clicked: { gameSlug?: string; surface?: string } & Extra;

  /** Reserved for future opt-in anonymized FPS samples — not emitted yet. */
  // performance_sample_recorded: { gameSlug?: string; hardwareClass?: string } & Extra;

  /** User clicked Play / launcher started a launch attempt. */
  launch_attempted: EditionProps & {
    platform?: string;
    launcherVersion?: string;
    phase?: string;
  } & Extra;

  /** Launch did not reach a tracked play session (Java missing, spawn fail, etc.). */
  launch_failed: EditionProps & {
    code?: string;
    message?: string;
    platform?: string;
    launcherVersion?: string;
    phase?: string;
  } & Extra;

  java_runtime_install_started: { version?: string; surface?: string } & Extra;
  java_runtime_install_succeeded: { version?: string; surface?: string } & Extra;
  java_runtime_install_failed: { message?: string; surface?: string } & Extra;
};

export type TelemetryEventName = keyof TelemetryEventMap;

export type TelemetryEventProps<E extends TelemetryEventName> = TelemetryEventMap[E];
