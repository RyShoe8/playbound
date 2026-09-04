import { describe, expect, it } from "vitest";
import { launcherInstallSchema, toPayloadLauncherInstall } from "@/lib/gamePayload";

/**
 * The recipe the admin API hands back must be a recipe the admin API accepts.
 *
 * Mongo returns an unset path as null, so a read-modify-write — fetch a game,
 * change one URL, PATCH it back — arrived carrying `needsDotNetMajor: null` and
 * was rejected with "expected number, received null". Every string field
 * already tolerated null; the four flags and the one number did not, so callers
 * had to strip nulls before a save would go through.
 *
 * The fixture below is a real document as the API returned it (7KAA), nulls in
 * exactly the places Mongo puts them.
 */

const AS_READ = {
  enabled: true,
  kind: "direct-installer",
  repo: null,
  assetPattern: null,
  exeHint: null,
  url: "https://sourceforge.net/projects/skfans/files/7KAA%202.15.7/7kaa-install-2.15.7-win32.exe/download",
  urlMac: null,
  urlMacX64: null,
  urlLinux: null,
  assetPatternMac: null,
  assetPatternLinux: null,
  fileName: "7kaa-install-2.15.7-win32.exe",
  uploadId: null,
  versionLabel: "2.15.7",
  steamAppId: null,
  steamPrerequisites: [],
  knownExePaths: [],
  registryTitles: [],
  installRoot: null,
  connectArgs: [],
  note: "Auto-discovered installer download",
  detectedVersion: null,
  lastVersionCheckAt: null,
  versionCheckStatus: null,
  versionCheckNote: null,
  autoUpdatePinned: true,
  overlayUrl: null,
  overlayFileName: null,
  overlayDest: null,
  unwrapSingleRoot: false,
  needsDosBox: false,
  needsAdmin: false,
  needsDotNetMajor: null,
};

describe("launcherInstallSchema accepts what the API returns", () => {
  it("parses a document straight back without stripping nulls first", () => {
    const parsed = launcherInstallSchema.safeParse(AS_READ);
    expect(parsed.success ? null : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`))
      .toBeNull();
  });

  it("null on any nullable flag or number is accepted, not type-rejected", () => {
    // Each of these produced its own 400 before.
    for (const key of [
      "needsDotNetMajor",
      "unwrapSingleRoot",
      "needsDosBox",
      "needsAdmin",
      "autoUpdatePinned",
    ] as const) {
      const parsed = launcherInstallSchema.safeParse({ ...AS_READ, [key]: null });
      expect(parsed.success, `${key}: null was rejected`).toBe(true);
    }
  });

  it("a null flag normalises to absent, the way toPayloadLauncherInstall emits it", () => {
    const parsed = launcherInstallSchema.parse({ ...AS_READ, needsDosBox: null });
    expect(parsed.needsDosBox).toBeUndefined();
    expect(parsed.needsDotNetMajor).toBeUndefined();
  });

  it("null autoUpdatePinned means pinned, matching toPayloadLauncherInstall", () => {
    expect(launcherInstallSchema.parse({ ...AS_READ, autoUpdatePinned: null }).autoUpdatePinned).toBe(true);
    expect(launcherInstallSchema.parse({ ...AS_READ, autoUpdatePinned: false }).autoUpdatePinned).toBe(false);
    expect(launcherInstallSchema.parse({ ...AS_READ, autoUpdatePinned: true }).autoUpdatePinned).toBe(true);
  });

  it("real values still survive, and are still validated", () => {
    const parsed = launcherInstallSchema.parse({
      ...AS_READ,
      needsDotNetMajor: 8,
      needsAdmin: true,
      unwrapSingleRoot: true,
    });
    expect(parsed.needsDotNetMajor).toBe(8);
    expect(parsed.needsAdmin).toBe(true);
    expect(parsed.unwrapSingleRoot).toBe(true);

    // Being liberal about null must not mean accepting nonsense.
    expect(launcherInstallSchema.safeParse({ ...AS_READ, needsDotNetMajor: 0 }).success).toBe(false);
    expect(launcherInstallSchema.safeParse({ ...AS_READ, needsDotNetMajor: -1 }).success).toBe(false);
    expect(launcherInstallSchema.safeParse({ ...AS_READ, needsDotNetMajor: 1.5 }).success).toBe(false);
    expect(launcherInstallSchema.safeParse({ ...AS_READ, needsAdmin: "yes" }).success).toBe(false);
  });

  it("parsing is a fixed point: parse -> payload -> parse", () => {
    /*
     * The property that was actually broken. Whatever the API returns, feeding
     * it back in must produce the same recipe rather than an error.
     */
    const once = launcherInstallSchema.parse(AS_READ);
    const payload = toPayloadLauncherInstall(once as never);
    const twice = launcherInstallSchema.parse(payload as never);
    expect(twice).toEqual(once);
  });

  it("the per-platform URLs added for mac and Linux round-trip too", () => {
    const withPlatforms = {
      ...AS_READ,
      urlLinux:
        "https://sourceforge.net/projects/skfans/files/7KAA%202.15.7/7kaa-2.15.7-linux-x86-64.tar.gz/download",
      urlMac: "https://example.com/game.dmg",
      urlMacX64: null,
    };
    const parsed = launcherInstallSchema.parse(withPlatforms);
    expect(parsed.urlLinux).toContain("linux-x86-64.tar.gz");
    expect(parsed.urlMac).toBe("https://example.com/game.dmg");
    expect(parsed.urlMacX64).toBeNull();
  });
});
