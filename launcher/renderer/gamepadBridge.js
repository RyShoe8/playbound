/**
 * PlayBound Universal Gamepad Bridge (Renderer Client)
 * 
 * Captures connected physical controllers (PS5 DualSense, PS4 DualShock, Switch Pro,
 * and generic gamepads) via the HTML5 Gamepad API and pipes them through IPC to
 * the ViGEm virtual XInput provider.
 */

const BUTTON = {
  A: 1 << 0,
  B: 1 << 1,
  X: 1 << 2,
  Y: 1 << 3,
  LB: 1 << 4,
  RB: 1 << 5,
  BACK: 1 << 6,
  START: 1 << 7,
  LS: 1 << 8,
  RS: 1 << 9,
  DPAD_UP: 1 << 10,
  DPAD_DOWN: 1 << 11,
  DPAD_LEFT: 1 << 12,
  DPAD_RIGHT: 1 << 13,
  GUIDE: 1 << 14,
};

let bridgeLoopActive = false;
let loopTimer = null;
let lastSentMask = 0;
let lastSentLx = 0;
let lastSentLy = 0;
let lastSentRx = 0;
let lastSentRy = 0;
let lastSentLt = 0;
let lastSentRt = 0;

function deadzone(val, threshold = 0.15) {
  if (Math.abs(val) < threshold) return 0;
  return val;
}

function pollAndSendGamepadFrame() {
  if (!bridgeLoopActive) return;

  try {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    const pad = pads.find((p) => p && p.connected);

    if (pad) {
      const btns = pad.buttons || [];
      const axes = pad.axes || [];

      let mask = 0;
      if (btns[0]?.pressed || btns[0]?.value > 0.5) mask |= BUTTON.A;
      if (btns[1]?.pressed || btns[1]?.value > 0.5) mask |= BUTTON.B;
      if (btns[2]?.pressed || btns[2]?.value > 0.5) mask |= BUTTON.X;
      if (btns[3]?.pressed || btns[3]?.value > 0.5) mask |= BUTTON.Y;
      if (btns[4]?.pressed || btns[4]?.value > 0.5) mask |= BUTTON.LB;
      if (btns[5]?.pressed || btns[5]?.value > 0.5) mask |= BUTTON.RB;

      // PS5 Touchpad click is exposed as Button 17 in standard Gamepad API.
      // Button 8 is Share/Create/Select.
      const touchpadPressed = btns[17]?.pressed || btns[17]?.value > 0.5;
      const selectPressed = btns[8]?.pressed || btns[8]?.value > 0.5;
      if (selectPressed || touchpadPressed) mask |= BUTTON.BACK;

      if (btns[9]?.pressed || btns[9]?.value > 0.5) mask |= BUTTON.START;
      if (btns[10]?.pressed || btns[10]?.value > 0.5) mask |= BUTTON.LS;
      if (btns[11]?.pressed || btns[11]?.value > 0.5) mask |= BUTTON.RS;
      if (btns[12]?.pressed || btns[12]?.value > 0.5) mask |= BUTTON.DPAD_UP;
      if (btns[13]?.pressed || btns[13]?.value > 0.5) mask |= BUTTON.DPAD_DOWN;
      if (btns[14]?.pressed || btns[14]?.value > 0.5) mask |= BUTTON.DPAD_LEFT;
      if (btns[15]?.pressed || btns[15]?.value > 0.5) mask |= BUTTON.DPAD_RIGHT;
      if (btns[16]?.pressed || btns[16]?.value > 0.5) mask |= BUTTON.GUIDE;

      const lx = deadzone(axes[0] || 0);
      const ly = deadzone(axes[1] || 0);
      const rx = deadzone(axes[2] || 0);
      const ry = deadzone(axes[3] || 0);

      // Triggers can be buttons (standard) or axes
      let lt = btns[6]?.value ?? (btns[6]?.pressed ? 1 : 0);
      let rt = btns[7]?.value ?? (btns[7]?.pressed ? 1 : 0);
      if (lt < 0.05) lt = 0;
      if (rt < 0.05) rt = 0;

      // Only send when state changes or at periodic refresh
      const stateChanged =
        mask !== lastSentMask ||
        Math.abs(lx - lastSentLx) > 0.01 ||
        Math.abs(ly - lastSentLy) > 0.01 ||
        Math.abs(rx - lastSentRx) > 0.01 ||
        Math.abs(ry - lastSentRy) > 0.01 ||
        Math.abs(lt - lastSentLt) > 0.02 ||
        Math.abs(rt - lastSentRt) > 0.02;

      if (stateChanged) {
        lastSentMask = mask;
        lastSentLx = lx;
        lastSentLy = ly;
        lastSentRx = rx;
        lastSentRy = ry;
        lastSentLt = lt;
        lastSentRt = rt;

        window.playbound?.gamepadBridgeSendFrame?.({
          buttons: mask,
          lx,
          ly,
          rx,
          ry,
          lt,
          rt,
        });
      }
    }
  } catch {
    /* ignore polling error */
  }

  if (bridgeLoopActive) {
    loopTimer = setTimeout(pollAndSendGamepadFrame, 8); // ~120Hz polling
  }
}

/**
 * Check if the active connected controller is a DualSense or DirectInput pad that benefits from bridging.
 */
export function isBridgeableGamepadConnected() {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  const pad = pads.find((p) => p && p.connected);
  if (!pad) return false;

  const id = (pad.id || "").toLowerCase();
  // DualSense, DualShock, Switch Pro, or generic DirectInput / Bluetooth controllers
  return (
    id.includes("dualsense") ||
    id.includes("dualshock") ||
    id.includes("wireless controller") ||
    id.includes("054c") ||
    id.includes("0ce6") ||
    id.includes("nintendo") ||
    id.includes("switch") ||
    id.includes("sony") ||
    !id.includes("xinput")
  );
}

/**
 * Start the Gamepad Bridge transmission loop.
 */
export async function enableGamepadBridge() {
  if (bridgeLoopActive) return true;

  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  const pad = pads.find((p) => p && p.connected);
  const profile = {
    id: pad?.id || "DirectInput Controller",
    label: pad?.id?.includes("DualSense") ? "PS5 DualSense" : "Gamepad",
  };

  const res = await window.playbound?.startGamepadBridge?.(profile);
  if (res?.ok) {
    bridgeLoopActive = true;
    pollAndSendGamepadFrame();
    return true;
  }
  return false;
}

/**
 * Stop the Gamepad Bridge transmission loop.
 */
export async function disableGamepadBridge() {
  bridgeLoopActive = false;
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
  await window.playbound?.stopGamepadBridge?.();
}
