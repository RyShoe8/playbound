/** Field-scoped correction for the orphaned external-link mod. */
export function accessAuditModCorrection(slug: string): Readonly<Record<string, unknown>> | undefined {
  if (slug !== "diablo-2-filter") return undefined;
  return { published: false, status: "archived" };
}
