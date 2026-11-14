import { afterEach, describe, expect, it, vi } from "vitest";
import { s3ArchiveConfig, signedS3ArchiveDownloadUrl } from "./s3Archive";

afterEach(() => vi.unstubAllEnvs());

function configure() {
  vi.stubEnv("S3_ARCHIVE_ENDPOINT", "https://s3.rogly.net");
  vi.stubEnv("S3_ARCHIVE_BUCKET", "playbound");
  vi.stubEnv("S3_ARCHIVE_REGION", "us-east-1");
  vi.stubEnv("S3_ARCHIVE_ACCESS_KEY_ID", "test-access-key");
  vi.stubEnv("S3_ARCHIVE_SECRET_ACCESS_KEY", "test-secret-key");
}

describe("Ceph S3 archive", () => {
  it("requires separate archive credentials and an HTTPS gateway", () => {
    vi.stubEnv("S3_ARCHIVE_ENDPOINT", "https://s3.rogly.net");
    vi.stubEnv("S3_ARCHIVE_BUCKET", "playbound");
    vi.stubEnv("S3_ARCHIVE_ACCESS_KEY_ID", "");
    vi.stubEnv("S3_ARCHIVE_SECRET_ACCESS_KEY", "");
    expect(s3ArchiveConfig()).toBeNull();
    configure();
    vi.stubEnv("S3_ARCHIVE_ENDPOINT", "http://rook-ceph-rgw-ceph-objectstore.rook-ceph.svc:80");
    expect(() => s3ArchiveConfig()).toThrow(/HTTPS origin/);
  });

  it("signs path-style Ceph URLs without embedding credentials in the URL path", async () => {
    configure();
    const signed = new URL(await signedS3ArchiveDownloadUrl("games/example/game.zip", "game.zip"));
    expect(signed.origin).toBe("https://s3.rogly.net");
    expect(signed.pathname).toBe("/playbound/games/example/game.zip");
    expect(signed.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(signed.searchParams.get("response-content-disposition")).toContain("game.zip");
    expect(signed.href).not.toContain("test-secret-key");
    await expect(signedS3ArchiveDownloadUrl("games/../other.zip", "other.zip")).rejects.toThrow(/object key/);
  });
});
