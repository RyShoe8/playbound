import { describe, expect, it } from "vitest";
import { serializeEvent } from "./serialize";

const baseEvent = {
  _id: "event-1",
  title: "Luanti Game Night",
  description: "",
  startsAt: "2026-09-04T00:00:00.000Z",
};

describe("serializeEvent", () => {
  it("makes site-relative event covers absolute for launcher clients", () => {
    const event = serializeEvent({
      ...baseEvent,
      coverImage: "/games/luanti/cover.webp",
    });

    expect(event.coverImage).toMatch(/^https?:\/\//);
    expect(event.coverImage?.endsWith("/games/luanti/cover.webp")).toBe(true);
  });

  it("preserves absolute event covers", () => {
    const coverImage = "https://blob.example/events/luanti.webp";
    expect(serializeEvent({ ...baseEvent, coverImage }).coverImage).toBe(coverImage);
  });
});
