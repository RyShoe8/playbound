import { afterEach, describe, expect, it, vi } from "vitest";
import { BUTTON } from "@/lib/couch/protocol";
import { createPhoneHubExtras } from "@/lib/couch/phoneHubExtras";
import type { HubExtraRow } from "@/lib/couch/phoneHubExtras";

const pad = (index: number, button: number): Gamepad => ({
  index, id: `Physical pad ${index}`, connected: true, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 18 }, (_, i) => ({ pressed: i === button, touched: i === button, value: i === button ? 1 : 0 })),
} as unknown as Gamepad);

afterEach(() => vi.unstubAllGlobals());

describe("phone hub extra controllers", () => {
  it("joins three identities sequentially and sends each pad's own controls to its own slot", async () => {
    const memory = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => memory.get(key) || null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    });
    const joined: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") {
        const body = JSON.parse(String(opts.body));
        const index = Number(body.deviceLabel.match(/\d+/)?.[0]);
        joined.push(index);
        return Response.json({
          controllerId: `controller-${index}`, controllerToken: `join-${index}`,
          sessionToken: `session-${index}`, sessionId: "room-1",
          playerSlot: index, status: "approved",
        });
      }
      const index = Number(new URL(url, "https://playbound.club").searchParams.get("controllerId")?.match(/\d+/)?.[0]);
      return Response.json({ status: "approved", playerSlot: index, sessionToken: `session-${index}` });
    }));
    const frames: Array<Record<string, number | string>> = [];
    let rows: HubExtraRow[] = [];
    const pool = createPhoneHubExtras({
      code: "ABC123", sessionId: "room-1",
      send: (packet) => frames.push(packet as Record<string, number | string>),
      onChange: (next) => { rows = next; },
    });
    pool.observe([pad(1, 0), pad(2, 1), pad(3, 2)], 1000);
    await vi.waitFor(() => expect(rows.map((r) => r.playerSlot)).toEqual([1, 2, 3]));
    expect(joined).toEqual([1, 2, 3]);

    pool.observe([pad(1, 0), pad(2, 1), pad(3, 2)], 2000);
    expect(frames.map((f) => [f.controllerId, f.p, f.buttons])).toEqual([
      ["controller-1", 1, BUTTON.A],
      ["controller-2", 2, BUTTON.B],
      ["controller-3", 3, BUTTON.X],
    ]);
    await vi.waitFor(() => expect(rows.map((r) => r.playerSlot)).toEqual([1, 2, 3]));
    pool.observe([pad(1, 0), pad(3, 2)], 2100);
    expect(frames.at(-1)).toMatchObject({ controllerId: "controller-2", p: 2, buttons: 0 });
    pool.dispose();
  });
});
