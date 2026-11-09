import { describe, expect, it } from "vitest";
import {
  aggregateCommunity,
  aggregateEditorial,
  editorialVerdict,
  formatOutletScore,
  normalizedScore,
  sortEditorialReviews,
} from "./ratings";

describe("normalizedScore", () => {
  it("scales any outlet scale to 0–100", () => {
    expect(normalizedScore({ score: 8, scoreMax: 10 })).toBe(80);
    expect(normalizedScore({ score: 4.5, scoreMax: 5 })).toBe(90);
    expect(normalizedScore({ score: 87, scoreMax: 100 })).toBe(87);
  });
  it("treats unscored and malformed reviews as unscored", () => {
    expect(normalizedScore({ score: null, scoreMax: 10 })).toBeNull();
    expect(normalizedScore({ score: 11, scoreMax: 10 })).toBeNull();
    expect(normalizedScore({ score: 5, scoreMax: 0 })).toBeNull();
    expect(normalizedScore({})).toBeNull();
  });
  it("prints the score as the outlet published it", () => {
    expect(formatOutletScore({ score: 8, scoreMax: 10 })).toBe("8/10");
    expect(formatOutletScore({ score: 4.5, scoreMax: 5 })).toBe("4.5/5");
    expect(formatOutletScore({ score: null, scoreMax: 10 })).toBeNull();
  });
});

describe("aggregateEditorial", () => {
  it("withholds a score until enough scored reviews exist", () => {
    const agg = aggregateEditorial([{ score: 9, scoreMax: 10 }, { score: 80, scoreMax: 100 }, { score: null, scoreMax: null }]);
    expect(agg.score).toBeNull();
    expect(agg.scoredCount).toBe(2);
    expect(agg.totalCount).toBe(3);
  });
  it("averages normalised scores and ignores unscored ones", () => {
    const agg = aggregateEditorial([
      { score: 9, scoreMax: 10 },
      { score: 4, scoreMax: 5 },
      { score: 70, scoreMax: 100 },
      { score: null, scoreMax: null },
    ]);
    expect(agg.score).toBe(80);
    expect(agg.verdict?.label).toBe("Generally favorable");
  });
});

describe("verdict bands", () => {
  it("matches the familiar aggregate bands", () => {
    expect(editorialVerdict(95).label).toBe("Universal acclaim");
    expect(editorialVerdict(75).tone).toBe("positive");
    expect(editorialVerdict(74).tone).toBe("mixed");
    expect(editorialVerdict(49).tone).toBe("negative");
  });
});

describe("aggregateCommunity", () => {
  it("shows stars out of ten once enough players have rated", () => {
    expect(aggregateCommunity(13, 3)).toMatchObject({ score: 8.7, count: 3 });
    expect(aggregateCommunity(10, 2).score).toBeNull();
    expect(aggregateCommunity(0, 0)).toMatchObject({ score: null, count: 0 });
  });
});

describe("sortEditorialReviews", () => {
  it("lists highest first and unscored last", () => {
    const sorted = sortEditorialReviews([
      { id: "a", score: null, scoreMax: null },
      { id: "b", score: 6, scoreMax: 10 },
      { id: "c", score: 9, scoreMax: 10 },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});
