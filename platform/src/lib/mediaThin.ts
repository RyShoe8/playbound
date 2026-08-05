/** Browser-safe media helpers (no sharp / Node APIs). */

/** True when the gallery is empty, a single shot, or only Steam header/capsule assets. */
export function screenshotsAreThin(shots: string[] | null | undefined): boolean {
  const list = (shots ?? []).filter(Boolean);
  if (list.length <= 1) return true;
  if (list.length > 3) return false;
  return list.every((s) => /\/steam\/apps\/\d+\/(header|library_hero|capsule|logo)/i.test(s));
}

export function coverLooksLikeSteamHeader(cover: string | null | undefined): boolean {
  if (!cover) return true;
  return /\/steam\/apps\/\d+\/(header|library_hero|capsule)/i.test(cover);
}
