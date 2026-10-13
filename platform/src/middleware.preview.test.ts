import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
import { getToken } from "next-auth/jwt";
import { middleware } from "./middleware";

describe("retired preview redirects and username gate", () => {
  it("permanently redirects retired preview pages and preserves filters", async () => {
    const response = await middleware(new NextRequest("https://playbound.club/new/games/openra?tab=media"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://playbound.club/games/openra?tab=media");
    expect(response.headers.get("x-robots-tag")).toBeNull();
    const normal = await middleware(new NextRequest("https://playbound.club/games/openra"));
    expect(normal.headers.get("x-robots-tag")).toBeNull();
    expect(normal.headers.get("x-middleware-rewrite")).toBeNull();
  });
  it("redirects the retired preview homepage to the canonical homepage", async () => {
    const response = await middleware(new NextRequest("https://playbound.club/new"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://playbound.club/");
  });
  it("does not bypass username completion via /new", async () => {
    vi.mocked(getToken).mockResolvedValue({ needsUsername: true });
    const response = await middleware(new NextRequest("https://playbound.club/new/admin/events", { headers: { cookie: "next-auth.session-token=test" } }));
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/welcome");
    expect(destination.searchParams.get("next")).toBe("/new/admin/events");
  });
});
