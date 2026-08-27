import { describe, expect, it } from "vitest";
import { formatNetBirdHttpError } from "./client";

describe("formatNetBirdHttpError", () => {
  it("detects dashboard HTML leaked onto /api routes", () => {
    const html =
      '<!DOCTYPE html><html lang="en"><head></head><body><script src="/_next/static/chunks/app.js"></script></body></html>';
    const message = formatNetBirdHttpError(404, "/groups", html);
    expect(message).toContain("NetBird 404 on /groups");
    expect(message).toContain("dashboard HTML instead of JSON");
    expect(message).toContain("Reverse-proxy /api");
  });

  it("keeps JSON API error detail", () => {
    const message = formatNetBirdHttpError(
      401,
      "/groups",
      JSON.stringify({ message: "unauthorized" })
    );
    expect(message).toBe("NetBird 401 on /groups: unauthorized");
  });
});
