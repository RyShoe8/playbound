import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES_ROOT = path.join(process.cwd(), "src", "app", "api", "parties");
const PUBLIC_ROUTES = new Set(["open/route.ts", "open-count/route.ts"]);

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(fullPath);
    return entry.name === "route.ts" ? [fullPath] : [];
  });
}

describe("party route access matrix", () => {
  const routes = routeFiles(ROUTES_ROOT).map((file) => ({
    file,
    route: path.relative(ROUTES_ROOT, file).replaceAll("\\", "/"),
    source: fs.readFileSync(file, "utf8"),
  }));

  it("keeps the anonymous surface limited to explicitly public discovery routes", () => {
    const publicRoutes = routes
      .filter(({ source }) => !source.includes("getFriendsUserId("))
      .map(({ route }) => route)
      .sort();

    expect(publicRoutes).toEqual([...PUBLIC_ROUTES].sort());
  });

  it("authenticates every private party route before handling it", () => {
    for (const { route, source } of routes) {
      if (PUBLIC_ROUTES.has(route)) continue;
      expect(source, `${route} must authenticate through friends auth`).toContain(
        "getFriendsUserId("
      );
    }
  });

  it("does not expose raw Party documents from public discovery routes", () => {
    for (const { route, source } of routes) {
      if (!PUBLIC_ROUTES.has(route)) continue;
      expect(source, `${route} must use the public party serializer`).toMatch(
        /listOpenPublicParties|countOpenPublicParties/
      );
    }
  });
});
