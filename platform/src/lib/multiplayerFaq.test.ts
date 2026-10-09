import { describe, expect, it } from "vitest";
import { multiplayerFaqAnswer, withAccurateMultiplayerFaq } from "@/lib/multiplayerFaq";

const mk = (slug: string, title: string, o: Record<string, unknown> = {}) => ({
  slug,
  title,
  features: [] as string[],
  tags: [] as string[],
  launchMethods: ["install"],
  ...o,
});

describe("multiplayer FAQ answer", () => {
  it("names PlayBound Connect and dedicated servers where the game has them", () => {
    const a = multiplayerFaqAnswer(
      mk("openra", "OpenRA", {
        features: ["Multiplayer", "Dedicated Servers"],
        launchMethods: ["install", "server"],
        maxPlayers: 8,
        launcherInstall: { enabled: true, kind: "github-zip" },
      }) as never
    );
    expect(a).toContain("PlayBound Connect");
    expect(a).toContain("dedicated server");
    expect(a).toContain("up to 8 players");
  });

  it("says no for a single-player game and promises nothing", () => {
    const a = multiplayerFaqAnswer(mk("castlevania-revamped", "Castlevania ReVamped", { features: ["Singleplayer"] }) as never);
    expect(a).toMatch(/^No\./);
    expect(a).not.toContain("PlayBound Connect");
  });

  it("does not promise Connect or dedicated servers for publisher-run online games", () => {
    const a = multiplayerFaqAnswer(
      mk("warframe", "Warframe", {
        features: ["Multiplayer", "Co-op"],
        launcherInstall: { enabled: true, kind: "external", url: "https://x.test" },
      }) as never
    );
    expect(a).toContain("not available");
    expect(a).not.toMatch(/start a party/);
  });

  it("credits Deus Ex multiplayer to the HX co-op edition", () => {
    const a = multiplayerFaqAnswer(
      mk("deus-ex-goty-edition", "Deus Ex GOTY", { features: ["Multiplayer", "Co-op"] }) as never
    );
    expect(a).toContain("HX Co-op edition");
    expect(a).toContain("PlayBound Connect");
  });

  it("replaces the stored multiplayer answer in place and keeps other entries", () => {
    const game = {
      ...mk("openra", "OpenRA", { features: ["Multiplayer"], launchMethods: ["install", "server"], launcherInstall: { enabled: true, kind: "github-zip" } }),
      faq: [
        { q: "Is OpenRA free?", a: "Yes." },
        { q: "Does OpenRA have multiplayer?", a: "Yes, with public servers you can join for free." },
      ],
    };
    const out = withAccurateMultiplayerFaq(game as never) as typeof game;
    expect(out.faq).toHaveLength(2);
    expect(out.faq[0].a).toBe("Yes.");
    expect(out.faq[1].a).toContain("PlayBound Connect");
  });

  it("leaves a game with no stored FAQ alone so the page can derive one", () => {
    const game = { ...mk("openra", "OpenRA"), faq: undefined };
    expect(withAccurateMultiplayerFaq(game as never)).toBe(game);
  });
});
