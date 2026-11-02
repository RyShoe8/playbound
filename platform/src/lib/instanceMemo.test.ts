import { expect, it, vi } from "vitest";
import { instanceMemo } from "./instanceMemo";

it("does not duplicate an unfinished read after its TTL expires", async () => {
  let finish!: (value: string) => void;
  const read = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
  const first = instanceMemo("slow-test", 0, read);
  await Promise.resolve();
  expect(instanceMemo("slow-test", 0, read)).toBe(first);
  expect(read).toHaveBeenCalledTimes(1);
  finish("old");
  expect(await first).toBe("old");
  expect(await instanceMemo("slow-test", 0, async () => "fresh")).toBe("fresh");
});

it("retries a failed read rather than retaining its rejection", async () => {
  await expect(instanceMemo("failure-test", 10000, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
  expect(await instanceMemo("failure-test", 10000, async () => "ok")).toBe("ok");
});
