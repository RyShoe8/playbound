import { describe, expect, it } from "vitest";
import { normalizeFlightProfile } from "./flightDeviceProfile";

const hotas = {
  vidPid: "044F:B67C",
  label: "T.Flight Hotas 4",
  deviceType: "hotas",
  axes: { stickX: 0, stickY: 1, throttle: 2, twist: 5, rocker: 6 },
  unusableAxes: [3, 2],
  buttons: { "Button 1": 0, "Button 2": 1 },
  roles: { fire: "Button 1", altFire: "Button 2", hack: "Button 1", pause: "Button 9" },
  hat: { up: "up", right: "left", down: "down", left: "right" },
};

describe("normalizeFlightProfile", () => {
  it("keeps a valid calibration and drops anything unknown or contradictory", () => {
    const p = normalizeFlightProfile(hotas)!;
    expect(p.vidPid).toBe("044f:b67c");
    expect(p.roles).toEqual({ fire: "Button 1", altFire: "Button 2" });
    // An axis cannot be both bound and unusable.
    expect(p.unusableAxes).toEqual([3]);
    expect(p.hat.right).toBe("left");
  });
  it("rejects input that is not a usable device", () => {
    expect(normalizeFlightProfile({ ...hotas, vidPid: "nope" })).toBeNull();
    expect(normalizeFlightProfile({ ...hotas, axes: { throttle: 2 } })).toBeNull();
    expect(normalizeFlightProfile({ ...hotas, hat: { up: "up", right: "up", down: "down", left: "left" } })).toBeNull();
    expect(normalizeFlightProfile(null)).toBeNull();
  });
});
