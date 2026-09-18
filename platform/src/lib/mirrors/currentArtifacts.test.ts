import { beforeEach, expect, it, vi } from "vitest";
import { filterCurrentArtifacts } from "./currentArtifacts";

const catalog = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/models/CatalogGame", () => ({ default: {
  find: () => ({ select: () => ({ lean: async () => catalog.rows }) }),
} }));
vi.mock("@/lib/data/games", () => ({ games: [] }));
vi.mock("@/lib/data/launcherInstall", () => ({ launcherInstallBySlug: {} }));

const addon = {
  artifactId: "addon", gameSlug: "stalker-lost-alpha", version: "1.4007", filename: "LAR_v.1.0.7z",
};
const fullGame = { ...addon, artifactId: "standalone", filename: "lostalphadc14007.zip" };
beforeEach(() => {
  catalog.rows = [{ slug: addon.gameSlug, launcherInstall: {
    versionLabel: "1.4007", fileName: fullGame.filename,
  } }];
});

it("shows the full catalog package even when an older add-on shares its version", async () => {
  expect(await filterCurrentArtifacts([addon, fullGame])).toEqual([fullGame]);
  expect(await filterCurrentArtifacts([fullGame, addon])).toEqual([fullGame]);
});

it("does not substitute an add-on when the current full package has no artifact record", async () => {
  expect(await filterCurrentArtifacts([addon])).toEqual([]);
});

it("keeps version matching for recipes that do not specify a filename", async () => {
  catalog.rows = [{ slug: addon.gameSlug, launcherInstall: { versionLabel: "1.4007" } }];
  expect(await filterCurrentArtifacts([fullGame])).toEqual([fullGame]);
});
