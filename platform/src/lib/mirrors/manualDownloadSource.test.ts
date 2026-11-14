import { describe, expect, it } from "vitest";
import { manualDownloadSource } from "./manualDownloadSource";

describe("manual download host classification", () => {
  it("counts only PlayBound's exact mirror host as VPS traffic", () => {
    expect(manualDownloadSource("https://mirror.playbound.club/games/game.zip")).toBe("playbound_vps");
    expect(manualDownloadSource("https://mirror.playbound.club.evil.example/game.zip")).toBe("public");
    expect(manualDownloadSource("https://s3.rogly.net/playbound/games/game.zip?X-Amz-Signature=abc")).toBe("s3_archive");
  });

  it("separates R2 from external game hosts", () => {
    expect(manualDownloadSource("https://r2.playbound.club/game.zip")).toBe("r2");
    expect(manualDownloadSource("https://files.example.com/game.zip", "https://files.example.com")).toBe("r2");
    expect(manualDownloadSource("https://files.example.com/game.zip", "files.example.com")).toBe("r2");
    expect(manualDownloadSource("https://github.com/team/game/releases/download/v1/game.zip")).toBe("public");
  });
});
