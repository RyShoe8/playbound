import { describe, expect, it } from "vitest";
import {
  DEFAULT_LINUX_LAUNCHER_DOWNLOAD_URL,
  DEFAULT_MAC_LAUNCHER_DOWNLOAD_URL,
  DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL,
  detectLauncherOsFromUa,
  launcherDownloadUrlForOs,
} from "@/lib/launcherDownload";

const LINUX_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

describe("detectLauncherOsFromUa", () => {
  it("detects desktop Linux", () => {
    expect(detectLauncherOsFromUa(LINUX_UA)).toBe("linux");
  });

  it("detects macOS", () => {
    expect(detectLauncherOsFromUa(MAC_UA)).toBe("macos");
  });

  it("detects Windows", () => {
    expect(detectLauncherOsFromUa(WINDOWS_UA)).toBe("windows");
  });

  it("does not treat Android as desktop Linux", () => {
    expect(detectLauncherOsFromUa(ANDROID_UA)).toBe("windows");
  });
});

describe("launcherDownloadUrlForOs", () => {
  it("returns AppImage alias for Linux", () => {
    const url = launcherDownloadUrlForOs("linux");
    expect(url).toBe(DEFAULT_LINUX_LAUNCHER_DOWNLOAD_URL);
    expect(url.endsWith("PlayBound-Launcher-Setup.AppImage")).toBe(true);
  });

  it("returns DMG alias for macOS", () => {
    const url = launcherDownloadUrlForOs("macos");
    expect(url).toBe(DEFAULT_MAC_LAUNCHER_DOWNLOAD_URL);
    expect(url.endsWith("PlayBound-Launcher-Setup.dmg")).toBe(true);
  });

  it("returns Setup.exe alias for Windows", () => {
    const url = launcherDownloadUrlForOs("windows");
    expect(url).toBe(DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL);
    expect(url.endsWith("PlayBound-Launcher-Setup.exe")).toBe(true);
  });

  it("wires UA → OS → installer for Linux handoff", () => {
    const os = detectLauncherOsFromUa(LINUX_UA);
    expect(launcherDownloadUrlForOs(os)).toContain("PlayBound-Launcher-Setup.AppImage");
  });
});
