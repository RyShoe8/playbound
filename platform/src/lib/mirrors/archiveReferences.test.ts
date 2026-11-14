import { describe, expect, it } from "vitest";
import { mirrorArchiveKeys } from "./archiveReferences";

describe("live mirror recipe references", () => {
  it("walks nested edition methods and deduplicates exact paths", () => {
    const url = "https://mirror.playbound.club/launcher-packages/editions/game/mod/Game%20Pack.zip";
    expect(mirrorArchiveKeys({ playbound_installer: { url }, methods: [{ overlayUrl: url }] }))
      .toEqual(["launcher-packages/editions/game/mod/Game Pack.zip"]);
  });
  it("ignores off-domain URLs and unsafe paths", () => {
    expect(mirrorArchiveKeys([
      "https://mirror.playbound.club.evil.example/games/a.zip",
      "https://mirror.playbound.club/games/%2e%2e/secret.zip",
      "https://mirror.playbound.club/artifacts/launcher.exe",
    ])).toEqual([]);
  });
});
