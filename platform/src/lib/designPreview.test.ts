import { afterEach, describe, expect, it, vi } from "vitest";
import { pageHref, previewHref, previewPagePath } from "./designPreview";

describe("design preview isolation", () => {
  it("maps real pages without changing their query parameters", () => {
    expect(previewPagePath("/new")).toBe("/");
    expect(previewPagePath("/new/games/openra")).toBe("/games/openra");
    expect(previewHref("/games/openra?tab=media#screenshots", "https://playbound.club")).toBe("/new/games/openra?tab=media#screenshots");
  });
  it.each(["/", "/news", "/new/api/library", "/new/_next/static", "/new/new/games", "/new/brand/logo.svg"])("does not alias %s", path => {
    expect(previewPagePath(path)).toBeNull();
  });
  it.each(["/api/library", "/new/events", "https://discord.gg/playbound", "playbound://play/openra", "/login", "/signup", "/forgot-password", "/reset-password?token=test", "/verify-email", "/brand/logo.svg", "#controls"])("leaves non-page destinations untouched: %s", href => {
    expect(previewHref(href, "https://playbound.club")).toBeNull();
  });
});


describe("programmatic preview navigation", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps search filters and login return targets in the preview", () => {
    vi.stubGlobal("window", { location: { pathname: "/new/search", origin: "https://playbound.club" } });
    expect(pageHref("/search?q=openra&genre=RTS")).toBe("/new/search?q=openra&genre=RTS");
    expect(pageHref("/multiplayer?startParty=1")).toBe("/new/multiplayer?startParty=1");
    expect(pageHref("/api/library")).toBe("/api/library");
    expect(pageHref("/login?callbackUrl=/new")).toBe("/login?callbackUrl=/new");
  });
  it("leaves original-site actions unchanged", () => {
    vi.stubGlobal("window", { location: { pathname: "/search", origin: "https://playbound.club" } });
    expect(pageHref("/search?q=openra")).toBe("/search?q=openra");
  });
});

it("keeps signed-out library login returns in the preview without changing auth endpoints", () => {
  expect(previewHref("/login?callbackUrl=/library", "https://playbound.club")).toBe("/login?callbackUrl=%2Fnew%2Flibrary");
  expect(previewHref("/login?callbackUrl=https://other.example/", "https://playbound.club")).toBeNull();
});
