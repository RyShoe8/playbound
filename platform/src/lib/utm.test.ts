import { describe, expect, it } from "vitest";
import { withOutboundUtm } from "@/lib/utm";

describe("withOutboundUtm", () => {
  it("stamps third-party https URLs", () => {
    expect(
      withOutboundUtm("https://example.com/page", { campaign: "game_page" })
    ).toBe(
      "https://example.com/page?utm_source=playbound&utm_medium=website&utm_campaign=game_page"
    );
  });

  it("supports content and launcher medium", () => {
    expect(
      withOutboundUtm("https://example.com/", {
        campaign: "mod_page",
        content: "openarena",
        medium: "launcher",
      })
    ).toBe(
      "https://example.com/?utm_source=playbound&utm_medium=launcher&utm_campaign=mod_page&utm_content=openarena"
    );
  });

  it("skips first-party hosts", () => {
    expect(
      withOutboundUtm("https://playbound.club/games/x", { campaign: "game_page" })
    ).toBe("https://playbound.club/games/x");
    expect(
      withOutboundUtm("https://www.playbound.club/discover", { campaign: "footer" })
    ).toBe("https://www.playbound.club/discover");
  });

  it("skips non-http schemes", () => {
    expect(withOutboundUtm("steam://run/440", { campaign: "join" })).toBe(
      "steam://run/440"
    );
    expect(withOutboundUtm("mailto:hi@example.com", { campaign: "footer" })).toBe(
      "mailto:hi@example.com"
    );
  });

  it("leaves URLs that already have utm_source", () => {
    const url = "https://example.com/?utm_source=other&utm_campaign=x";
    expect(withOutboundUtm(url, { campaign: "game_page" })).toBe(url);
  });

  it("returns invalid / empty input unchanged", () => {
    expect(withOutboundUtm("", { campaign: "x" })).toBe("");
    expect(withOutboundUtm("not a url", { campaign: "x" })).toBe("not a url");
  });
});
