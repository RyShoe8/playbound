import { describe, expect, it } from "vitest";
import { assembleHostingInventory } from "./inventory";

describe("dedicated hosting inventory", () => {
  it("counts database games and distinct additional editions without default-edition inflation", () => {
    expect(assembleHostingInventory(
      [{ slug: "openarena", title: "OpenArena" }, { slug: "openra", title: "OpenRA" }, { slug: "starbound", title: "Starbound" }],
      [{ gameSlug: "openra", slug: "official", isDefault: true }, { gameSlug: "openra", slug: "combined-arms" }],
      [{ gameSlug: "openra", editionSlug: "combined-arms" }, { gameSlug: "openra", editionSlug: "romanovs-vengeance" }],
    )).toEqual([
      { gameSlug: "openarena", title: "OpenArena", editions: [] },
      { gameSlug: "openra", title: "OpenRA", editions: ["combined-arms", "romanovs-vengeance"] },
    ]);
  });
});
