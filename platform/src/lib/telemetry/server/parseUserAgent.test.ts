import { describe, it, expect } from "vitest";
import { launcherOsLabel, parseUserAgent } from "./parseUserAgent";

/**
 * Launcher events were landing in the analytics Client column as
 * "unknown · unknown · desktop". The desktop app sends
 * `playbound-launcher/<version> (<platform>; <arch>)`, which has no browser
 * token and spells the platform lowercase without "Windows NT" — so every
 * browser rule missed and every OS rule except Linux missed too.
 */

describe("launcher user agents", () => {
  it("names the client and the OS for each platform", () => {
    expect(parseUserAgent("playbound-launcher/0.2.12 (windows; x64)")).toEqual({
      browser: "Launcher",
      os: "Windows",
      device: "desktop",
    });
    expect(parseUserAgent("playbound-launcher/0.2.12 (macos; arm64)")).toEqual({
      browser: "Launcher",
      os: "macOS",
      device: "desktop",
    });
    expect(parseUserAgent("playbound-launcher/0.2.12 (linux; x64)")).toEqual({
      browser: "Launcher",
      os: "Linux",
      device: "desktop",
    });
  });

  it("no longer reports unknown for a launcher event", () => {
    const parsed = parseUserAgent("playbound-launcher/0.2.12 (windows; x64)");
    expect(parsed.browser).not.toBe("unknown");
    expect(parsed.os).not.toBe("unknown");
  });

  it("survives an unfamiliar platform token rather than guessing", () => {
    const parsed = parseUserAgent("playbound-launcher/1.0.0 (freebsd; x64)");
    expect(parsed.browser).toBe("Launcher");
    expect(parsed.os).toBe("freebsd");
  });

  it("is not fooled by a browser that merely mentions the launcher", () => {
    // Only a UA that *starts* with the launcher token is the launcher; a page
    // URL or referrer containing the word is still a browser.
    const chrome =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 playbound-launcher";
    expect(parseUserAgent(chrome).browser).toBe("Chrome");
    expect(parseUserAgent(chrome).os).toBe("Windows");
  });
});

describe("browser user agents still parse", () => {
  it("reads Chrome on Windows", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      )
    ).toEqual({ browser: "Chrome", os: "Windows", device: "desktop" });
  });

  it("reads Safari on iPhone as mobile", () => {
    const parsed = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );
    expect(parsed.os).toBe("iOS");
    expect(parsed.device).toBe("mobile");
  });

  it("reads Android as Android, not Linux", () => {
    // Android agents contain "Linux", so ordering matters here too.
    const parsed = parseUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    );
    expect(parsed.os).toBe("Android");
    expect(parsed.device).toBe("mobile");
  });

  it("still reports unknown for an empty agent", () => {
    expect(parseUserAgent("")).toEqual({
      browser: "unknown",
      os: "unknown",
      device: "unknown",
    });
  });
});

describe("launcherOsLabel", () => {
  it("maps platform tokens the launcher sends in the payload", () => {
    expect(launcherOsLabel("windows")).toBe("Windows");
    expect(launcherOsLabel("darwin")).toBe("macOS");
    expect(launcherOsLabel("linux")).toBe("Linux");
  });

  it("returns null when there is nothing to go on", () => {
    expect(launcherOsLabel("")).toBeNull();
    expect(launcherOsLabel(undefined)).toBeNull();
    expect(launcherOsLabel(42)).toBeNull();
  });
});
