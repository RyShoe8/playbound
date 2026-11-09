import { describe, expect, it } from "vitest";
import { parseScore, parseVideoGameReviews, releasedAround } from "./wikipedia";
import { normalizeTitle } from "./sync";

// Shaped like real articles: coded rows, a custom row, a named ref reused
// from the body, an aggregator, a platform split and a print review with no link.
const ARTICLE = `{{Infobox video game
| title = Example Quest
| released = {{Video game release|WW|March 3, 2017}}
}}
'''Example Quest''' is a game.<ref name="pcg">{{cite web |last=Marks |first=Tom |date=July 10, 2017 |url=https://www.pcgamer.com/example-review/ |title=Review |work=[[PC Gamer]]}}</ref>
==Reception==
{{Video game reviews
| MC = PC: 87/100<ref>{{cite web |url=https://www.metacritic.com/game/example |title=Example |website=[[Metacritic]]}}</ref>
| GSpot = PC: 8/10<ref>{{cite web |url=https://www.gamespot.com/reviews/example/ |title=Example Review |work=[[GameSpot]] |author=Smith, Jane}}</ref><br>PS4: 7/10<ref>{{cite web |url=https://www.gamespot.com/reviews/example-ps4/ |work=GameSpot}}</ref>
| PCGUS = 92/100<ref name="pcg" />
| GameRev = B+<ref>{{cite web |url=http://old.example.com/rev |url-status=dead |archive-url=https://web.archive.org/web/2017/http://old.example.com/rev |work=[[GameRevolution]]}}</ref>
| Edge = 7/10
| rev1 = ''[[Rock Paper Shotgun]]''
| rev1Score = {{Rating|4|5}}<ref>{{cite web |url=https://www.rockpapershotgun.com/example |work=Rock Paper Shotgun}}</ref>
}}`;

describe("parseVideoGameReviews", () => {
  const rows = parseVideoGameReviews(ARTICLE);
  const by = (outlet: string) => rows.find((r) => r.outlet === outlet);

  it("skips aggregators and rows without a link", () => {
    expect(rows.map((r) => r.outlet).sort()).toEqual(["GameRevolution", "GameSpot", "PC Gamer", "Rock Paper Shotgun"]);
  });
  it("prefers the PC score on a multi-platform row", () => {
    expect(by("GameSpot")).toMatchObject({ score: 8, scoreMax: 10, url: "https://www.gamespot.com/reviews/example/", author: "Jane Smith" });
  });
  it("resolves a named reference defined elsewhere in the article", () => {
    expect(by("PC Gamer")).toMatchObject({ score: 92, scoreMax: 100, author: "Tom Marks", url: "https://www.pcgamer.com/example-review/" });
    expect(by("PC Gamer")?.publishedAt?.getUTCFullYear()).toBe(2017);
  });
  it("uses the archive link when the original is marked dead, and converts letter grades", () => {
    expect(by("GameRevolution")).toMatchObject({ score: 87, scoreMax: 100, scoreText: "B+", url: "https://web.archive.org/web/2017/http://old.example.com/rev" });
  });
  it("reads custom rows and star ratings", () => {
    expect(by("Rock Paper Shotgun")).toMatchObject({ score: 4, scoreMax: 5 });
  });
  it("returns nothing for an article without a reviews table", () => {
    expect(parseVideoGameReviews("{{Infobox video game}} no reception")).toEqual([]);
  });
});

describe("parseScore", () => {
  it("handles the common formats", () => {
    expect(parseScore("8.5/10")).toMatchObject({ score: 8.5, scoreMax: 10 });
    expect(parseScore("85%")).toMatchObject({ score: 85, scoreMax: 100 });
    expect(parseScore("Recommended")).toMatchObject({ score: null, scoreMax: null });
  });
});

describe("article matching", () => {
  it("checks the infobox release year", () => {
    expect(releasedAround(ARTICLE, 2017)).toBe(true);
    expect(releasedAround(ARTICLE, 2011)).toBe(false);
  });
  it("normalises titles so disambiguators and punctuation do not matter", () => {
    expect(normalizeTitle("Marathon 2: Durandal")).toBe(normalizeTitle("Marathon 2 Durandal"));
    expect(normalizeTitle("Prey (2017 video game)")).toBe("prey");
  });
});

describe("multi-platform tables and nested release lists", () => {
  const MULTI = `{{Infobox video game
| title = Multi
| released = {{Collapsible list
 | title = {{nobold|June 23, 2000}}
 | {{Video game release|NA|June 23, 2000}}
}}
| genre = Action
}}
{{Video game reviews
| PC = true
| PS2 = true
| MC_PC = 90/100<ref name="m"/>
| GSpot_PS2 = 8.1/10<ref>{{cite web |url=https://www.gamespot.com/ps2 |work=GameSpot}}</ref>
| GSpot_PC = 8.2/10<ref>{{cite web |url=https://www.gamespot.com/pc |work=GameSpot}}</ref>
| Edge_PS2 = 7/10<ref>{{cite web |url=https://www.edge-online.com/ps2 |work=Edge}}</ref>
}}`;

  it("keeps one row per outlet, preferring the PC column", () => {
    const rows = parseVideoGameReviews(MULTI);
    expect(rows.map((r) => [r.outlet, r.score, r.url])).toEqual([
      ["GameSpot", 8.2, "https://www.gamespot.com/pc"],
      ["Edge", 7, "https://www.edge-online.com/ps2"],
    ]);
  });
  it("reads the release year through nested templates", () => {
    expect(releasedAround(MULTI, 2000)).toBe(true);
    expect(releasedAround(MULTI, 2010)).toBe(false);
  });
});

describe("title normalisation", () => {
  it("treats arabic and roman sequel numbers alike without touching years", () => {
    expect(normalizeTitle("Thief 2: The Metal Age")).toBe(normalizeTitle("Thief II: The Metal Age"));
    expect(normalizeTitle("Pinball FX (2023 video game)")).toBe("pinball fx");
    expect(normalizeTitle("Dota 2")).not.toBe(normalizeTitle("Dota 2023"));
  });
});
