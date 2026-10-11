import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openPlayboundDeepLink } from "./openPlayboundDeepLink";

describe("launcher browser handoff", () => {
  let browser: EventTarget;
  let clicked: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    clicked = [];
    browser = new EventTarget();
    vi.stubGlobal("window", Object.assign(browser, { setTimeout, clearTimeout }));
    vi.stubGlobal("document", Object.assign(new EventTarget(), {
      visibilityState: "visible",
      body: { appendChild: vi.fn() },
      createElement: () => {
        const anchor = { href: "", style: {}, rel: "", remove: vi.fn(), click: () => clicked.push(anchor.href) };
        return anchor;
      },
    }));
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("hands off the exact game/edition without downloading setup when the app takes focus", () => {
    const onResult = vi.fn();
    openPlayboundDeepLink("playbound://install/openra?edition=official", {
      downloadUrl: "https://example.org/setup.exe", autoDownload: true, onResult,
    });
    browser.dispatchEvent(new Event("blur"));
    vi.runAllTimers();
    expect(clicked).toEqual(["playbound://install/openra?edition=official"]);
    expect(onResult).toHaveBeenCalledWith("launched");
  });

  it("downloads the selected platform's launcher only after a missed handoff", () => {
    const onResult = vi.fn();
    openPlayboundDeepLink("playbound://install/openra", {
      downloadUrl: "https://example.org/setup.dmg", autoDownload: true, onResult,
    });
    expect(clicked).toHaveLength(1);
    vi.runAllTimers();
    expect(clicked).toEqual(["playbound://install/openra", "https://example.org/setup.dmg"]);
    expect(onResult).toHaveBeenCalledWith("download");
  });

  it("does not download an installer without explicit opt-in", () => {
    const onResult = vi.fn();
    openPlayboundDeepLink("playbound://play/openra", { downloadUrl: "https://example.org/setup.exe", onResult });
    vi.runAllTimers();
    expect(clicked).toEqual(["playbound://play/openra"]);
    expect(onResult).toHaveBeenCalledWith("miss");
  });

  it("cancels pending fallback and callbacks", () => {
    const onResult = vi.fn();
    const cancel = openPlayboundDeepLink("playbound://install/openra", {
      downloadUrl: "https://example.org/setup.exe", autoDownload: true, onResult,
    });
    cancel();
    vi.runAllTimers();
    expect(clicked).toHaveLength(1);
    expect(onResult).not.toHaveBeenCalled();
  });
});
