/*
 * Client-safe half of the failure-rate module.
 *
 * FailureRateCard is a client component and needs the shapes, the window
 * labels and the pure aggregation helpers. Importing those from
 * failureRates.ts pulled its `dbConnect`/`TelemetryEvent` imports into the
 * browser bundle with them — types erase, but WINDOW_LABELS is a real runtime
 * value, so the whole module came along and Turbopack failed the production
 * build trying to resolve async_hooks, dns, net, tls and fs for the browser.
 *
 * Nothing here may import from @/lib/db or any model. failureRates.ts keeps
 * the database query and re-exports everything below, so server callers and
 * the existing tests are unaffected.
 */

/**
 * Install and launch failure rates for the Ops console.
 *
 * Which events count is the whole correctness question here, because the
 * telemetry has more than one event per outcome and mixing them silently
 * flatters the number:
 *
 *   installs   `edition_installed` is the launcher's completion signal, and it
 *              fires for every install it performs — game, mod loader or
 *              edition alike. `game_installed` and `mod_installed` look like
 *              they belong but come from /api/library/*, which is library sync
 *              rather than an install completing, so counting them would
 *              inflate the denominator and understate failure.
 *
 *   launches   `edition_launched` is the completion. `launch_attempted` fires
 *              before spawn, so it counts attempts, not successes, and
 *              `session_started` fires alongside `edition_launched` for the
 *              same launch — either would double-count.
 *
 * Rate is failures over failures plus completions, so it is the share of
 * finished attempts that failed.
 */

export const FAILURE_RATE_EVENTS = {
  installCompleted: "edition_installed",
  installFailed: "install_failed",
  launchCompleted: "edition_launched",
  launchFailed: "launch_failed",
  /*
   * Party operations — Discord channels, config sync, hosting, virtual LAN.
   *
   * Sits in this card rather than its own because the question a reader has at
   * the top of Ops is "is anything failing", and splitting it across two cards
   * with separate conventions makes that harder to answer, not easier.
   */
  partyCompleted: "party_ok",
  partyFailed: "party_failed",
} as const;

export type FailureWindow = "d1" | "d7" | "d30";

export const WINDOW_LABELS: Record<FailureWindow, string> = {
  d1: "24h",
  d7: "7d",
  d30: "30d",
};

export type Tally = {
  failed: number;
  completed: number;
  /** Null when nothing finished in the window — 0% would be a lie. */
  rate: number | null;
};

export type PlatformTallies = {
  installs: Tally;
  launches: Tally;
  party: Tally;
  overall: Tally;
};

export type FailureRates = Record<
  FailureWindow,
  {
    installs: Tally;
    launches: Tally;
    party: Tally;
    overall: Tally;
    byPlatform: Record<string, PlatformTallies>;
  }
> & {
  platforms: string[];
};

function tally(failed: number, completed: number): Tally {
  const total = failed + completed;
  return { failed, completed, rate: total > 0 ? (failed / total) * 100 : null };
}

const EMPTY_TALLY: Tally = { failed: 0, completed: 0, rate: null };

export function emptyFailureRates(): FailureRates {
  return {
    d1: { installs: EMPTY_TALLY, launches: EMPTY_TALLY, party: EMPTY_TALLY, overall: EMPTY_TALLY, byPlatform: {} },
    d7: { installs: EMPTY_TALLY, launches: EMPTY_TALLY, party: EMPTY_TALLY, overall: EMPTY_TALLY, byPlatform: {} },
    d30: { installs: EMPTY_TALLY, launches: EMPTY_TALLY, party: EMPTY_TALLY, overall: EMPTY_TALLY, byPlatform: {} },
    platforms: [],
  };
}

/** Not a device. Server-side work, and rows we genuinely could not attribute. */
export const SERVER_PLATFORM = "Server";
export const UNKNOWN_PLATFORM = "Unknown";

export function normalizeTelemetryPlatform(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return UNKNOWN_PLATFORM;
  const s = raw.trim().toLowerCase();
  // "unknown" is a value parseUserAgent actually writes, not an absent field.
  // It has to land in the Unknown bucket rather than being title-cased into a
  // platform named "Unknown" by accident — same output, but on purpose.
  if (s === "unknown") return UNKNOWN_PLATFORM;
  if (s === "server") return SERVER_PLATFORM;
  if (s.includes("mac") || s.includes("darwin") || s === "osx") return "macOS";
  if (s.includes("win")) return "Windows";
  if (s.includes("linux")) return "Linux";
  if (s.includes("android")) return "Android";
  if (s.includes("ios") || s.includes("iphone") || s.includes("ipad")) return "iOS";
  if (s.includes("web") || s.includes("browser")) return "Browser";
  return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1);
}

const PLATFORM_PRIORITY = ["Windows", "macOS", "Linux", "Android", "iOS", "Browser"];

/**
 * Always last, and in this order. They are answers about attribution rather
 * than platforms, so a real platform with fewer events still reads above them.
 */
const PLATFORM_TRAILING = [SERVER_PLATFORM, UNKNOWN_PLATFORM];

export function sortPlatforms(platforms: string[]): string[] {
  const rank = (p: string) => {
    const lead = PLATFORM_PRIORITY.indexOf(p);
    if (lead !== -1) return lead;
    const trail = PLATFORM_TRAILING.indexOf(p);
    // Anything unrecognised sits between the known platforms and the
    // non-device buckets, so a new OS shows up rather than hiding at the end.
    if (trail !== -1) return 2000 + trail;
    return 1000;
  };
  return [...platforms].sort((a, b) => {
    const d = rank(a) - rank(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
}

/** Shape the aggregation returns: one row per event (and optional platform) with a count per window. */
export type EventCounts = {
  _id: string | { event: string; platform?: string | null };
  d1: number;
  d7: number;
  d30: number;
};

export function buildFailureRates(rows: EventCounts[]): FailureRates {
  const byEvent = new Map<string, { d1: number; d7: number; d30: number }>();
  const byPlatformEvent = new Map<string, Map<string, { d1: number; d7: number; d30: number }>>();
  const platformsWithData = new Set<string>();

  for (const r of rows) {
    const event = typeof r._id === "string" ? r._id : r._id?.event;
    if (!event) continue;

    const rawPlatform = typeof r._id === "object" ? r._id?.platform : null;
    const platform = rawPlatform ? normalizeTelemetryPlatform(rawPlatform) : null;

    // Sum into global byEvent
    const curEvent = byEvent.get(event) ?? { d1: 0, d7: 0, d30: 0 };
    curEvent.d1 += r.d1 || 0;
    curEvent.d7 += r.d7 || 0;
    curEvent.d30 += r.d30 || 0;
    byEvent.set(event, curEvent);

    // If platform is present, sum into byPlatformEvent
    if (platform) {
      if ((r.d1 || 0) + (r.d7 || 0) + (r.d30 || 0) > 0) {
        platformsWithData.add(platform);
      }
      let platformMap = byPlatformEvent.get(platform);
      if (!platformMap) {
        platformMap = new Map();
        byPlatformEvent.set(platform, platformMap);
      }
      const curPlatEvent = platformMap.get(event) ?? { d1: 0, d7: 0, d30: 0 };
      curPlatEvent.d1 += r.d1 || 0;
      curPlatEvent.d7 += r.d7 || 0;
      curPlatEvent.d30 += r.d30 || 0;
      platformMap.set(event, curPlatEvent);
    }
  }

  const platforms = sortPlatforms(Array.from(platformsWithData));
  const windows: FailureWindow[] = ["d1", "d7", "d30"];
  const out = emptyFailureRates();
  out.platforms = platforms;

  const count = (event: string, window: FailureWindow) => byEvent.get(event)?.[window] ?? 0;
  const pCount = (platform: string, event: string, window: FailureWindow) =>
    byPlatformEvent.get(platform)?.get(event)?.[window] ?? 0;

  for (const w of windows) {
    const installs = tally(
      count(FAILURE_RATE_EVENTS.installFailed, w),
      count(FAILURE_RATE_EVENTS.installCompleted, w)
    );
    const launches = tally(
      count(FAILURE_RATE_EVENTS.launchFailed, w),
      count(FAILURE_RATE_EVENTS.launchCompleted, w)
    );
    const party = tally(
      count(FAILURE_RATE_EVENTS.partyFailed, w),
      count(FAILURE_RATE_EVENTS.partyCompleted, w)
    );
    const overall = tally(
      installs.failed + launches.failed + party.failed,
      installs.completed + launches.completed + party.completed
    );

    const byPlatform: Record<string, PlatformTallies> = {};
    for (const p of platforms) {
      const pInstalls = tally(
        pCount(p, FAILURE_RATE_EVENTS.installFailed, w),
        pCount(p, FAILURE_RATE_EVENTS.installCompleted, w)
      );
      const pLaunches = tally(
        pCount(p, FAILURE_RATE_EVENTS.launchFailed, w),
        pCount(p, FAILURE_RATE_EVENTS.launchCompleted, w)
      );
      const pParty = tally(
        pCount(p, FAILURE_RATE_EVENTS.partyFailed, w),
        pCount(p, FAILURE_RATE_EVENTS.partyCompleted, w)
      );
      const pOverall = tally(
        pInstalls.failed + pLaunches.failed + pParty.failed,
        pInstalls.completed + pLaunches.completed + pParty.completed
      );
      byPlatform[p] = {
        installs: pInstalls,
        launches: pLaunches,
        party: pParty,
        overall: pOverall,
      };
    }

    out[w] = {
      installs,
      launches,
      party,
      overall,
      byPlatform,
    };
  }

  return out;
}

/**
 * One pass over the last 30 days, bucketing each event into the windows it
 * falls inside. Three separate range queries would read the most recent day
 * three times over; this reads it once and uses the {event, createdAt} index.
 */
