import { describe, expect, it, vi } from "vitest";
import { createAhrefsPageViewTracker } from "./ahrefsPageViews";

describe("Ahrefs page views", () => {
  it("waits for the SDK and sends the current route once despite readiness/remount repeats", () => {
    const track = createAhrefsPageViewTracker();
    const page = { pathname: "/discover", search: "", notFound: false };
    const send = vi.fn();
    track(page);
    track({ ...page, send });
    track({ ...page, send });
    expect(send).toHaveBeenCalledTimes(1);
    track({ ...page, pathname: "/games/openra", send });
    track({ ...page, send });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("excludes admin, launcher auth and 404s even after the script loaded", () => {
    const track = createAhrefsPageViewTracker();
    const send = vi.fn();
    const page = { pathname: "/", search: "", notFound: false, send };
    track(page);
    for (const pathname of ["/admin", "/admin/events", "/launcher/auth", "/launcher/auth/callback"]) track({ ...page, pathname });
    track({ ...page, pathname: "/missing", notFound: true });
    expect(send).toHaveBeenCalledTimes(1);
    track(page);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("retains query navigation matching the other page-view trackers", () => {
    const track = createAhrefsPageViewTracker();
    const send = vi.fn();
    const page = { pathname: "/discover", search: "?genre=action", notFound: false, send };
    track(page);
    track(page);
    track({ ...page, search: "?genre=strategy" });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
