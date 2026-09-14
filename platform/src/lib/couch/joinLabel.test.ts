import { describe, expect, it } from "vitest";
import { couchControllerJoinLabel } from "./joinLabel";

describe("couchControllerJoinLabel", () => {
  it("labels game-view PC play without a pad", () => {
    expect(
      couchControllerJoinLabel({
        mode: "keyboard-mouse",
        gameLayout: true,
        controlChoice: "pc",
      })
    ).toBe("PC controls");
  });

  it("uses the connected gamepad id when present", () => {
    expect(
      couchControllerJoinLabel({
        mode: "keyboard-mouse",
        gameLayout: true,
        controlChoice: "pc",
        gamepadId: "DualSense Wireless Controller",
      })
    ).toBe("DualSense Wireless Controller");
  });

  it("labels phone-as-controller in game view", () => {
    expect(
      couchControllerJoinLabel({
        mode: "touch-gamepad",
        gameLayout: true,
        controlChoice: "phone",
      })
    ).toBe("Phone controller");
  });

  it("labels touch-only joiners", () => {
    expect(
      couchControllerJoinLabel({
        mode: "touch-gamepad",
        gameLayout: false,
        controlChoice: "pc",
      })
    ).toBe("Touch pad");
  });
});
