import { describe, expect, it } from "vitest";
import {
  clientVersionForHostableGame,
  expectedServerVersionForHostableGame,
  versionsLikelyMismatch,
} from "@/lib/gameHost/versions";

describe("gameHost versions", () => {
  it("pins Freeciv client and expected server to 3.2.5", () => {
    expect(clientVersionForHostableGame("freeciv")).toBe("3.2.5");
    expect(expectedServerVersionForHostableGame("freeciv")).toBe("3.2.5");
  });

  it("flags Freeciv 3.1 server against 3.2.5 client", () => {
    expect(versionsLikelyMismatch("3.2.5", "3.1.0")).toBe(true);
    expect(versionsLikelyMismatch("3.2.5", "3.2.5")).toBe(false);
  });

  it("does not flag GitHub-latest client labels as mismatches", () => {
    expect(versionsLikelyMismatch("GitHub latest", "Ubuntu apt")).toBe(false);
  });
});
