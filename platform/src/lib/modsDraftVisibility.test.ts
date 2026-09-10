import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

const mockFind = vi.fn();
const mockFindOne = vi.fn();
const mockAggregate = vi.fn();

vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/lib/models/CatalogMod", () => ({
  default: {
    find: (...args: unknown[]) => mockFind(...args),
    findOne: (...args: unknown[]) => mockFindOne(...args),
    aggregate: (...args: unknown[]) => mockAggregate(...args),
  },
}));

vi.mock("@/lib/models/ModClassification", () => ({
  default: {
    find: vi.fn(() => ({
      lean: async () => [],
    })),
  },
}));

import { listMods, getMod, modCountsByGame } from "./mods";
import { mods as seedMods } from "@/lib/data/mods";

describe("mods visibility and seed fallback integrity", () => {
  beforeEach(() => {
    mockFind.mockReset();
    mockFindOne.mockReset();
    mockAggregate.mockReset();
  });

  it("does not resurrect a draft mod from seedMods when listed for a game", async () => {
    // Pick a real seed mod that exists in seedMods
    const targetSeed = seedMods[0];
    expect(targetSeed).toBeDefined();
    const seedSlug = targetSeed.slug;
    const baseGameSlug = targetSeed.baseGameSlug;

    // Simulate MongoDB having this mod saved in draft status
    const draftDoc = {
      slug: seedSlug,
      title: "Draft Version of Mod",
      tagline: "Draft Tagline",
      description: "Draft Description",
      baseGameSlug,
      developerSlug: "community",
      license: "MIT",
      releaseYear: 2024,
      sizeMB: 50,
      website: "https://example.com",
      downloadKind: "github-zip",
      installRelativePath: "mods",
      art: { from: "#000", to: "#fff", icon: "Package" },
      status: "draft",
      published: false,
    };

    // First find() is existingDbDocs to find slugs in scope
    // Second find() is query with mongoVisibleFilter
    mockFind.mockImplementation((filter: Record<string, unknown>, projection?: Record<string, unknown>) => {
      if (projection && projection.slug === 1) {
        // existingDbDocs query
        return {
          lean: async () => [{ slug: seedSlug }],
        };
      }
      // Visible query (with mongoVisibleFilter)
      return {
        sort: () => ({
          lean: async () => [], // Draft mod filtered out by MongoDB
          select: () => ({
            lean: async () => [],
          }),
        }),
      };
    });

    const results = await listMods({ baseGameSlug, includeUnpublished: false });

    // The draft mod MUST NOT be present in results (neither from DB nor resurrected from seed)
    const found = results.find((m) => m.slug === seedSlug);
    expect(found).toBeUndefined();
  });

  it("returns draft mod from MongoDB when includeUnpublished is true", async () => {
    const targetSeed = seedMods[0];
    const seedSlug = targetSeed.slug;
    const baseGameSlug = targetSeed.baseGameSlug;

    const draftDoc = {
      slug: seedSlug,
      title: "Draft Version of Mod",
      tagline: "Draft Tagline",
      description: "Draft Description",
      baseGameSlug,
      developerSlug: "community",
      license: "MIT",
      releaseYear: 2024,
      sizeMB: 50,
      website: "https://example.com",
      downloadKind: "github-zip",
      installRelativePath: "mods",
      art: { from: "#000", to: "#fff", icon: "Package" },
      status: "draft",
      published: false,
    };

    mockFind.mockImplementation((_filter: Record<string, unknown>, projection?: Record<string, unknown>) => {
      if (projection && projection.slug === 1) {
        return {
          lean: async () => [{ slug: seedSlug }],
        };
      }
      return {
        sort: () => ({
          lean: async () => [draftDoc],
          select: () => ({
            lean: async () => [draftDoc],
          }),
        }),
      };
    });

    const results = await listMods({ baseGameSlug, includeUnpublished: true });
    const found = results.find((m) => m.slug === seedSlug);
    expect(found).toBeDefined();
    expect(found?.title).toBe("Draft Version of Mod");
    expect(found?.status).toBe("draft");
  });

  it("getMod returns undefined for a draft mod and does not fall back to seedMods", async () => {
    const targetSeed = seedMods[0];
    const seedSlug = targetSeed.slug;

    mockFindOne.mockReturnValue({
      lean: async () => ({
        slug: seedSlug,
        title: "Draft Mod in DB",
        baseGameSlug: targetSeed.baseGameSlug,
        developerSlug: "dev",
        license: "GPL",
        releaseYear: 2024,
        sizeMB: 10,
        website: "https://example.com",
        status: "draft",
        published: false,
      }),
    });

    const mod = await getMod(seedSlug, { includeUnpublished: false });
    expect(mod).toBeUndefined();
  });

  it("getMod returns the MongoDB draft document when includeUnpublished is true", async () => {
    const targetSeed = seedMods[0];
    const seedSlug = targetSeed.slug;

    mockFindOne.mockReturnValue({
      lean: async () => ({
        slug: seedSlug,
        title: "Draft Mod in DB",
        baseGameSlug: targetSeed.baseGameSlug,
        developerSlug: "dev",
        license: "GPL",
        releaseYear: 2024,
        sizeMB: 10,
        website: "https://example.com",
        status: "draft",
        published: false,
      }),
    });

    const mod = await getMod(seedSlug, { includeUnpublished: true });
    expect(mod).toBeDefined();
    expect(mod?.title).toBe("Draft Mod in DB");
    expect(mod?.status).toBe("draft");
  });

  it("getMod falls back to seedMods only if document does not exist in MongoDB", async () => {
    const targetSeed = seedMods[0];
    const seedSlug = targetSeed.slug;

    mockFindOne.mockReturnValue({
      lean: async () => null, // absent from DB
    });

    const mod = await getMod(seedSlug, { includeUnpublished: false });
    expect(mod).toBeDefined();
    expect(mod?.slug).toBe(seedSlug);
    expect(mod?.title).toBe(targetSeed.title);
  });

  it("modCountsByGame excludes draft mods by default unless includeUnpublished is true", async () => {
    mockAggregate.mockResolvedValue([
      { _id: "game-1", count: 2 },
    ]);

    await modCountsByGame();
    expect(mockAggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.any(Object),
        }),
        { $group: { _id: "$baseGameSlug", count: { $sum: 1 } } },
      ])
    );

    mockAggregate.mockClear();
    await modCountsByGame({ includeUnpublished: true });
    expect(mockAggregate).toHaveBeenCalledWith([
      { $group: { _id: "$baseGameSlug", count: { $sum: 1 } } },
    ]);
  });
});
