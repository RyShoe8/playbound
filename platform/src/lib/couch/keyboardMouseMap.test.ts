import { describe, expect, it } from "vitest";
import { BUTTON } from "./protocol";
import { applyKeyboardMouseEvent, emptyPadAxes } from "./keyboardMouseMap";

describe("keyboardMouseMap", () => {
  it("maps WASD to stick and d-pad", () => {
    const held = { up: false, down: false, left: false, right: false };
    let s = emptyPadAxes();
    s = applyKeyboardMouseEvent(s, held, { type: "keydown", code: "KeyW" });
    s = applyKeyboardMouseEvent(s, held, { type: "keydown", code: "KeyD" });
    expect(s.ly).toBe(-1);
    expect(s.lx).toBe(1);
    expect(s.buttons & BUTTON.DPAD_UP).toBeTruthy();
    expect(s.buttons & BUTTON.DPAD_RIGHT).toBeTruthy();
  });

  it("maps attack keys and mouse clicks", () => {
    const held = { up: false, down: false, left: false, right: false };
    let s = emptyPadAxes();
    s = applyKeyboardMouseEvent(s, held, { type: "keydown", code: "KeyZ" });
    expect(s.buttons & BUTTON.A).toBeTruthy();
    s = applyKeyboardMouseEvent(s, held, { type: "mousedown", button: 2 });
    expect(s.buttons & BUTTON.B).toBeTruthy();
  });
});
