import { DEDICATED_ONLY_GAMES, HOSTABLE_GAMES, HOSTABLE_SLUG_ALIASES } from "./catalog";
import { INSTALLATION_UPDATE_KEYS } from "./installationKeys";
import type { InstallationCoverageRow, InstallationUpdateSnapshot } from "./installationTypes";

type Gap = Pick<InstallationCoverageRow, "category" | "reason">;
const ARCHIVE: Gap = { category: "archive", reason: "Needs a verified archive handler, installation baseline and save-preserving staged update/rollback." };
const GAPS: Record<string, Gap> = {
  "vintage-story": ARCHIVE,
  "deus-ex-goty-edition": { category: "custom-build", reason: "Needs a Wine/HX package handler that preserves the game assets and PlayBound co-op integration." },
  "goldeneye-source": { category: "private-runtime", reason: "Needs coordinated Source SDK base and GoldenEye mod updates, including private runtime refresh and retained settings." },
};
const EDITIONS: InstallationCoverageRow[] = [
  { id: "openra:combined-arms", name: "OpenRA · Combined Arms", category: "edition", installationKey: "combined-arms", reason: "Separate official Combined Arms package; verify agent deployment, installation and compatibility before queueing its update." },
  { id: "openra:ra2", name: "OpenRA · Romanov's Vengeance (Red Alert 2)", category: "edition", installationKey: "romanovs-vengeance", reason: "Uses the separate Romanov's Vengeance rv engine/mod distribution." },
  { id: "openra:tiberian-dawn-hd", name: "OpenRA · Tiberian Dawn HD", category: "edition", installationKey: "tiberian-dawn-hd", reason: "Uses its own HD engine package, not the stock Tiberian Dawn engine." },
  { id: "openra:crystallized-nexus", name: "OpenRA · Crystallized Nexus", category: "edition", installationKey: "crystallized-nexus", reason: "Uses the cn package matching the catalog's pinned playtest; newer game packages require client compatibility review." },
  { id: "team-fortress-2:open-fortress", name: "Team Fortress 2 · Open Fortress", category: "edition", installationKey: "open-fortress", reason: "Uses its separate reviewed Source SDK/Open Fortress package." },
];

const normalize = (slug: string) => Object.hasOwn(HOSTABLE_SLUG_ALIASES, slug) ? HOSTABLE_SLUG_ALIASES[slug] : slug === "deus-ex" ? "deus-ex-goty-edition" : slug === "open-fortress" ? "team-fortress-2" : slug;
const title = (slug: string) => slug === "aneurism-iv" ? "ANEURISM IV" : slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

/** Read-only operational inventory. It never changes catalog content or eligibility. */
export function buildInstallationCoverage(snapshot: InstallationUpdateSnapshot): InstallationCoverageRow[] {
  const games = { ...HOSTABLE_GAMES, ...DEDICATED_ONLY_GAMES };
  const slugs = new Set([...Object.keys(games), ...(snapshot.gameSlugs || []), ...snapshot.targets.map((target) => target.key)].map(normalize));
  const keys = new Set<string>(INSTALLATION_UPDATE_KEYS);
  const editionKeys = new Set(EDITIONS.map(edition => edition.installationKey));
  return [...slugs].filter((slug) => !editionKeys.has(slug)).map((slug): InstallationCoverageRow => {
    const key = slug === "deus-ex-goty-edition" ? "deus-ex" : slug === "medal-of-honor-allied-assault" ? "openmohaa" : slug;
    const target = snapshot.targets.find((entry) => entry.key === key);
    const name = (Object.hasOwn(games, slug) ? games[slug].title : undefined) || target?.name || title(slug);
    if (keys.has(key) && target) return { id: slug, name, category: "supported", installationKey: key, reason: target.blockedReason || (target.installed ? "Coordinated update and rollback handler available." : "Handler available; installation missing, modified or incomplete. Verify the installation before queueing an update.") };
    if (keys.has(key)) return { id: slug, name, category: "review", reason: "The current agent does not expose this update handler. Check agent deployment before queueing an update." };
    return { id: slug, name, ...(Object.hasOwn(GAPS, slug) ? GAPS[slug] : { category: "review", reason: "No reviewed update handler is declared for this recipe. Review its distribution, runtime dependencies, saves and rollback before enabling updates." }) };
  }).concat(EDITIONS.map((edition): InstallationCoverageRow => {
    const target = snapshot.targets.find(row => row.key === edition.installationKey);
    return target ? { ...edition, category: "supported", reason: target.blockedReason || (target.installed ? "Separate matching engine/mod update and rollback handler available." : "Handler available; verify this edition's missing or modified package before updating.") }
      : { ...edition, category: "review", installationKey: undefined, reason: "The current agent does not expose this edition's separate handler. Deploy and verify its matching distribution first." };
  })).sort((left, right) => left.name.localeCompare(right.name));
}

export function withInstallationCoverage(snapshot: InstallationUpdateSnapshot) {
  return { ...snapshot, coverage: buildInstallationCoverage(snapshot) };
}
