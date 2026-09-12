import { describe, it, expect } from "vitest";
import CatalogGame from "@/lib/models/CatalogGame";
import { readFileSync } from "fs";
import { join } from "path";

describe("Admin games list Updated column isolation", () => {
  it("defines adminUpdatedAt on CatalogGameSchema with index", () => {
    const paths = CatalogGame.schema.paths;
    expect(paths).toHaveProperty("adminUpdatedAt");
    expect(paths.adminUpdatedAt.instance).toBe("Date");

    const indexes = CatalogGame.schema.indexes() as Array<[Record<string, unknown>, unknown]>;
    const hasAdminUpdatedIndex = indexes.some(
      ([fields]) => "adminUpdatedAt" in fields && fields.adminUpdatedAt === -1
    );
    expect(hasAdminUpdatedIndex).toBe(true);
  });

  it("passes timestamps: false in install/report findOneAndUpdate", () => {
    const reportRouteSource = readFileSync(
      join(process.cwd(), "src/app/api/games/[slug]/install/report/route.ts"),
      "utf8"
    );
    expect(reportRouteSource).toMatch(/timestamps:\s*false/);
  });

  it("passes timestamps: false in background cron updates to CatalogGame", () => {
    const catalogVersionsSource = readFileSync(
      join(process.cwd(), "src/app/api/cron/catalog-versions/route.ts"),
      "utf8"
    );
    expect(catalogVersionsSource).toMatch(
      /CatalogGame\.updateOne\([^)]+timestamps:\s*false/
    );

    const offerPricesSource = readFileSync(
      join(process.cwd(), "src/app/api/cron/offer-prices/route.ts"),
      "utf8"
    );
    expect(offerPricesSource).toMatch(
      /CatalogGame\.updateOne\([^)]+timestamps:\s*false/
    );
  });

  it("sets adminUpdatedAt in admin game mutation routes", () => {
    const adminGamesRoute = readFileSync(
      join(process.cwd(), "src/app/api/admin/games/route.ts"),
      "utf8"
    );
    expect(adminGamesRoute).toMatch(/adminUpdatedAt:\s*new Date\(\)/);

    const adminGameSlugRoute = readFileSync(
      join(process.cwd(), "src/app/api/admin/games/[slug]/route.ts"),
      "utf8"
    );
    expect(adminGameSlugRoute).toMatch(/adminUpdatedAt:\s*new Date\(\)/);

    const statusRoute = readFileSync(
      join(process.cwd(), "src/app/api/admin/games/[slug]/status/route.ts"),
      "utf8"
    );
    expect(statusRoute).toMatch(/adminUpdatedAt:\s*new Date\(\)/);

    const completeRoute = readFileSync(
      join(process.cwd(), "src/app/api/admin/games/[slug]/complete/route.ts"),
      "utf8"
    );
    expect(completeRoute).toMatch(/adminUpdatedAt:\s*new Date\(\)/);

    const launcherInstallRoute = readFileSync(
      join(process.cwd(), "src/app/api/admin/games/[slug]/launcher-install/route.ts"),
      "utf8"
    );
    expect(launcherInstallRoute).toMatch(/adminUpdatedAt:\s*new Date\(\)/);

    const controlsRoute = readFileSync(
      join(process.cwd(), "src/app/api/admin/games/[slug]/controls/route.ts"),
      "utf8"
    );
    expect(controlsRoute).toMatch(/adminUpdatedAt:\s*new Date\(\)/);
  });

  it("sorts and prioritizes adminUpdatedAt over updatedAt in catalog computeAllGames", () => {
    const catalogSource = readFileSync(
      join(process.cwd(), "src/lib/catalog.ts"),
      "utf8"
    );
    expect(catalogSource).toMatch(
      /CatalogGame\.find\(\)\.sort\(\{\s*adminUpdatedAt:\s*-1,\s*updatedAt:\s*-1\s*\}\)/
    );
    expect(catalogSource).toMatch(
      /adminDate \?\? fallbackDate/
    );
  });
});
