import { describe, expect, it } from "vitest";
import { editionUpdateSchema } from "@/lib/editionPayload";

describe("edition install config", () => {
  it("keeps per-platform GitHub asset patterns instead of stripping them", () => {
    const parsed = editionUpdateSchema.parse({
      gameSlug: "privateer-gemini-gold",
      slug: "openprivateer",
      name: "OpenPrivateer",
      shortDescription: "x",
      description: "x",
      type: "community",
      installMethod: "playbound_installer",
      installConfig: {
        playbound_installer: {
          kind: "github-zip",
          repo: "schlangz/openprivateer-project",
          assetPattern: "windows\.zip$",
          assetPatternLinux: "linux-x86_64\.zip$",
          assetPatternMac: "macos\.zip$",
        },
      },
    });
    const cfg = parsed.installConfig?.playbound_installer;
    expect(cfg?.assetPatternLinux).toBe("linux-x86_64\.zip$");
    expect(cfg?.assetPatternMac).toBe("macos\.zip$");
  });
});

describe("edition recipe parity with game recipes", () => {
  it("accepts every install-recipe field a game recipe can carry", async () => {
    const { launcherInstallSchema } = await import("@/lib/gamePayload");
    // Fields that describe site-side bookkeeping rather than how to install.
    const bookkeeping = new Set([
      "enabled", "autoUpdatePinned", "detectedVersion", "versionCheckStatus",
      "versionCheckNote", "lastVersionCheckAt", "needsDosBox",
    ]);
    const gameFields = Object.keys(launcherInstallSchema.shape).filter((k) => !bookkeeping.has(k));
    const sample: Record<string, unknown> = {
      kind: "github-zip", repo: "o/r", assetPattern: "a", assetPatternMac: "m", assetPatternLinux: "l",
      exeHint: "e", url: "https://x.test/a", urlMac: "https://x.test/m", urlMacX64: "https://x.test/mx",
      urlLinux: "https://x.test/l", fileName: "f", archiveInstallerName: "ai", uploadId: "u", versionLabel: "v", steamAppId: "123",
      steamPrerequisites: [{ appId: "1", name: "n" }], knownExePaths: ["k"], registryTitles: ["r"],
      installRoot: "i", connectArgs: ["c"], note: "n", overlayUrl: "https://x.test/o", overlayFileName: "of",
      overlayDest: "od", unwrapSingleRoot: true, needsAdmin: true, needsDirectDrawWrapper: true, needsDotNetMajor: 8,
    };
    const parsed = editionUpdateSchema.parse({
      gameSlug: "game-x", slug: "ed-x", name: "Name", shortDescription: "x", description: "x", type: "community",
      installMethod: "playbound_installer", installConfig: { playbound_installer: sample },
    }).installConfig?.playbound_installer as Record<string, unknown>;
    const dropped = gameFields.filter((k) => k in sample && parsed[k] === undefined);
    const untested = gameFields.filter((k) => !(k in sample));
    expect(dropped, `edition schema strips: ${dropped.join(", ")}`).toEqual([]);
    expect(untested, `add these to the parity sample: ${untested.join(", ")}`).toEqual([]);
  });
});
