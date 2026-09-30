import { describe, expect, it } from "vitest";
import { eventGameOptions } from "./gameOptions";

describe("event game options", () => {
  it("shows multiplayer and co-op games but excludes single-player titles", () => {
    const games = [
      { slug: "online", title: "Online", features: ["Multiplayer"], coverImage: "/online.jpg" },
      { slug: "coop", title: "Co-op", tags: ["Local Co-op"] },
      { slug: "solo", title: "Solo", features: ["Singleplayer"] },
    ];
    expect(eventGameOptions(games)).toEqual([
      { slug: "online", title: "Online", coverImage: "/online.jpg" },
      { slug: "coop", title: "Co-op", coverImage: null },
    ]);
  });
});
