import crypto from "crypto";
import dbConnect from "@/lib/db";
import GameLink from "@/lib/models/GameLink";
import User from "@/lib/models/User";
import { hashLauncherToken, issueLauncherTokenForUser } from "@/lib/library";
import { SITE_URL } from "@/lib/site";

/**
 * Signing in to PlayBound from inside a game, the way TV and console apps do
 * it: the game asks for a short code, opens /link?code=… in the browser, the
 * player signs in (or creates an account) there and approves, and the game
 * — polling with a secret it alone holds — receives a bearer token.
 *
 * The token is an ordinary launcher credential (labelled with the game), so
 * every endpoint that already accepts the launcher's bearer — friends,
 * presence, play invites — works for the game too, and "disconnect" on the
 * website revokes it like any other.
 */

export const GAME_LINK_TTL_MS = 10 * 60 * 1000;
export const GAME_LINK_POLL_INTERVAL_MS = 3000;
/** No 0/O or 1/I, so a code read off a TV-distance screen can't be mistyped. */
export const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_CODE_LENGTH = 8;

export function mintLinkCode(): string {
  let code = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    code += LINK_CODE_ALPHABET[crypto.randomInt(LINK_CODE_ALPHABET.length)];
  }
  return code;
}

/** "ABCDEFGH" -> "ABCD-EFGH" for display. */
export function formatLinkCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Accepts "abcd-efgh", "ABCD EFGH" etc. Returns null if it can't be a code. */
export function normalizeLinkCode(input: unknown): string | null {
  const code = String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (code.length !== LINK_CODE_LENGTH) return null;
  for (const ch of code) {
    if (!LINK_CODE_ALPHABET.includes(ch)) return null;
  }
  return code;
}

export function gameLinkUrl(code: string): string {
  return `${SITE_URL}/link?code=${encodeURIComponent(formatLinkCode(code))}`;
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,59}$/;

export function normalizeGameSlug(input: unknown): string | null {
  const slug = String(input ?? "").trim().toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : null;
}

export function sanitizeDeviceName(input: unknown): string {
  return String(input ?? "")
    .replace(/[^\p{L}\p{N} ._'-]/gu, "")
    .trim()
    .slice(0, 60);
}

/** "hyperdisc-arena" -> "Hyperdisc Arena", for games not yet in the catalog. */
export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export async function createGameLink(opts: { gameSlug: string; deviceName: string }): Promise<{
  code: string;
  pollToken: string;
  expiresAt: Date;
}> {
  await dbConnect();
  const pollToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + GAME_LINK_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = mintLinkCode();
    try {
      await GameLink.create({
        code,
        pollTokenHash: hashLauncherToken(pollToken),
        gameSlug: opts.gameSlug,
        deviceName: opts.deviceName,
        expiresAt,
      });
      return { code, pollToken, expiresAt };
    } catch (err) {
      // Duplicate code (vanishingly rare): try another.
      if ((err as { code?: number })?.code !== 11000) throw err;
    }
  }
  throw new Error("Could not allocate a link code");
}

export type PendingGameLink = {
  code: string;
  gameSlug: string;
  deviceName: string;
  expiresAt: Date;
};

/** A link the signed-in player could still approve, for the /link page. */
export async function findPendingGameLink(code: string): Promise<PendingGameLink | null> {
  await dbConnect();
  const doc = await GameLink.findOne({ code, status: "pending", expiresAt: { $gt: new Date() } }).lean<{
    code: string;
    gameSlug: string;
    deviceName?: string;
    expiresAt: Date;
  }>();
  if (!doc) return null;
  return { code: doc.code, gameSlug: doc.gameSlug, deviceName: doc.deviceName || "", expiresAt: doc.expiresAt };
}

export type ApproveResult = "approved" | "denied" | "not_found";

/** Approve (or deny) a pending link for the signed-in user. One-shot. */
export async function respondToGameLink(code: string, userId: string, approve: boolean): Promise<ApproveResult> {
  await dbConnect();
  const now = new Date();
  const updated = await GameLink.findOneAndUpdate(
    { code, status: "pending", expiresAt: { $gt: now } },
    { $set: { status: approve ? "approved" : "denied", userId, respondedAt: now } },
    { returnDocument: "after" }
  );
  if (!updated) return "not_found";
  return approve ? "approved" : "denied";
}

export type PollResult =
  | { status: "pending" }
  | { status: "approved"; token: string; user: { id: string; username: string } }
  | { status: "denied" | "expired" | "invalid" };

/**
 * The game's poll. Once approved, the first poll claims the link and gets a
 * fresh token; any later poll with the same secret gets "invalid".
 */
export async function pollGameLink(pollToken: string): Promise<PollResult> {
  const trimmed = String(pollToken || "").trim();
  if (!trimmed || trimmed.length > 128) return { status: "invalid" };
  await dbConnect();
  const pollTokenHash = hashLauncherToken(trimmed);
  const now = new Date();
  // Atomically claim an approved link so a token is only ever minted once.
  const claimed = await GameLink.findOneAndUpdate(
    { pollTokenHash, status: "approved", expiresAt: { $gt: now } },
    { $set: { status: "claimed" } },
    { returnDocument: "after" }
  ).lean<{ userId: unknown; gameSlug: string }>();
  if (claimed) {
    const userId = String(claimed.userId);
    const user = await User.findById(userId).select("username disabled").lean<{
      username?: string;
      disabled?: boolean;
    }>();
    if (!user || user.disabled) return { status: "invalid" };
    const token = await issueLauncherTokenForUser(userId, `game:${claimed.gameSlug}`);
    return { status: "approved", token, user: { id: userId, username: String(user.username || "Player") } };
  }
  const doc = await GameLink.findOne({ pollTokenHash }).select("status expiresAt").lean<{
    status: string;
    expiresAt: Date;
  }>();
  if (!doc) return { status: "invalid" };
  if (doc.status === "denied") return { status: "denied" };
  if (doc.status === "claimed") return { status: "invalid" };
  if (new Date(doc.expiresAt).getTime() <= now.getTime()) return { status: "expired" };
  return { status: "pending" };
}
