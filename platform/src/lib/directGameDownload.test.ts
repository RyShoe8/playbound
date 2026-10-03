import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredGameFileUrl, directGameDownload } from "./directGameDownload";
import type { LauncherInstall } from "@/lib/launcherInstall";

const recipe: LauncherInstall = {
  enabled: true,
  kind: "direct-zip",
  url: "https://example.org/game-win.zip",
  urlMac: "https://example.org/game-mac.zip",
};

afterEach(() => vi.unstubAllGlobals());

describe("direct game download choice", () => {
  it("chooses the file for the visitor's OS without offering a Windows file on Linux", async () => {
    expect(configuredGameFileUrl(recipe, "windows")).toBe("https://example.org/game-win.zip");
    expect(configuredGameFileUrl(recipe, "macos")).toBe("https://example.org/game-mac.zip");
    expect(await directGameDownload(recipe, "linux", "https://example.org/downloads")).toEqual({
      url: "https://example.org/downloads", direct: false,
    });
  });

  it("sends Macs with separate Intel and Apple Silicon builds to the official site", async () => {
    const macRecipe = { ...recipe, urlMacX64: "https://example.org/game-intel.zip" };
    expect(configuredGameFileUrl(macRecipe, "macos")).toBeNull();
    expect(await directGameDownload(macRecipe, "macos", "https://example.org/downloads")).toEqual({
      url: "https://example.org/downloads", direct: false,
    });
    const fetchRelease = vi.fn();
    vi.stubGlobal("fetch", fetchRelease);
    expect(await directGameDownload({
      ...macRecipe, kind: "github-zip", repo: "team/game", assetPatternMac: "game-mac",
    }, "macos", "https://example.org/downloads")).toEqual({
      url: "https://example.org/downloads", direct: false,
    });
    expect(fetchRelease).not.toHaveBeenCalled();
  });

  it("never treats a store or browser URL as a downloadable game file", async () => {
    expect(await directGameDownload({ ...recipe, kind: "external" }, "windows", "https://example.org/game")).toEqual({
      url: "https://example.org/game", direct: false,
    });
    expect(configuredGameFileUrl({ ...recipe, url: "javascript:alert(1)" }, "windows")).toBeNull();
  });

  it("resolves the matching official GitHub release asset when the recipe has no pinned URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      assets: [
        { name: "game-linux.zip", browser_download_url: "https://github.com/team/game/releases/download/v1/game-linux.zip" },
        { name: "game-win.zip", browser_download_url: "https://github.com/team/game/releases/download/v1/game-win.zip" },
      ],
    }) }));
    const result = await directGameDownload({
      enabled: true, kind: "github-zip", repo: "team/game", assetPattern: "win\\.zip$",
    }, "windows", "https://example.org/game");
    expect(result).toEqual({ url: "https://github.com/team/game/releases/download/v1/game-win.zip", direct: true });
  });
});
