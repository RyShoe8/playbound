import { describe, expect, it } from "vitest";
import { launcherPackageKind } from "./launcherPackageKind";

describe("uploaded launcher package type", () => {
  it("maps installer files to the executable installer recipe", () => {
    expect(launcherPackageKind("Game Setup.EXE")).toBe("direct-installer");
    expect(launcherPackageKind("Game.msi")).toBe("direct-installer");
  });

  it("keeps archive recipes and rejects unknown files", () => {
    expect(launcherPackageKind("game.zip")).toBe("direct-zip");
    expect(launcherPackageKind("game.7z")).toBe("direct-7z");
    expect(launcherPackageKind("game.dmg")).toBeNull();
  });
});
