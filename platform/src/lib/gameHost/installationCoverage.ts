import { DEDICATED_ONLY_GAMES, HOSTABLE_GAMES, HOSTABLE_SLUG_ALIASES } from "./catalog";
import { INSTALLATION_UPDATE_KEYS } from "./installationKeys";
import type { InstallationCoverageRow, InstallationUpdateSnapshot } from "./installationTypes";

type Gap = Pick<InstallationCoverageRow, "category" | "reason">;
const ARCHIVE: Gap = { category: "archive", reason: "Needs a verified archive handler, installation baseline and save-preserving staged update/rollback." };
const GAPS: Record<string, Gap> = {
  "warzone-2100": { category: "custom-build", reason: "The VPS uses a custom Warzone 4.7 build and launch wrapper. Stage a matching source/asset update; do not replace it with Ubuntu's older 4.4.2 native package." },
  freeciv: { category: "custom-build", reason: "Uses a custom Freeciv 3.2.5 server/data/library build matching the client. Ubuntu's 3.1 binary is incompatible; stage and verify the complete matching build while preserving saves." },
  "medal-of-honor-allied-assault": ARCHIVE,
  "battlefield-1942-anthology": ARCHIVE, "vintage-story": ARCHIVE,
  "re-volt-rvgl": ARCHIVE, unvanquished: ARCHIVE,
  "deus-ex-goty-edition": { category: "custom-build", reason: "Needs a Wine/HX package handler that preserves the game assets and PlayBound co-op integration." },
  morrowind: { category: "archive", reason: "Needs a TES3MP-compatible archive handler that preserves Lua scripts, account data and saved worlds." },
  "hurry-curry": { category: "custom-build", reason: "Needs a source/binary update handler that retains PlayBound's player-limit patch and matching data files." },
  ysoccer: { category: "custom-build", reason: "Needs a handler for the PlayBound dedicated JAR build, including Java compatibility and rollback." },
  triplea: { category: "custom-build", reason: "Needs coordinated updates for the dedicated wrapper, server package and required Java runtime." },
  bombsquad: { category: "archive", reason: "Needs a coordinated server-package and Python runtime handler that preserves server scripts and configuration." },
  veloren: { category: "archive", reason: "Needs a verified server build/channel handler with world compatibility and save-preserving rollback checks." },
  freedoom: { category: "edition", reason: "Zandronum, Odamex and Chocolate Doom require separate engine update handlers; preserve IWADs, maps and per-server configuration." },
  "space-station-14": { category: "private-runtime", reason: "Needs a handler for the server distribution/bootstrap, .NET dependencies and per-server content/database compatibility." },
  "goldeneye-source": { category: "private-runtime", reason: "Needs coordinated Source SDK base and GoldenEye mod updates, including private runtime refresh and retained settings." },
  trackmania: { category: "private-runtime", reason: "Needs a dedicated package handler that preserves account configuration, maps and match settings." },
};
const EDITIONS: InstallationCoverageRow[] = [
  { id: "openra:combined-arms", name: "OpenRA · Combined Arms", category: "edition", reason: "Uses its own Combined Arms distribution. OpenRA's official-package update does not update this edition; a separate handler and binary verification are required." },
  { id: "openra:ra2", name: "OpenRA · Red Alert 2", category: "edition", reason: "Requires its own compatible mod/engine distribution and original assets; it is not covered by the official RA/CNC/D2K updater." },
  { id: "team-fortress-2:open-fortress", name: "Team Fortress 2 · Open Fortress", category: "edition", installationKey: "team-fortress-2", reason: "The TF2 base depot has an update handler. The Open Fortress mod overlay still needs separate compatibility, update and rollback verification." },
];

const normalize = (slug: string) => Object.hasOwn(HOSTABLE_SLUG_ALIASES, slug) ? HOSTABLE_SLUG_ALIASES[slug] : slug === "open-fortress" ? "team-fortress-2" : slug;
const title = (slug: string) => slug === "aneurism-iv" ? "ANEURISM IV" : slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

/** Read-only operational inventory. It never changes catalog content or eligibility. */
export function buildInstallationCoverage(snapshot: InstallationUpdateSnapshot): InstallationCoverageRow[] {
  const games = { ...HOSTABLE_GAMES, ...DEDICATED_ONLY_GAMES };
  const slugs = new Set([...Object.keys(games), ...(snapshot.gameSlugs || []), ...snapshot.targets.map((target) => target.key)].map(normalize));
  const keys = new Set<string>(INSTALLATION_UPDATE_KEYS);
  return [...slugs].map((slug): InstallationCoverageRow => {
    const target = snapshot.targets.find((entry) => entry.key === slug);
    const name = (Object.hasOwn(games, slug) ? games[slug].title : undefined) || target?.name || title(slug);
    if (keys.has(slug) && target) return { id: slug, name, category: "supported", installationKey: slug, reason: target.blockedReason || (target.installed ? "Coordinated update and rollback handler available." : "Handler available; installation missing, modified or incomplete. Verify the installation before queueing an update.") };
    if (keys.has(slug)) return { id: slug, name, category: "review", reason: "The current agent does not expose this update handler. Check agent deployment before queueing an update." };
    return { id: slug, name, ...(Object.hasOwn(GAPS, slug) ? GAPS[slug] : { category: "review", reason: "No reviewed update handler is declared for this recipe. Review its distribution, runtime dependencies, saves and rollback before enabling updates." }) };
  }).concat(EDITIONS).sort((left, right) => left.name.localeCompare(right.name));
}

export function withInstallationCoverage(snapshot: InstallationUpdateSnapshot) {
  return { ...snapshot, coverage: buildInstallationCoverage(snapshot) };
}
