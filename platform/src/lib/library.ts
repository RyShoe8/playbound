import crypto from "crypto";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

/** Durable launcher bearer validity window (rotated on every handoff exchange). */
export const LAUNCHER_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** One-time deep-link handoff code lifetime. */
export const LAUNCHER_HANDOFF_TTL_MS = 2 * 60 * 1000;

export function hashLauncherToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function mintLauncherToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function mintLauncherHandoffCode(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** Mint a new launcher token for a user (invalidates any previous token). */
export async function issueLauncherTokenForUser(userId: string): Promise<string> {
  await dbConnect();
  const token = mintLauncherToken();
  await User.findByIdAndUpdate(userId, {
    launcherTokenHash: hashLauncherToken(token),
    launcherTokenCreatedAt: new Date(),
  });
  return token;
}

/** Issue a short-lived one-time handoff code (does not touch the durable bearer). */
export async function issueLauncherHandoffForUser(userId: string): Promise<string> {
  await dbConnect();
  const code = mintLauncherHandoffCode();
  await User.findByIdAndUpdate(userId, {
    launcherHandoffHash: hashLauncherToken(code),
    launcherHandoffExpiresAt: new Date(Date.now() + LAUNCHER_HANDOFF_TTL_MS),
  });
  return code;
}

/**
 * Exchange a one-time handoff code for a fresh durable bearer.
 * Invalidates the code (even on failure after lookup) to prevent reuse.
 */
export async function exchangeLauncherHandoffCode(
  code: string
): Promise<{ userId: string; token: string; firstConnect: boolean } | null> {
  const trimmed = String(code || "").trim();
  if (!trimmed || trimmed.length > 128) return null;

  await dbConnect();
  const hash = hashLauncherToken(trimmed);
  const user = await User.findOne({ launcherHandoffHash: hash }).select(
    "+launcherHandoffHash +launcherHandoffExpiresAt +launcherTokenHash _id disabled"
  );
  if (!user || user.disabled) return null;

  const expiresAt = user.launcherHandoffExpiresAt
    ? new Date(user.launcherHandoffExpiresAt).getTime()
    : 0;
  // Burn handoff regardless of validity so a stolen expired code cannot be retried
  // against a reminted window, and a successful exchange cannot be replayed.
  await User.findByIdAndUpdate(user._id, {
    $unset: { launcherHandoffHash: 1, launcherHandoffExpiresAt: 1 },
  });

  if (!expiresAt || Date.now() > expiresAt) return null;

  const firstConnect = !user.launcherTokenHash;
  const token = await issueLauncherTokenForUser(user._id.toString());
  return { userId: user._id.toString(), token, firstConnect };
}

function launcherTokenExpired(createdAt: Date | null | undefined): boolean {
  if (!createdAt) return true;
  return Date.now() - new Date(createdAt).getTime() > LAUNCHER_TOKEN_TTL_MS;
}

/**
 * Resolve the user behind a launcher `Authorization: Bearer <token>` header.
 *
 * Returns null for a missing/malformed/unknown token *and* for accounts that
 * have since been disabled — a ban has to revoke the launcher too, otherwise
 * the desktop app keeps syncing long after the web session is cut off.
 * Also rejects tokens older than {@link LAUNCHER_TOKEN_TTL_MS}.
 */
export async function userFromLauncherBearer(req: Request) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  if (!match?.[1]) return null;

  await dbConnect();
  const user = await User.findOne({
    launcherTokenHash: hashLauncherToken(match[1].trim()),
  }).select("+launcherTokenHash +launcherTokenCreatedAt _id disabled email username role tester");

  if (!user || user.disabled) return null;
  if (launcherTokenExpired(user.launcherTokenCreatedAt as Date | undefined)) return null;
  return user;
}

export type LibraryEntryDTO = {
  gameSlug: string;
  saved: boolean;
  installed: boolean;
  version: string | null;
  installedAt: string | null;
  addedAt: string;
};
