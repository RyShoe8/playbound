import { describe, it, expect } from "vitest";
import Artifact from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";
import { artifactScopedSourceId } from "@/lib/mirrors/telemetry";

/**
 * Schema validation for the rows `ensureArtifact` builds.
 *
 * A download of an unregistered game reported telemetry, the server tried to
 * register it, and the write threw a ValidationError because `sha256` was
 * `required` and the client had no checksum to send — Mongoose treats "" as
 * failing `required`. The route 500'd and the launcher's `.catch(() => {})`
 * swallowed it, so nothing appeared in the admin table and nothing complained.
 *
 * Mongoose validates without a connection, so this catches that class of bug
 * offline: build the document the code would insert and assert it is valid.
 */

/** Mirrors the shape ensureArtifact creates for a first-sighting. */
function artifactFromDownload(overrides: Record<string, unknown> = {}) {
  return new Artifact({
    artifactId: "0ad",
    gameSlug: "0ad",
    version: "unknown",
    artifactType: "game",
    filename: "0ad",
    relativePath: "games/0ad/unknown/0ad",
    sizeBytes: 0,
    sha256: "",
    licenseStatus: "unknown",
    mirrorEnabled: false,
    redistributionAllowed: false,
    vpsStatus: "missing",
    r2Status: "not_cached",
    r2PromotionScore: 0,
    r2Protected: false,
    r2Disabled: false,
    totalDownloads: 0,
    recentDownloads: 0,
    averageDownloadSpeed: 0,
    publicSuccessCount: 0,
    publicFailureCount: 0,
    ...overrides,
  });
}

describe("artifact registered from a download", () => {
  it("validates with no checksum", () => {
    // The exact case that was failing: a client that cannot supply a sha256.
    expect(artifactFromDownload().validateSync()).toBeUndefined();
  });

  it("validates with a checksum when one is known", () => {
    expect(artifactFromDownload({ sha256: "a".repeat(64) }).validateSync()).toBeUndefined();
  });

  it("validates the launcher installer shape", () => {
    const doc = artifactFromDownload({
      artifactId: "playbound-launcher-windows-0.2.14",
      gameSlug: null,
      version: "0.2.14",
      artifactType: "launcher",
      filename: "PlayBound-Setup-0.2.14.exe",
      relativePath: "artifacts/playbound-launcher-windows-0.2.14",
      sizeBytes: 83385666,
      sha256: "b".repeat(64),
      licenseStatus: "first_party",
      mirrorEnabled: true,
      vpsStatus: "verified",
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it("still rejects a row with no artifactId", () => {
    const err = artifactFromDownload({ artifactId: "" }).validateSync();
    expect(err).toBeDefined();
    expect(String(err)).toMatch(/artifactId/);
  });

  it("still rejects an unknown artifact type", () => {
    const err = artifactFromDownload({ artifactType: "nonsense" }).validateSync();
    expect(err).toBeDefined();
  });
});

describe("public source registered from a download", () => {
  it("keeps a catalog fallback source distinct for every artifact", () => {
    expect(artifactScopedSourceId("0ad", "direct-catalog", "public")).not.toBe(
      artifactScopedSourceId("unvanquished", "direct-catalog", "public")
    );
  });

  it("validates with the fields the telemetry payload carries", () => {
    const doc = new MirrorSource({
      sourceId: artifactScopedSourceId("0ad", "direct-catalog", "public"),
      artifactId: "0ad",
      sourceType: "public",
      url: "https://releases.wildfiregames.com/0ad-0.27.0-win64.exe",
      enabled: true,
      priority: 100,
      healthStatus: "unknown",
      successCount: 0,
      failureCount: 0,
      timeoutCount: 0,
      checksumFailureCount: 0,
      averageResponseTime: 0,
      averageDownloadSpeed: 0,
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it("rejects a source with no url", () => {
    const doc = new MirrorSource({
      sourceId: "direct-catalog",
      artifactId: "0ad",
      sourceType: "public",
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(String(err)).toMatch(/url/);
  });
});
