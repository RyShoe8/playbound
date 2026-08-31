import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Routes that have been moved off request-time APIs, and must stay off them.
 *
 * A single `cookies()` or `getServerSession()` anywhere in a route's server
 * import graph opts the whole route out of prerendering — it is then rendered
 * from scratch for every visitor and served `Cache-Control: private, no-store`,
 * so nothing caches at the edge. That is invisible in review: the call is
 * usually three imports deep, in a helper nobody touched, and the page still
 * renders correctly.
 *
 * The discovery-mode filter (Free vs All) is the usual culprit. It is applied
 * in the browser now — see DeveloperDirectory and DiscoverableCountTile — so
 * the server can send one canonical response to everybody. Reintroducing the
 * server-side filter would silently undo that, which is what this catches.
 *
 * Add routes here as they are migrated. Do not remove one to make this pass.
 */
const CACHEABLE_ROUTES = [
  "src/app/developers/page.tsx",
  "src/app/developers/[slug]/page.tsx",
  "src/app/collections/page.tsx",
  "src/app/collections/[slug]/page.tsx",
  "src/app/alternatives/[slug]/page.tsx",
  "src/app/page.tsx",
  "src/app/weekly/page.tsx",
  "src/app/launcher/page.tsx",
  "src/app/gear/[category]/page.tsx",
  "src/app/play-with-friends/[slug]/page.tsx",
  "src/app/compare/[slug]/page.tsx",
];

const SRC = "src";

/** Anything that forces dynamic rendering when reached from a server module. */
const DYNAMIC_API = /from ["']next\/headers["']|getServerSession|cookies\(\)|headers\(\)|draftMode\(/;

function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.join(path.dirname(fromFile), spec);
  else return null; // node_modules — not ours to police

  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return fs.existsSync(base) && fs.statSync(base).isFile() ? base : null;
}

/** Every dynamic-API import chain reachable from `entry`, as readable trails. */
function dynamicPaths(entry: string): string[] {
  const seen = new Set<string>();
  const trails: string[] = [];
  const stack: Array<[string, string[]]> = [[entry, [entry]]];

  while (stack.length > 0) {
    const [file, trail] = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const raw = fs.readFileSync(file, "utf8");

    // A "use client" module runs in the browser, where these APIs do not exist
    // and cannot force the route dynamic. Its imports are the client graph, so
    // the walk stops here.
    if (/^\s*["']use client["']/.test(raw)) continue;

    // catalog.ts and mods.ts both explain in prose why pages are dynamic. A
    // mention in a comment is not a call.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*/g, "$1");

    if (DYNAMIC_API.test(code)) {
      trails.push(trail.map((f) => f.split(path.sep).join("/")).join("\n    -> "));
    }

    for (const match of code.matchAll(/from\s+["']([^"']+)["']/g)) {
      const resolved = resolveImport(match[1], file);
      if (resolved) stack.push([resolved, [...trail, resolved]]);
    }
  }
  return trails;
}

describe("cacheable routes stay free of request-time APIs", () => {
  for (const route of CACHEABLE_ROUTES) {
    it(`${route} reaches no dynamic request API`, () => {
      expect(fs.existsSync(route), `${route} is listed but does not exist`).toBe(true);
      expect(dynamicPaths(route)).toEqual([]);
    });
  }

  /*
   * Proves the walker can still see a violation. Without this the suite would
   * keep passing if resolveImport quietly stopped resolving anything — the
   * failure mode that makes a guard like this worse than none.
   */
  it("still detects the filter on a route that has not been migrated", () => {
    const notMigrated = "src/app/community/page.tsx";
    if (!fs.existsSync(notMigrated)) return; // migrated or moved; nothing to assert
    const trails = dynamicPaths(notMigrated);
    expect(trails.length).toBeGreaterThan(0);
    expect(trails.join("\n")).toContain("discoveryMode.server");
  });
});
