/** Canonical username key — uniqueness is case-insensitive. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
