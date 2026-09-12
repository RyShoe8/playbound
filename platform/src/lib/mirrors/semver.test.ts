import { describe, it, expect } from "vitest";
import { compareSemVer, pickLatestLauncherArtifact } from "./semver";

describe("pickLatestLauncherArtifact", () => {
  it("prefers higher semver over newer createdAt stand-ins", () => {
    const pick = pickLatestLauncherArtifact([
      { artifactId: "playbound-launcher-windows-0.3.50", version: "0.3.50", vpsStatus: "verified" },
      { artifactId: "playbound-launcher-windows-0.3.56", version: "0.3.56", vpsStatus: "verified" },
    ]);
    expect(pick?.version).toBe("0.3.56");
  });

  it("compareSemVer orders patch releases", () => {
    expect(compareSemVer("0.3.56", "0.3.50")).toBeGreaterThan(0);
    expect(compareSemVer("0.3.57", "0.3.56")).toBeGreaterThan(0);
  });
});
