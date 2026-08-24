import { describe, expect, it } from "vitest";
import { isEditionCompatible, isGameCompatible } from "./compatibility";

describe("desktop platform compatibility", () => {
  it("treats the generic desktop device bucket as Windows", () => {
    expect(isGameCompatible({ platforms: ["Windows"] }, "desktop")).toBe(true);
    expect(isGameCompatible({ platforms: ["Linux"] }, "desktop")).toBe(false);
    expect(isGameCompatible({ platforms: ["macOS"] }, "desktop")).toBe(false);
  });

  it("respects an edition platform override", () => {
    const game = { platforms: ["Windows", "Linux", "macOS"] };
    expect(isEditionCompatible({ platforms: ["Windows"] }, game, "desktop")).toBe(true);
    expect(isEditionCompatible({ platforms: ["Linux", "macOS"] }, game, "desktop")).toBe(
      false
    );
  });
});
