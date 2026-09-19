/** Normalize the preferred-game set without imposing a selection limit. */
export function normalizeLfgGameSlugs(requested: unknown[]): string[] {
  return [
    ...new Set(
      requested
        .map((slug) => String(slug || "").trim())
        .filter(Boolean)
    ),
  ];
}
