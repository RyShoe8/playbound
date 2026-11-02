import { expect, it, vi } from "vitest";
import { createSingleFlight } from "./singleFlight";

it("shares concurrent work but does not retain settled results", async () => {
  const run = createSingleFlight();
  let release!: (value: number) => void;
  const task = vi.fn(() => new Promise<number>((resolve) => { release = resolve; }));
  const first = run("game", task);
  const second = run("game", task);
  expect(second).toBe(first);
  await Promise.resolve();
  expect(task).toHaveBeenCalledTimes(1);
  expect(await run("other-game", async () => 7)).toBe(7);
  release(4);
  expect(await first).toBe(4);
  expect(await run("game", async () => 5)).toBe(5);
});

it("releases failed operations, including synchronous throws", async () => {
  const run = createSingleFlight();
  const first = run("game", () => { throw new Error("offline"); });
  expect(run("game", async () => 0)).toBe(first);
  await expect(first).rejects.toThrow("offline");
  expect(await run("game", async () => 6)).toBe(6);
});
