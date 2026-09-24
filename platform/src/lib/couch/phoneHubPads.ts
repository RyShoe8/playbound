import { BUTTON } from "@/lib/couch/protocol";

export type HubPadState = {
  buttons: number; lx: number; ly: number; rx: number; ry: number; lt: number; rt: number;
};

type PadLike = Pick<Gamepad, "index" | "id" | "connected" | "buttons" | "axes">;

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/** Each physical pad is read independently; no active-pad switching. */
export function mapPhoneHubPad(pad: Pick<PadLike, "buttons" | "axes">): HubPadState {
  let buttons = 0;
  const map: [number, number][] = [
    [0, BUTTON.A], [1, BUTTON.B], [2, BUTTON.X], [3, BUTTON.Y],
    [4, BUTTON.LB], [5, BUTTON.RB], [8, BUTTON.BACK], [9, BUTTON.START],
    [10, BUTTON.LS], [11, BUTTON.RS], [12, BUTTON.DPAD_UP],
    [13, BUTTON.DPAD_DOWN], [14, BUTTON.DPAD_LEFT], [15, BUTTON.DPAD_RIGHT],
  ];
  for (const [index, bit] of map) {
    const button = pad.buttons[index];
    if (button && (button.pressed || (button.value ?? 0) > 0.5)) buttons |= bit;
  }
  if (pad.buttons[16]?.pressed || (pad.buttons[16]?.value ?? 0) > 0.5) buttons |= BUTTON.GUIDE;
  if (pad.buttons[17]?.pressed || (pad.buttons[17]?.value ?? 0) > 0.5) buttons |= BUTTON.BACK;
  const deadzone = (value: number) => Math.abs(value) < 0.08 ? 0 : value;
  const trigger = (value: number) => value < 0.05 ? 0 : value;
  return {
    buttons,
    lx: deadzone(clamp(pad.axes[0] ?? 0, -1, 1)),
    ly: deadzone(clamp(pad.axes[1] ?? 0, -1, 1)),
    rx: deadzone(clamp(pad.axes[2] ?? 0, -1, 1)),
    ry: deadzone(clamp(pad.axes[3] ?? 0, -1, 1)),
    lt: trigger(clamp(pad.buttons[6]?.value ?? 0, 0, 1)),
    rt: trigger(clamp(pad.buttons[7]?.value ?? 0, 0, 1)),
  };
}

export function selectPhoneHubPads<T extends Pick<PadLike, "index" | "connected">>(
  pads: (T | null)[], primaryIndex: number | null, capacity: number
): { primaryIndex: number | null; primary: T | null; extras: T[] } {
  const connected = pads.filter((pad): pad is T => Boolean(pad?.connected))
    .sort((a, b) => a.index - b.index);
  const selectedIndex = primaryIndex ?? connected[0]?.index ?? null;
  return {
    primaryIndex: selectedIndex,
    primary: connected.find((pad) => pad.index === selectedIndex) || null,
    extras: connected.filter((pad) => pad.index !== selectedIndex).slice(0, Math.max(0, capacity - 1)),
  };
}
