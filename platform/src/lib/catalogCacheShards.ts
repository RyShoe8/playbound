/** Indexed slug ranges used to keep full catalog cache values below 2 MiB. */
export const CATALOG_SLUG_BOUNDS = ["g", "n", "t"] as const;

export function slugInShard(slug: string, lower?: string, upper?: string): boolean {
  return (!lower || slug >= lower) && (!upper || slug < upper);
}
