/**
 * Verifies the `activelyMaintained` criterion against upstream repositories.
 *
 * Upstream activity is an internal signal for the "plays reliably" criterion
 * (still stored as `activelyMaintained`). The published bar is now about a
 * real play session, not a twelve-month commit rule — this script still flags
 * stale repos so editors can re-play and re-verify.
 *
 * Usage:
 *   npm run verify:maintenance
 *   GITHUB_TOKEN=ghp_... npm run verify:maintenance   (higher rate limit)
 *
 * Exits non-zero if any game claiming active maintenance has no upstream
 * activity within the threshold, if its assessment date is stale, or if a
 * claim cannot be verified at all. Silence is not the same as verification.
 */

/** Criterion 3: a release or meaningful commit within twelve months. */
const MAINTENANCE_MONTHS = 12;
/** Re-verify assessments at least twice a year. */
const VERIFICATION_STALE_DAYS = 180;

type Activity =
  | { ok: true; newest: Date | null; archived: boolean }
  | { ok: false; reason: string };

async function latestActivity(repo: string, token?: string): Promise<Activity> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "playbound-maintenance-check",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!res.ok) return { ok: false, reason: `GitHub returned ${res.status} for ${repo}` };

  const data = (await res.json()) as { pushed_at?: string; archived?: boolean };
  const dates: Date[] = [];
  if (data.pushed_at) dates.push(new Date(data.pushed_at));

  const relRes = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers,
  });
  if (relRes.ok) {
    const rel = (await relRes.json()) as { published_at?: string };
    if (rel.published_at) dates.push(new Date(rel.published_at));
  }

  dates.sort((a, b) => b.getTime() - a.getTime());
  return { ok: true, newest: dates[0] ?? null, archived: Boolean(data.archived) };
}

const monthsSince = (d: Date) =>
  (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
const daysSince = (d: Date) => (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);

async function main() {
  const token = process.env.GITHUB_TOKEN;
  // Imported rather than scraped from source — the data is the source of truth.
  const { games } = await import("../src/lib/data/games");
  const { maintenanceChecks } = await import("../src/lib/data/editorial");

  const problems: string[] = [];
  const rows: [string, string, string][] = [];

  for (const game of games) {
    const bar = game.qualityBar;

    if (!bar) {
      problems.push(`${game.slug}: no qualityBar assessment`);
      rows.push([game.slug, "-", "no assessment"]);
      continue;
    }

    if (!bar.lastVerified) {
      problems.push(`${game.slug}: no lastVerified date`);
    } else {
      const age = daysSince(new Date(bar.lastVerified));
      if (age > VERIFICATION_STALE_DAYS) {
        problems.push(
          `${game.slug}: lastVerified is ${Math.round(age)} days old (limit ${VERIFICATION_STALE_DAYS})`
        );
      }
    }

    if (!bar.activelyMaintained) {
      rows.push([game.slug, "not claimed", "-"]);
      continue;
    }

    // Explicit override wins: several projects do not develop on GitHub, or
    // develop somewhere other than the repo used for release downloads.
    const override = maintenanceChecks[game.slug];

    if (override?.kind === "manual") {
      const age = daysSince(new Date(override.checkedAt));
      const label = `manual ${override.checkedAt} (${Math.round(age)}d ago) - ${override.url}`;
      if (age > VERIFICATION_STALE_DAYS) {
        problems.push(
          `${game.slug}: manual maintenance check is ${Math.round(age)} days old (limit ${VERIFICATION_STALE_DAYS}). Re-check ${override.url} and update checkedAt.`
        );
        rows.push([game.slug, "claimed", `STALE MANUAL - ${override.url}`]);
      } else {
        rows.push([game.slug, "claimed", label]);
      }
      continue;
    }

    const repo = override?.kind === "github" ? override.repo : game.githubRepo;

    if (!repo) {
      // The claim may well be true, but nothing here can confirm it. Fail loudly
      // rather than report a false pass — silence is not verification.
      problems.push(
        `${game.slug}: claims active maintenance with no verification source. Add an entry to maintenanceChecks in editorial.ts.`
      );
      rows.push([game.slug, "claimed", "NO VERIFICATION SOURCE"]);
      continue;
    }

    const activity = await latestActivity(repo, token);
    if (!activity.ok) {
      problems.push(`${game.slug}: ${activity.reason}`);
      rows.push([game.slug, "claimed", `ERROR: ${activity.reason}`]);
      continue;
    }

    if (activity.archived) {
      problems.push(`${game.slug}: ${repo} is archived upstream`);
      rows.push([game.slug, "claimed", "ARCHIVED UPSTREAM"]);
      continue;
    }

    if (!activity.newest) {
      problems.push(`${game.slug}: no upstream activity dates found`);
      rows.push([game.slug, "claimed", "no activity found"]);
      continue;
    }

    const months = monthsSince(activity.newest);
    const label = `${activity.newest.toISOString().slice(0, 10)} (${months.toFixed(1)}mo ago)`;
    if (months > MAINTENANCE_MONTHS) {
      problems.push(
        `${game.slug}: last upstream activity ${months.toFixed(1)} months ago, but activelyMaintained is true`
      );
      rows.push([game.slug, "claimed", `STALE — ${label}`]);
    } else {
      rows.push([game.slug, "claimed", label]);
    }
  }

  const width = Math.max(...rows.map((r) => r[0].length), 8);
  console.log("\nPlayBound Bar — criterion 3 (actively maintained)\n");
  for (const [slug, claimed, detail] of rows.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${slug.padEnd(width)}  ${claimed.padEnd(11)}  ${detail}`);
  }

  if (problems.length) {
    console.error(`\n${problems.length} problem(s) found:\n`);
    for (const p of problems) console.error(`  x ${p}`);
    console.error("\nFix src/lib/data/editorial.ts before publishing — the bar has to be true.\n");
    process.exit(1);
  }

  console.log(`\nAll ${rows.length} maintenance claims verified against upstream.\n`);
}

main().catch((err) => {
  console.error("verify-maintenance failed:", err);
  process.exit(1);
});
