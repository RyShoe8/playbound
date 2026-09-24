import { describe, expect, it } from "vitest";
import { BUTTON } from "@/lib/couch/protocol";
import { mapPhoneHubPad, selectPhoneHubPads } from "@/lib/couch/phoneHubPads";

const pad = (index: number, connected = true) => ({ index, connected });
const buttons = (pressed: number) => Array.from({ length: 18 }, (_, i) => ({ pressed: i === pressed, touched: i === pressed, value: i === pressed ? 1 : 0 }));

describe("phone hub pads", () => {
  it("keeps a fixed P1 pad while other connected pads take separate positions", () => {
    const initial = selectPhoneHubPads([pad(0), pad(1), pad(2), pad(3)], null, 4);
    expect(initial.primaryIndex).toBe(0);
    expect(initial.extras.map((p) => p.index)).toEqual([1, 2, 3]);
    const disconnected = selectPhoneHubPads([pad(0, false), pad(1), pad(2)], initial.primaryIndex, 4);
    expect(disconnected.primary).toBeNull();
    expect(disconnected.extras.map((p) => p.index)).toEqual([1, 2]);
  });

  it("maps each pad's own buttons and axes without blending input", () => {
    const first = mapPhoneHubPad({ buttons: buttons(0), axes: [0.8, 0, 0, 0] });
    const second = mapPhoneHubPad({ buttons: buttons(1), axes: [-0.7, 0, 0, 0] });
    expect(first.buttons).toBe(BUTTON.A);
    expect(second.buttons).toBe(BUTTON.B);
    expect(first.lx).toBe(0.8);
    expect(second.lx).toBe(-0.7);
  });
});
