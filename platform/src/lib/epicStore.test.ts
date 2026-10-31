import { describe, expect, it } from "vitest";
import { extractEgdataOffer } from "./epicStore";

describe("egdata.app fallback for self-published Epic products", () => {
  it("maps a mirrored offer onto the import fields", () => {
    const e = extractEgdataOffer({
      title: "FOUNTAINS",
      description: "Master high-skilled combat.",
      longDescription: "<!--textBlock-->\n# The Fountain of Youth was hidden away.\nMore text.",
      developerDisplayName: "John Pywell",
      publisherDisplayName: "Crunching Koalas sp. z o.o.",
      releaseDate: "2024-12-20T14:00:00.000Z",
      keyImages: [{ type: "OfferImageTall", url: "https://cdn1.epicgames.com/tall.png" }, { type: "OfferImageWide", url: "https://cdn1.epicgames.com/wide.png" }, { type: "featuredMedia", url: "https://cdn1.epicgames.com/shot2.png" }],
      tags: [{ name: "Fantasy" }, { name: "Windows" }, { name: "Mac OS" }, { name: "Controller Support" }],
    }, {
      images: [{ src: "https://cdn1.epicgames.com/shot1.png" }, { src: "https://cdn1.epicgames.com/wide.png" }],
      videos: [{ outputs: [{ url: "https://media-cdn.epicgames.com/x-audio.webm", contentType: "audio/webm" }, { url: "https://media-cdn.epicgames.com/x-high.webm", contentType: "video/webm" }] }],
    }, "fountains-87e36d");
    expect(e.title).toBe("FOUNTAINS");
    expect(e.developers).toEqual(["John Pywell"]);
    expect(e.publishers).toEqual(["Crunching Koalas sp. z o.o."]);
    expect(e.releaseYear).toBe(2024);
    expect(e.platforms).toEqual(["Windows", "macOS"]);
    expect(e.coverImage).toBe("https://cdn1.epicgames.com/wide.png");
    expect(e.screenshots).toEqual(["https://cdn1.epicgames.com/shot1.png", "https://cdn1.epicgames.com/shot2.png"]);
    expect(e.description.startsWith("The Fountain of Youth")).toBe(true);
    expect(e.videos).toHaveLength(1);
    expect(e.videos[0]).toContain("high.webm");
    expect(e.storeUrl).toBe("https://store.epicgames.com/p/fountains-87e36d");
  });
});
