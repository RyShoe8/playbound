import { describe, it, expect } from "vitest";
import { supportsController, supportsFlightstick } from "./support";

describe("supportsController", () => {
  it("detects controller support in features and tags", () => {
    expect(supportsController({ features: ["Controller Support"] })).toBe(true);
    expect(supportsController({ features: ["Flightstick Support"] })).toBe(true);
    expect(supportsController({ tags: ["Gamepad"] })).toBe(true);
    expect(supportsController({ tags: ["HOTAS"] })).toBe(true);
    expect(supportsController({ tags: ["Joystick"] })).toBe(true);
  });

  it("returns false for non-controller games", () => {
    expect(supportsController({ features: ["Singleplayer"], tags: ["RTS"] })).toBe(false);
    expect(supportsController(null)).toBe(false);
    expect(supportsController({})).toBe(false);
  });

  it("respects explicit hasControllerSupport boolean override", () => {
    expect(supportsController({ hasControllerSupport: false, features: ["Controller Support"] })).toBe(false);
    expect(supportsController({ hasControllerSupport: true, features: [] })).toBe(true);
  });
});

describe("supportsFlightstick", () => {
  it("detects flightstick and hotas support", () => {
    expect(supportsFlightstick({ features: ["Flightstick Support"] })).toBe(true);
    expect(supportsFlightstick({ tags: ["HOTAS"] })).toBe(true);
    expect(supportsFlightstick({ tags: ["Joystick"] })).toBe(true);
    expect(supportsFlightstick({ tags: ["Racing"] })).toBe(false);
  });
});
