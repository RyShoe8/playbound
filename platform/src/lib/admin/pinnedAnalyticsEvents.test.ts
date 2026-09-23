import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PINNED_ANALYTICS_EVENTS,
  LAUNCHER_OPS_EVENTS,
  PARTY_OPS_EVENTS,
} from "@/lib/admin/opsEvents";

/**
 * The admin analytics page must pin event names the launcher actually emits.
 *
 * This exists because of a real confusion: the launcher's install event is
 * `launcher_install`, and looking for `launcher_installed` finds nothing. A name
 * spelled the wrong way here is worse than no entry at all — Recent events would
 * stay exactly as empty of installs as before, while looking like the problem
 * had been addressed.
 *
 * Reads the real launcher source rather than a copy, following
 * controlsParity.test.ts. The two cannot share a module: one is an Electron
 * main process on CommonJS, the other is the Next app.
 */

const TELEMETRY_PATH = path.join(process.cwd(), "..", "launcher", "telemetry.js");

function launcherSource(): string | null {
  // A platform-only checkout has no launcher/ beside it. Skip rather than fail:
  // the point is to catch drift when both are present, not to require the
  // sibling package for the whole suite to run.
  try {
    return readFileSync(TELEMETRY_PATH, "utf8");
  } catch {
    return null;
  }
}

/** Every `track("name"` literal in the launcher's telemetry module. */
function launcherTrackedEvents(source: string): Set<string> {
  return new Set([...source.matchAll(/track\(\s*"([a-z_]+)"/g)].map((m) => m[1]));
}

describe("pinned analytics events", () => {
  it("pins the launcher install event", () => {
    // The whole reason this list exists. It fires at most once per install, so
    // it can never place in a top-15 ranking and must be shown by name.
    expect(PINNED_ANALYTICS_EVENTS).toContain("launcher_install");
  });

  it("does not pin the plausible-but-wrong spelling", () => {
    expect(PINNED_ANALYTICS_EVENTS).not.toContain("launcher_installed");
  });

  it("has no duplicates", () => {
    expect(new Set(PINNED_ANALYTICS_EVENTS).size).toBe(PINNED_ANALYTICS_EVENTS.length);
  });

  it("stays short enough to read at a glance", () => {
    // These rows share the Recent events table; a long list would bury the
    // ordinary traffic it exists alongside.
    expect(PINNED_ANALYTICS_EVENTS.length).toBeLessThanOrEqual(8);
  });

  it("only pins events some ops list already knows about", () => {
    const known = new Set<string>([
      ...LAUNCHER_OPS_EVENTS,
      ...PARTY_OPS_EVENTS,
      // Emitted by the site's account-link handoff, not the launcher ops feed.
      "launcher_connected",
    ]);
    const unknown = PINNED_ANALYTICS_EVENTS.filter((e) => !known.has(e));
    expect(unknown, `pinned but not in any ops list: ${unknown.join(", ")}`).toEqual([]);
  });

  it("pins launcher event names the launcher really emits", () => {
    const source = launcherSource();
    if (!source) return; // see launcherSource()

    const emitted = launcherTrackedEvents(source);
    expect(
      emitted.size,
      "found no track(\"…\") calls in launcher/telemetry.js — the matcher is stale"
    ).toBeGreaterThan(0);

    // launcher_install is the one this test is really about; assert it directly
    // rather than relying on the loop below to happen to cover it.
    expect(
      emitted.has("launcher_install"),
      "launcher/telemetry.js no longer emits launcher_install — the pinned row will read 'never'"
    ).toBe(true);

    // Anything pinned that looks like a launcher event must be emitted by the
    // launcher. Site-side events (launcher_connected) are excluded because they
    // are not tracked from this file.
    const launcherEmittedNames = new Set(LAUNCHER_OPS_EVENTS as readonly string[]);
    const shouldBeEmitted = PINNED_ANALYTICS_EVENTS.filter((e) => launcherEmittedNames.has(e));
    const missing = shouldBeEmitted.filter((e) => !emitted.has(e));
    expect(
      missing,
      `pinned as launcher events but never emitted by launcher/telemetry.js: ${missing.join(", ")}`
    ).toEqual([]);
  });
});
