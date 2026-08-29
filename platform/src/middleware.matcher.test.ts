import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * The username gate must keep covering everything that can create content.
 *
 * `api/presence/` and `api/couch/` are excluded from the matcher for cost: they
 * are the two highest-frequency paths on the site, and a signed-in request to
 * either was paying a full JWT decrypt in middleware on top of the
 * getServerSession() the route already does. Neither can create content under a
 * placeholder `pb_<hex>` username, which is the only thing the gate exists to
 * prevent.
 *
 * That exclusion is one regex in a config object, and widening it is a one-word
 * edit with no visible symptom — the gate simply stops firing and an OAuth
 * signup can post under the placeholder name again. Asserting on the shipped
 * string rather than on behaviour for the same reason buildWritesNothing does:
 * the pattern is the thing that has to stay right.
 *
 * The two exclusions carry a trailing slash so they exclude a path segment
 * rather than a name prefix — bare `api/presence` would also un-gate a future
 * `/api/presence-admin`.
 */
const source = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");

function shippedMatcher(): string {
  const start = source.indexOf('matcher: ["');
  expect(start, "middleware.ts should declare a matcher array").toBeGreaterThan(-1);
  const open = source.indexOf('"', start);
  const close = source.indexOf('"]', open + 1);
  return JSON.parse(source.slice(open, close + 1)) as string;
}

const matcher = new RegExp(`^${shippedMatcher()}$`);

/** Runs the gate. Anything that can write content the public will see. */
const GATED = [
  "/",
  "/welcome",
  "/games/quake",
  "/api/reviews",
  "/api/notifications",
  "/api/party-sync",
  "/api/friends/request",
  "/api/friends/requests",
  // Near-misses: the exclusions must not swallow a differently-named route.
  "/api/presencex",
  "/api/couchx",
];

/** Skips the gate: hot paths that create nothing, plus static assets. */
const UNGATED = [
  "/api/presence/heartbeat",
  "/api/presence/start",
  "/api/presence/end",
  "/api/couch/sessions/ABC123/signal",
  "/api/couch/sessions/ABC123/join",
  "/_next/static/chunk.js",
  "/favicon.ico",
  "/sitemap.xml",
];

describe("the username gate matcher", () => {
  it.each(GATED)("still runs on %s", (path) => {
    expect(matcher.test(path)).toBe(true);
  });

  it.each(UNGATED)("skips %s", (path) => {
    expect(matcher.test(path)).toBe(false);
  });

  it("excludes presence and couch by path segment, not name prefix", () => {
    const pattern = shippedMatcher();
    expect(pattern).toContain("api/presence/");
    expect(pattern).toContain("api/couch/");
  });

  it("never excludes the whole api surface", () => {
    // The gate's entire purpose is API writes; excluding `api` wholesale would
    // silently disable it while still passing every path assertion above.
    const pattern = shippedMatcher();
    expect(pattern).not.toMatch(/\(\?!(?:[^)]*\|)?api[|)]/);
  });
});
