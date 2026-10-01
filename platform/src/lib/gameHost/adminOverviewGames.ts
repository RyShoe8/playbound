/** Admin testing inventory: tagged catalog games, code recipes, and agent status. */
export function dedicatedOverviewSlugs(
  communitySlugs: readonly string[],
  agentStatus: Record<string, unknown>,
  aliases: Readonly<Record<string, string>>,
  catalogSlugs: readonly string[] = []
): string[] {
  return [...new Set([...communitySlugs, ...Object.keys(agentStatus), ...catalogSlugs]
    .map((slug) => aliases[slug] || slug))]
    .sort();
}
