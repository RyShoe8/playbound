import { describe, it, expect } from "vitest";
import { videoGameSchema } from "@/components/JsonLd";
import type { Game } from "@/lib/data/types";

/**
 * Structured-data validity for the VideoGame node on every game page.
 *
 * Two properties were emitted as plain text where schema.org wants typed
 * values, and a validator flagged every game page for them: `playMode` takes
 * GamePlayMode enumeration members, and `video` takes VideoObject values.
 */
const game = {
  slug: "test-game",
  title: "Test Game",
  tagline: "t",
  description: "d",
  developerSlug: "dev",
  genres: ["Strategy"],
  tags: [],
  license: "GPL",
  releaseYear: 2020,
  sizeMB: 100,
  platforms: ["Windows"],
  features: ["Multiplayer", "Co-op"],
  launchMethods: ["install"],
  browserPlayable: false,
  steamDeck: false,
  website: "https://example.com",
  coverImage: "https://cdn.example.com/cover.webp",
  videos: [
    "https://www.youtube.com/watch?v=abc123DEF45",
    "https://player.vimeo.com/video/987654",
    "https://cdn.example.com/trailer.mp4",
  ],
  gameOfWeek: false,
  hiddenGem: false,
  art: { from: "#000", to: "#fff", icon: "Gamepad2" },
  systemRequirements: { min: "-", recommended: "-" },
} as unknown as Game;

describe("videoGameSchema", () => {
  it("writes playMode as schema.org enumeration URLs", () => {
    const schema = videoGameSchema(game) as Record<string, unknown>;
    expect(schema.playMode).toEqual([
      "https://schema.org/SinglePlayer",
      "https://schema.org/MultiPlayer",
      "https://schema.org/CoOp",
    ]);
  });

  it("keeps a single-player game to SinglePlayer only", () => {
    const schema = videoGameSchema({ ...game, features: [] }) as Record<string, unknown>;
    expect(schema.playMode).toEqual(["https://schema.org/SinglePlayer"]);
  });

  it("describes videos as VideoObject values, not bare URLs", () => {
    const schema = videoGameSchema(game) as { video: Record<string, unknown>[] };
    expect(schema.video).toHaveLength(3);
    for (const v of schema.video) {
      expect(v["@type"]).toBe("VideoObject");
      expect(typeof v.name).toBe("string");
      expect(typeof v.description).toBe("string");
    }
    expect(schema.video[0]).toMatchObject({
      embedUrl: "https://www.youtube.com/embed/abc123DEF45",
      thumbnailUrl: "https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg",
    });
    expect(schema.video[1]).toMatchObject({ embedUrl: "https://player.vimeo.com/video/987654" });
    expect(schema.video[2]).toMatchObject({ contentUrl: "https://cdn.example.com/trailer.mp4" });
    expect(schema.video.some((v) => "uploadDate" in v)).toBe(false);
  });

  it("omits video when the game has none", () => {
    const schema = videoGameSchema({ ...game, videos: [] }) as Record<string, unknown>;
    expect("video" in schema).toBe(false);
  });
});
