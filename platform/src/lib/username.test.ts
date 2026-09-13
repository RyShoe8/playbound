import { describe, expect, it } from "vitest";
import { normalizeUsername } from "./username";

describe("normalizeUsername", () => {
  it("folds case and trims so Alice and alice collide", () => {
    expect(normalizeUsername(" Alice ")).toBe("alice");
    expect(normalizeUsername("ALICE")).toBe(normalizeUsername("alice"));
  });
});
