/*
 * Who could play what, and when. No DOM and no other imports, so the launcher
 * home page, the Friend View window and the tests can all share it. Mirrors
 * platform/src/lib/friends/playPreferences.ts and the matching in the website's
 * HomePlayTogether panel.
 */
const formatters = new Map();

export const defaultPlayPreferences = { mode: "any", genres: [], games: [], downloads: false };
export const QUARTER_HOUR = 15 * 60000;
export const PLAN_LENGTH = 2 * 3600000;
const MATCH_HORIZON = 6 * 3600000;

export function availableAt(availability, time) {
  const w = availability.window;
  if (w && Date.parse(w.startsAt) <= time && time < Date.parse(w.endsAt)) return true;
  if (!availability.weekly.length) return false;
  let formatter = formatters.get(availability.timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: availability.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (formatters.size > 64) formatters.clear();
    formatters.set(availability.timezone, formatter);
  }
  const parts = formatter.formatToParts(time);
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday"));
  const minute = Number(value("hour")) * 60 + Number(value("minute"));
  return availability.weekly.some((slot) => slot.day === day && minute >= slot.startMinute && minute < slot.endMinute);
}

export function acceptsGame(preferences, game) {
  if (preferences.mode === "any") return true;
  return preferences.mode === "games" ? preferences.games.includes(game.slug) : game.genres.some((genre) => preferences.genres.includes(genre));
}

/** Weekly slots start on minute boundaries; one-time windows keep their exact start. */
export function nextPlayTime(availability, start, horizon) {
  if (availableAt(availability, start)) return start;
  const exact = availability.window && Date.parse(availability.window.startsAt);
  const windowStart = exact && exact > start && exact <= horizon ? exact : undefined;
  if (availability.weekly.length) {
    for (let t = Math.floor(start / 60000) * 60000 + 60000; t <= (windowStart ?? horizon); t += 60000) {
      if (availableAt(availability, t)) return t;
    }
  }
  return windowStart;
}

/** The next six hours, on the quarter hour. */
export function timeSlots(now) {
  return Array.from({ length: 24 }, (_, index) => (Math.floor(now / QUARTER_HOUR) + 1 + index) * QUARTER_HOUR);
}

/** Paid unless the catalog says otherwise: calling a paid game a free download would mislead both players. */
function isFreeInstall(game) {
  if (!(game.launchMethods || []).includes("install")) return false;
  if (game.access) return game.access.priceType === "FREE" && !game.access.requiresBaseGameAssets && !game.access.requiresOwnedBaseGame;
  return game.accessTier !== "VALUE" && !(game.fromPriceCents > 0);
}

export function toMatchGame(game) {
  return { slug: game.slug, title: game.title, genres: game.genres || [], free: isFreeInstall(game) };
}

/** Friends who could play at or after `when`, soonest first, each with the best game for the two of you. */
export function findMatches({ friends, preferences }, games, when, now) {
  const mine = preferences || defaultPlayPreferences;
  return (friends || []).flatMap((friend) => {
    const theirs = friend.preferences || defaultPlayPreferences;
    const shared = new Set((friend.sharedGames || []).map((game) => game.slug));
    const acceptable = games.filter((game) => acceptsGame(mine, game) && acceptsGame(theirs, game));
    const game = acceptable.find((candidate) => shared.has(candidate.slug)) ||
      acceptable.find((candidate) => candidate.free && mine.downloads && theirs.downloads);
    if (!game) return [];
    const at = nextPlayTime(friend.availability, when || now, now + MATCH_HORIZON);
    return at ? [{ friend, game, at, installed: shared.has(game.slug) }] : [];
  }).sort((a, b) => a.at - b.at || Number(b.installed) - Number(a.installed) || a.friend.username.localeCompare(b.friend.username));
}
