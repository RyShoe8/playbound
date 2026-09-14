import { describe, expect, it } from "vitest";
import { iceServersIncludeTurn } from "./rtcSignal";

describe("iceServersIncludeTurn", () => {
  it("detects turn entries", () => {
    expect(
      iceServersIncludeTurn([
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:203.0.113.10:3478", username: "u", credential: "c" },
      ])
    ).toBe(true);
  });

  it("is false for stun-only", () => {
    expect(iceServersIncludeTurn([{ urls: "stun:stun.l.google.com:19302" }])).toBe(false);
  });
});
