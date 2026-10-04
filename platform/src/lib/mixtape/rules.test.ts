import { describe, it, expect } from "vitest";
import { starterPack, validateDeck, confirmedWinner, httpsUrl } from "./rules";
const tapes = Array.from({ length: 100 }, (_, i) => ({ id: String(i), starter: i < 5, enabled: true }));
describe("Mixtape rules", () => {
  it("grants five universal and fifteen unique random tapes", () => {
    const pack = starterPack(tapes, () => 0);
    expect(pack).toHaveLength(20); expect(new Set(pack).size).toBe(20);
    expect(pack.slice(0, 5)).toEqual(["0", "1", "2", "3", "4"]);
  });
  it("does not initialize incomplete catalogs", () => { expect(() => starterPack([])).toThrow(); });
  it("rejects duplicates, missing, disabled and unowned deck slots", () => {
    const ids = ["0", "1", "2", "3", "4", "5"];
    expect(validateDeck(ids, ids, ids)).toEqual(ids);
    expect(() => validateDeck([...ids.slice(0, 5), "0"], ids, ids)).toThrow();
    expect(() => validateDeck(ids, ids.slice(1), ids)).toThrow();
    expect(() => validateDeck(ids, ids, ids.slice(1))).toThrow();
    expect(() => validateDeck(ids.slice(1), ids, ids)).toThrow();
  });
  it("requires both distinct players to agree on winner and checksum", () => {
    expect(confirmedWinner({ a: { winner: "a", checksum: "1" } }, ["a", "b"])).toBeNull();
    expect(confirmedWinner({ a: { winner: "a", checksum: "1" }, b: { winner: "a", checksum: "2" } }, ["a", "b"])).toBeNull();
    expect(confirmedWinner({ a: { winner: "a", checksum: "1" }, b: { winner: "a", checksum: "1" } }, ["a", "b"])).toBe("a");
  });
  it("rejects unsafe artist links", () => { expect(() => httpsUrl("javascript:alert(1)")).toThrow(); expect(() => httpsUrl("https://user:pass@example.com")).toThrow(); });
});
