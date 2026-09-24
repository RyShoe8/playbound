export function rotationPriority(
  now: Date,
  profile: { key: string; weight?: number },
  history: { profileKey: string; onlineSince?: Date | string | null }[]
): number {
  const last = history.filter((row) => row.profileKey === profile.key && row.onlineSince)
    .reduce((maximum, row) => Math.max(maximum, new Date(row.onlineSince!).getTime()), 0);
  // Unserved profiles go first; weight breaks ties and then influences how
  // quickly a previously served profile comes around again.
  const minutesAbsent = last ? Math.max(0, (now.getTime() - last) / 60_000) : 1_000_000;
  return minutesAbsent * Math.max(1, profile.weight || 1);
}
