import { describe, expect, it } from "vitest";
import {
  clientVersionForHostableGame,
  expectedServerVersionForHostableGame,
  hasComparableVersion,
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

  it("does not flag descriptive expected server labels (TripleA, ET)", () => {
    expect(versionsLikelyMismatch("v2.6.14688", "Manual jar (if installed)")).toBe(false);
    expect(versionsLikelyMismatch("v2.85.0", "ET: Legacy (etlded)")).toBe(false);
  });

  it("only compares when server version was probed (semver)", () => {
    expect(hasComparableVersion("3.2.5")).toBe(true);
    expect(hasComparableVersion("v2.85.0")).toBe(true);
    expect(hasComparableVersion("13.4")).toBe(true);
    expect(hasComparableVersion("Ubuntu apt")).toBe(false);
    expect(hasComparableVersion("Manual jar (if installed)")).toBe(false);
    expect(hasComparableVersion("hedgewars-server: user error (unrecognized optio")).toBe(false);
    expect(hasComparableVersion("Game is Xonotic using base gamedir data")).toBe(false);
  });

  it("does not flag same major.minor patch drift (BZFlag apt)", () => {
    expect(versionsLikelyMismatch("2.4.30", "2.4.26.20240416")).toBe(false);
  });

  it("does not flag OpenTTD CDN latest against probed apt version", () => {
    expect(versionsLikelyMismatch("OpenTTD CDN latest", "13.4")).toBe(false);
  });
});
