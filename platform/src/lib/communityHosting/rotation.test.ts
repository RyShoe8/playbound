import { describe, expect, it } from "vitest";
import { rotationPriority } from "./rotation";

describe("rotation priority", () => {
  const now = new Date("2026-09-24T20:00:00Z");
  it("serves a never-hosted profile before one that ran recently", () => {
    const history = [{ profileKey: "recent", onlineSince: new Date("2026-09-24T19:00:00Z") }];
    expect(rotationPriority(now, { key: "new" }, history)).toBeGreaterThan(rotationPriority(now, { key: "recent" }, history));
  });
  it("uses weight when absence is otherwise equal", () => {
    expect(rotationPriority(now, { key: "a", weight: 3 }, [])).toBeGreaterThan(rotationPriority(now, { key: "b", weight: 1 }, []));
  });
});
