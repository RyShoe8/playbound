export function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "discussion";
}

export async function uniqueTopicSlug(
  gameSlug: string,
  title: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = slugifyTitle(title);
  if (!(await exists(base))) return base;
  for (let i = 2; i < 50; i++) {
    const candidate = `${base}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
