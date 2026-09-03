import { describe, expect, it } from "vitest";
import { heroMediaItems } from "./mediaEmbed";

describe("what the hero reel is given to show", () => {
  it("leads with video, then screenshots in curated order", () => {
    // A game leads with its trailer; the screenshots keep whatever order
    // someone chose for them in admin.
    const items = heroMediaItems(
      ["https://cdn.example.com/trailer.mp4"],
      ["/a.jpg", "/b.jpg"]
    );
    expect(items.map((i) => i.type)).toEqual(["video", "image", "image"]);
    expect(items.map((i) => i.src)).toEqual([
      "https://cdn.example.com/trailer.mp4",
      "/a.jpg",
      "/b.jpg",
    ]);
  });

  it("gives YouTube a poster frame and Vimeo none", () => {
    /*
     * YouTube serves a thumbnail from a predictable URL. Vimeo needs an API
     * call for one, so that slide shows a play control on black rather than a
     * broken image — a wrong poster is worse than an honest blank.
     */
    const [yt] = heroMediaItems(["https://www.youtube.com/watch?v=abc123"], []);
    expect(yt).toMatchObject({ type: "embed", kind: "youtube" });
    expect((yt as { poster: string }).poster).toContain("i.ytimg.com/vi/abc123");

    const [vim] = heroMediaItems(["https://vimeo.com/98765"], []);
    expect(vim).toMatchObject({ type: "embed", kind: "vimeo", poster: null });
  });

  it("marks HLS so the reel can reach for the player that handles it", () => {
    // A plain <video> cannot play HLS outside Safari; the component swaps in
    // HlsVideo on this flag alone.
    const [item] = heroMediaItems(["https://cdn.example.com/master.m3u8"], []);
    expect(item).toEqual({ type: "video", kind: "hls", src: "https://cdn.example.com/master.m3u8" });
  });

  it("is empty when a game has no media, so the page keeps its generated art", () => {
    expect(heroMediaItems(undefined, undefined)).toEqual([]);
    expect(heroMediaItems([], [])).toEqual([]);
    // Blank strings are a real thing in curated arrays and must not become slides.
    expect(heroMediaItems(["", ""], ["", ""])).toEqual([]);
  });

  it("caps the reel rather than paginating a hero", () => {
    // Every extra slide is another dot in a strip that has to stay readable,
    // and the Media tab is where the full set belongs.
    const shots = Array.from({ length: 40 }, (_, i) => `/s${i}.jpg`);
    expect(heroMediaItems([], shots)).toHaveLength(12);
    expect(heroMediaItems([], shots, 3)).toHaveLength(3);
  });

  it("keeps the video slots when a game has more videos than the cap", () => {
    // Trailers are the reason someone stops scrolling; they must not be pushed
    // out by screenshots.
    const vids = Array.from({ length: 4 }, (_, i) => `https://cdn.example.com/v${i}.mp4`);
    const shots = Array.from({ length: 40 }, (_, i) => `/s${i}.jpg`);
    const items = heroMediaItems(vids, shots, 5);
    expect(items.filter((i) => i.type === "video")).toHaveLength(4);
    expect(items).toHaveLength(5);
  });
});
