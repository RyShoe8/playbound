import crypto from "crypto";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

export function hashLauncherToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function mintLauncherToken(): string {
  return crypto.randomBytes(32).toString("hex");
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

/**
 * Resolve the user behind a launcher `Authorization: Bearer <token>` header.
 *
 * Returns null for a missing/malformed/unknown token *and* for accounts that
 * have since been disabled — a ban has to revoke the launcher too, otherwise
 * the desktop app keeps syncing long after the web session is cut off.
 */
export async function userFromLauncherBearer(req: Request) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  if (!match?.[1]) return null;

  await dbConnect();
  const user = await User.findOne({
    launcherTokenHash: hashLauncherToken(match[1].trim()),
  }).select("+launcherTokenHash _id disabled email username role tester");

  if (!user || user.disabled) return null;
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
