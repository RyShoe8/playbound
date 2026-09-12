/**
 * Semver helpers for launcher / mirror artifact version picks.
 * Kept tiny and dependency-free — shared by admin list filtering and public download.
 */

export function parseSemVer(v: string | null | undefined): number[] {
  if (!v) return [0];
  const parts = String(v)
    .replace(/^[^\d]*/, "")
    .split(/[^\d]+/)
    .map((n) => parseInt(n, 10))
    .filter((n) => !isNaN(n));
  return parts.length ? parts : [0];
}

export function compareSemVer(a: string | null | undefined, b: string | null | undefined): number {
  const pA = parseSemVer(a);
  const pB = parseSemVer(b);
  const len = Math.max(pA.length, pB.length);
  for (let i = 0; i < len; i++) {
    const numA = pA[i] ?? 0;
    const numB = pB[i] ?? 0;
    if (numA !== numB) return numA - numB;
  }
  return 0;
}

export function launcherPlatformFromArtifactId(artifactId: string): string {
  const match = String(artifactId || "").match(/playbound-launcher-([a-z0-9]+)-(.+)/i);
  return match ? match[1].toLowerCase() : "windows";
}

export function launcherVersionFromArtifact(art: {
  artifactId?: string | null;
  version?: string | null;
}): string {
  if (art.version) return String(art.version);
  const match = String(art.artifactId || "").match(/playbound-launcher-[a-z0-9]+-(.+)/i);
  return match ? match[1] : "0.0.0";
}

/** Highest semver wins. Tie-break: prefer verified VPS, then R2 cached. */
export function pickLatestLauncherArtifact<
  T extends {
    artifactId?: string | null;
    version?: string | null;
    vpsStatus?: string | null;
    r2Status?: string | null;
  },
>(artifacts: T[]): T | null {
  if (!artifacts.length) return null;
  return artifacts.slice().sort((a, b) => {
    const ver = compareSemVer(launcherVersionFromArtifact(b), launcherVersionFromArtifact(a));
    if (ver) return ver;
    const score = (x: T) =>
      (x.vpsStatus === "verified" ? 2 : 0) + (x.r2Status === "cached" ? 1 : 0);
    return score(b) - score(a);
  })[0];
}
