import { describe, expect, it } from "vitest";
import { OUTLETS, parseFeed, readReviewPage, reviewSubject, slugHeadline } from "./outlets";
import { isReviewOf } from "./sync";

const outlet = (name: string) => OUTLETS.find((o) => o.name === name)!;

describe("reviewSubject", () => {
  it("strips the review marker, platforms and the tagline", () => {
    expect(reviewSubject("Football Manager 2027 Review &#8211; Tactically Effective and Getting Better")).toBe("Football Manager 2027");
    expect(reviewSubject("Análisis de Football Manager 27: La redención que la saga necesitaba")).toBe("Football Manager 27");
    expect(reviewSubject("Marvel's Guardians of the Galaxy: Encore Edition Nintendo Switch 2 Review")).toBe(
      "Marvel's Guardians of the Galaxy: Encore Edition"
    );
    expect(reviewSubject("Faraway – análise/review")).toBe("Faraway");
  });
  it("reads a headline out of a URL slug", () => {
    expect(slugHeadline("https://www.thegamesmachine.it/x/football-manager-27-recensione/")).toBe("football manager 27 recensione");
  });
});

describe("isReviewOf", () => {
  const cog = outlet("COGconnected");
  it("matches the game's own review and nothing else", () => {
    expect(isReviewOf({ title: "Palia Review – Cozy, Chill, and Mostly Drama-Free", url: "https://cogconnected.com/review/palia-review/" }, cog, "Palia")).toBe(true);
    // A sequel or spin-off contains the title but is a different game.
    expect(isReviewOf({ title: "Hollow Knight: Silksong Review – Worth It", url: "https://cogconnected.com/review/silksong/" }, cog, "Hollow Knight")).toBe(false);
    // News that mentions the game is not a review.
    expect(isReviewOf({ title: "Palia Gets a New Zone", url: "https://cogconnected.com/review/palia-zone/" }, cog, "Palia")).toBe(false);
    // Off the outlet's review path.
    expect(isReviewOf({ title: "Palia Review", url: "https://cogconnected.com/2026/11/palia/" }, cog, "Palia")).toBe(false);
  });
  it("falls back to the URL slug when the headline is empty", () => {
    const tgm = outlet("The Games Machine");
    expect(isReviewOf({ title: "– Recensione", url: "https://www.thegamesmachine.it/a/core-keeper-recensione/" }, tgm, "Core Keeper")).toBe(true);
  });
  it("treats a named edition as the same game", () => {
    const wcc = outlet("Wccftech");
    expect(
      isReviewOf({ title: "Marvel's Guardians of the Galaxy Review – What Kind", url: "https://wccftech.com/review/x/" }, wcc, "Marvel's Guardians of the Galaxy: Encore Edition")
    ).toBe(true);
  });
});

describe("readReviewPage", () => {
  it("prefers schema.org reviewRating", () => {
    const html = `<meta property="og:description" content="A sharp, generous sequel that knows its strengths.">
      <script type="application/ld+json">{"reviewRating":{"@type":"Rating","ratingValue":"8.5","bestRating":"10"},"datePublished":"2026-11-04T10:00:00Z","author":{"@type":"Person","name":"Sam Writer"}}</script>`;
    expect(readReviewPage(html, outlet("Wccftech"))).toMatchObject({ score: 8.5, scoreMax: 10, author: "Sam Writer", snippet: "A sharp, generous sequel that knows its strengths." });
  });
  it("reads an outlet's own score markup on its scale", () => {
    expect(readReviewPage('<div class="score-overlay">78</div>', outlet("COGconnected"))).toMatchObject({ score: 78, scoreMax: 100 });
    expect(readReviewPage('<span class="td-review-final-score">4</span>', outlet("Final Weapon"))).toMatchObject({ score: 4, scoreMax: 5 });
    expect(readReviewPage("Faraway — PC — Nota: 7,0 | Versão", outlet("GameBlast"))).toMatchObject({ score: 7, scoreMax: 10 });
  });
  it("leaves an unscored outlet unscored", () => {
    expect(readReviewPage('<div class="score-overlay">78</div>', outlet("Polygon"))).toMatchObject({ score: null, scoreMax: null });
  });
});

describe("parseFeed", () => {
  it("reads RSS and Atom items", () => {
    const rss = `<rss><channel><title>Site</title><item><title><![CDATA[Faraway Review]]></title><link>https://a.example/faraway-review/</link></item></channel></rss>`;
    const atom = `<feed><entry><title>Psycho-Sleuth Review</title><link rel="alternate" href="https://b.example/psycho"/></entry></feed>`;
    expect(parseFeed(rss)).toEqual([{ title: "Faraway Review", url: "https://a.example/faraway-review/" }]);
    expect(parseFeed(atom)).toEqual([{ title: "Psycho-Sleuth Review", url: "https://b.example/psycho" }]);
  });
});
