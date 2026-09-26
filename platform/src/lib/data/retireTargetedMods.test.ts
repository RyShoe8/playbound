import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import CatalogMod from "@/lib/models/CatalogMod";
import CatalogGame from "@/lib/models/CatalogGame";
import { TARGET_SLUGS } from "../../../scripts/retire-targeted-mods";

describe("retire-targeted-mods", () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it("defines exactly 45 unique target slugs to remove", () => {
    expect(TARGET_SLUGS.length).toBe(45);
    const uniqueSlugs = new Set(TARGET_SLUGS);
    expect(uniqueSlugs.size).toBe(45);
  });

  it("deletes ONLY the targeted mods and leaves other mods and games completely untouched", async () => {
    // 1. Seed a sample parent game
    const game = await CatalogGame.create({
      title: "Test Game",
      slug: "test-game",
      tagline: "A test game",
      website: "https://example.com",
      license: "MIT",
      sizeMB: 100,
      art: { from: "#000", to: "#fff", icon: "Gamepad2" },
      systemRequirements: { min: "Windows 10, 4GB RAM", recommended: "Windows 11, 8GB RAM" },
      status: "published",
      releaseYear: 2020,
      description: "Test description",
      longDescription: "Test long description",
      developerSlug: "riot",
      media: { cover: "/cover.jpg", hero: "/hero.jpg", screenshots: [] },
      genres: ["Action"],
      platforms: ["Windows"],
      tags: ["Multiplayer"],
      qualityBar: { passed: true, checks: { installable: true, playable: true, audioOk: true, noMalware: true, stableFramerate: true, savesWork: true, quitCleanly: true } },
    });

    // 2. Seed 2 targeted mods and 2 non-targeted mods
    await CatalogMod.create({
      title: "VALORANT Discord Bot",
      slug: "valorant-clove-meddle-decay",
      tagline: "Discord bot",
      license: "MIT",
      art: { from: "#000", to: "#fff", icon: "Gamepad2" },
      baseGameSlug: "valorant",
      description: "Junk bot",
      status: "published",
      releaseYear: 2024,
      downloadKind: "external",
      website: "https://discord.gg/fake",
      developerSlug: "riot",
    });

    await CatalogMod.create({
      title: "HoloCure RPC",
      slug: "holocure-rich-presence",
      tagline: "RPC bridge",
      license: "MIT",
      art: { from: "#000", to: "#fff", icon: "Gamepad2" },
      baseGameSlug: "holocure",
      description: "Junk RPC",
      status: "draft",
      releaseYear: 2024,
      downloadKind: "external",
      website: "https://discord.gg/fake",
      developerSlug: "mashirochan",
    });

    await CatalogMod.create({
      title: "3DMigoto GIMI",
      slug: "genshin-gimi-framework",
      tagline: "Model importer",
      license: "MIT",
      art: { from: "#000", to: "#fff", icon: "Gamepad2" },
      baseGameSlug: "genshin-impact",
      description: "Legitimate modding tool",
      status: "published",
      releaseYear: 2024,
      downloadKind: "github-zip",
      website: "https://github.com/SilentNightSound/GI-Model-Importer",
      developerSlug: "indie-web",
    });

    await CatalogMod.create({
      title: "CSLoL Manager",
      slug: "cslol-manager",
      tagline: "Skin manager",
      license: "MIT",
      art: { from: "#000", to: "#fff", icon: "Gamepad2" },
      baseGameSlug: "league-of-legends",
      description: "Legitimate skin manager",
      status: "published",
      releaseYear: 2024,
      downloadKind: "github-zip",
      website: "https://github.com/League-Custom-Skin/CS-LoL-Manager",
      developerSlug: "league-custom-skin",
    });

    // Verify initial count
    expect(await CatalogMod.countDocuments()).toBe(4);
    expect(await CatalogGame.countDocuments()).toBe(1);

    // Execute the exact targeted deletion query
    const result = await CatalogMod.deleteMany({ slug: { $in: TARGET_SLUGS } });
    expect(result.deletedCount).toBe(2);

    // Verify only the 2 target mods were deleted
    const remainingMods = await CatalogMod.find({}).lean();
    expect(remainingMods.length).toBe(2);
    expect(remainingMods.map((m) => m.slug).sort()).toEqual([
      "cslol-manager",
      "genshin-gimi-framework",
    ]);

    // Verify parent game was completely untouched
    const remainingGames = await CatalogGame.find({}).lean();
    expect(remainingGames.length).toBe(1);
    expect(remainingGames[0].slug).toBe("test-game");
  });
});
