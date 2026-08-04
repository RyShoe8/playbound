/**
 * Typed event catalog for Playbound telemetry.
 *
 * `telemetry.track("game_started", { gameId, ... })` autocompletes props.
 * Unknown extra keys are still allowed via index signature on each props bag
 * so providers can receive auto-attached metadata without fighting the type.
 */

type Extra = { [key: string]: unknown };

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
  search: { query?: string; resultsCount?: number } & Extra;
  filter_changed: { surface?: string; filters?: Record<string, unknown> } & Extra;
  error: { message?: string; code?: string; source?: string } & Extra;
};

export type TelemetryEventName = keyof TelemetryEventMap;

export type TelemetryEventProps<E extends TelemetryEventName> = TelemetryEventMap[E];
