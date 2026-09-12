import { describe, it, expect } from "vitest";
import {
  assertUpdateFileUrlEndsWithExe,
  assertWindowsSetupFilename,
  buildSignedWindowsLatestYml,
  ensureLauncherRelativePath,
  launcherUpdateDownloadUrl,
} from "./launcherUpdateFeed";

describe("launcherUpdateFeed", () => {
  it("rejects filenames that are not PlayBound-Setup-<version>.exe", () => {
    expect(() => assertWindowsSetupFilename("PlayBound-Setup-0.3.56")).toThrow(/Expected/);
    expect(() => assertWindowsSetupFilename("setup.exe")).toThrow(/Expected/);
  });

  it("builds an update download URL whose path ends with .exe", () => {
    const url = launcherUpdateDownloadUrl("PlayBound-Setup-0.3.56.exe");
    expect(url).toBe(
      "https://playbound.club/api/launcher/download/PlayBound-Setup-0.3.56.exe"
    );
    expect(() => assertUpdateFileUrlEndsWithExe(url)).not.toThrow();
  });

  it("refuses bare /api/launcher/download URLs (the electron-updater trap)", () => {
    expect(() =>
      assertUpdateFileUrlEndsWithExe("https://playbound.club/api/launcher/download")
    ).toThrow(/must end with \.exe/);
  });

  it("heals legacy relativePath keys that omitted the .exe filename", () => {
    const healed = ensureLauncherRelativePath(
      "playbound-launcher-windows-0.3.56",
      "PlayBound-Setup-0.3.56.exe",
      "artifacts/playbound-launcher-windows-0.3.56"
    );
    expect(healed.healed).toBe(true);
    expect(healed.relativePath).toBe(
      "artifacts/playbound-launcher-windows-0.3.56/PlayBound-Setup-0.3.56.exe"
    );
  });

  it("writes latest.yml with a .exe download URL and matching path", () => {
    const yml = buildSignedWindowsLatestYml({
      version: "0.3.56",
      fileName: "PlayBound-Setup-0.3.56.exe",
      sizeBytes: 131920896,
      sha512: "abc123",
      releaseDate: "2026-09-12T20:00:00.000Z",
    });
    expect(yml).toContain(
      "url: https://playbound.club/api/launcher/download/PlayBound-Setup-0.3.56.exe"
    );
    expect(yml).toContain("path: PlayBound-Setup-0.3.56.exe");
    expect(yml).not.toMatch(/url: https:\/\/playbound\.club\/api\/launcher\/download\s/);
  });

  it("refuses to publish latest.yml without sha512", () => {
    expect(() =>
      buildSignedWindowsLatestYml({
        version: "0.3.56",
        fileName: "PlayBound-Setup-0.3.56.exe",
        sizeBytes: 1,
        sha512: "",
      })
    ).toThrow(/sha512/);
  });
});
