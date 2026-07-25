import crypto from "crypto";

export function hashLauncherToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function mintLauncherToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export type LibraryEntryDTO = {
  gameSlug: string;
  saved: boolean;
  installed: boolean;
  version: string | null;
  installedAt: string | null;
  addedAt: string;
};
