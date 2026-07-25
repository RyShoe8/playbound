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

export type LibraryEntryDTO = {
  gameSlug: string;
  saved: boolean;
  installed: boolean;
  version: string | null;
  installedAt: string | null;
  addedAt: string;
};
