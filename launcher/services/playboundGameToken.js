/**
 * Signs PlayBound-native games in with the launcher's account.
 *
 * Before such a game starts, the launcher asks the site for a token scoped to
 * that game (POST /api/game-auth/launcher-token) and passes it in the
 * PLAYBOUND_TOKEN environment variable. The game uses it for friends,
 * presence and invites, so the player never sees a sign-in prompt. The game
 * gets its own revocable credential, never the launcher's.
 *
 * Best effort: when the launcher is signed out or the site is unreachable the
 * game simply starts signed out (it can still sign in by itself).
 */

"use strict";

/** Games built on PlayBound accounts (they read PLAYBOUND_TOKEN). */
const PLAYBOUND_NATIVE_GAMES = new Set(["hyperdisc-arena"]);
const TOKEN_TIMEOUT_MS = 8000;

function isPlayboundNativeGame(slug) {
  return PLAYBOUND_NATIVE_GAMES.has(String(slug || "").toLowerCase());
}

/**
 * Resolves to the game token, or null. Never throws.
 * @param {{ slug: string, launcherToken?: string|null, apiBase: string, fetchImpl?: typeof fetch }} opts
 */
async function fetchGameToken({ slug, launcherToken, apiBase, fetchImpl = fetch }) {
  if (!isPlayboundNativeGame(slug) || !launcherToken) return null;
  try {
    const res = await fetchImpl(`${apiBase}/api/game-auth/launcher-token`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${launcherToken}`,
        "content-type": "application/json",
        "user-agent": "playbound-launcher",
      },
      body: JSON.stringify({ gameSlug: String(slug).toLowerCase() }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.token === "string" && data.token ? data.token : null;
  } catch {
    return null;
  }
}

/** The env to launch with: base plus PLAYBOUND_TOKEN when there is one. */
function withGameToken(baseEnv, token) {
  if (!token) return baseEnv;
  return { ...(baseEnv || process.env), PLAYBOUND_TOKEN: token };
}

module.exports = { PLAYBOUND_NATIVE_GAMES, isPlayboundNativeGame, fetchGameToken, withGameToken };
