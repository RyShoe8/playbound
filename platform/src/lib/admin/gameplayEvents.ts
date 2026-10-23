/** Launcher renderer events duplicate the edition-aware main-process events. */
export const PLAY_START_MATCH = {
  $or: [
    { event: "edition_launched" },
    { event: "game_started", "properties.platform": { $ne: "launcher" } },
  ],
};

export const PLAY_END_MATCH = {
  $or: [
    { event: "game_ended" },
    { event: "game_finished", "properties.platform": { $ne: "launcher" } },
  ],
};

/** A null edition is the base game; even an "official" edition has its own row. */
export const GAMEPLAY_ID = {
  gameSlug: "$properties.gameSlug",
  editionSlug: { $ifNull: ["$properties.editionSlug", null] },
};

export const PLAYER_ID = { $ifNull: ["$userId", { $ifNull: ["$anonymousId", "$sessionId"] }] };
