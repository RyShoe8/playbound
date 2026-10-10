import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
import { getToken } from "next-auth/jwt";
import { middleware } from "./middleware";

describe("preview rewrite and username gate", () => {
  it("retains the page, query, and a preview-only noindex header", async () => {
    const response = await middleware(new NextRequest("https://playbound.club/new/games/openra?tab=media"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://playbound.club/games/openra?tab=media");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const normal = await middleware(new NextRequest("https://playbound.club/games/openra"));
    expect(normal.headers.get("x-robots-tag")).toBeNull();
    expect(normal.headers.get("x-middleware-rewrite")).toBeNull();
  });
  it("serves the distinct preview homepage without rewriting to the old home", async () => {
    const response = await middleware(new NextRequest("https://playbound.club/new"));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
  it("does not bypass username completion via /new", async () => {
    vi.mocked(getToken).mockResolvedValue({ needsUsername: true });
    const response = await middleware(new NextRequest("https://playbound.club/new/admin/events", { headers: { cookie: "next-auth.session-token=test" } }));
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/welcome");
    expect(destination.searchParams.get("next")).toBe("/new/admin/events");
  });
});
