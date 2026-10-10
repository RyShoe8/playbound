import { describe, expect, it } from "vitest";
import { previewHref, previewPagePath } from "./designPreview";

describe("design preview isolation", () => {
  it("maps real pages without changing their query parameters", () => {
    expect(previewPagePath("/new")).toBe("/");
    expect(previewPagePath("/new/games/openra")).toBe("/games/openra");
    expect(previewHref("/games/openra?tab=media#screenshots", "https://playbound.club")).toBe("/new/games/openra?tab=media#screenshots");
  });
  it.each(["/", "/news", "/new/api/library", "/new/_next/static", "/new/new/games", "/new/brand/logo.svg"])("does not alias %s", path => {
    expect(previewPagePath(path)).toBeNull();
  });
  it.each(["/api/library", "/new/events", "https://discord.gg/playbound", "playbound://play/openra", "/login", "/brand/logo.svg", "#controls"])("leaves non-page destinations untouched: %s", href => {
    expect(previewHref(href, "https://playbound.club")).toBeNull();
  });
});
