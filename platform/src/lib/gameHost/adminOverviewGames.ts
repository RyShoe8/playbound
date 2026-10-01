/** Admin-only VPS inventory: include every agent recipe, regardless of catalog publication. */
export function dedicatedOverviewSlugs(
  communitySlugs: readonly string[],
  agentStatus: Record<string, unknown>,
  aliases: Readonly<Record<string, string>>
): string[] {
  return [...new Set([...communitySlugs, ...Object.keys(agentStatus)])]
    .filter((slug) => !aliases[slug])
    .sort();
}
