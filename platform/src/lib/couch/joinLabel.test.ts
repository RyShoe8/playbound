import { describe, expect, it } from "vitest";
import { couchControllerJoinLabel } from "./joinLabel";

describe("couchControllerJoinLabel", () => {
  it("labels game-view keyboard play", () => {
    expect(
      couchControllerJoinLabel({
        mode: "keyboard-mouse",
        gameLayout: true,
        controlChoice: "keyboard",
      })
    ).toBe("Keyboard & mouse");
  });

  it("uses the connected gamepad id when present", () => {
    expect(
      couchControllerJoinLabel({
        mode: "standard-gamepad",
        gameLayout: true,
        controlChoice: "controller",
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
        controlChoice: "keyboard",
      })
    ).toBe("Touch pad");
  });
});
