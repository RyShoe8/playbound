import { describe, expect, it } from "vitest";
import { hostedPayloadFromDoc } from "./provision";

describe("hostedPayloadFromDoc", () => {
  it("withholds connection details until the room is ready", () => {
    const payload = hostedPayloadFromDoc("freedoom", "dedicated", {
      status: "pending",
      host: "203.0.113.10",
      port: 10666,
      name: "Allocated but still loading",
      roomCode: "early-code",
    });

    expect(payload.host).toBeNull();
    expect(payload.port).toBeNull();
    expect(payload.name).toBeNull();
    expect(payload.roomCode).toBeNull();
  });

  it("exposes connection details once the room is ready", () => {
    const payload = hostedPayloadFromDoc("freedoom", "dedicated", {
      status: "ready",
      host: "203.0.113.10",
      port: 10666,
      name: "Ready room",
    });

    expect(payload.host).toBe("203.0.113.10");
    expect(payload.port).toBe(10666);
    expect(payload.name).toBe("Ready room");
  });
});
