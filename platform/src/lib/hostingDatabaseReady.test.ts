import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ command: vi.fn() }));
vi.mock("mongoose", () => ({ default: { connection: { readyState: 1, db: { command: mocks.command } } } }));
import { ensureHostingDatabaseReady, isDatabaseAvailabilityError } from "./db";
beforeEach(() => { vi.useFakeTimers(); mocks.command.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe("read-only hosting database readiness", () => {
  it("recovers a transient pool checkout", async () => {
    mocks.command.mockRejectedValueOnce(new Error("Timed out while checking out a connection from connection pool"))
      .mockResolvedValueOnce({ ok: 1 });
    const result = ensureHostingDatabaseReady();
    await vi.runAllTimersAsync();
    await result;
    expect(mocks.command).toHaveBeenCalledTimes(2);
    expect(mocks.command).toHaveBeenLastCalledWith({ ping: 1 }, { timeoutMS: 2000 });
  });
  it("bounds retry to two probes", async () => {
    mocks.command.mockRejectedValue(new Error("Server selection timed out after 5000 ms"));
    const result = expect(ensureHostingDatabaseReady()).rejects.toThrow("Server selection");
    await vi.runAllTimersAsync();
    await result;
    expect(mocks.command).toHaveBeenCalledTimes(2);
  });
  it("fails immediately for auth errors", async () => {
    mocks.command.mockRejectedValue(new Error("Authentication failed"));
    await expect(ensureHostingDatabaseReady()).rejects.toThrow("Authentication");
    expect(mocks.command).toHaveBeenCalledTimes(1);
  });
  it("classifies driver errors without relying on their message", () => {
    for (const name of ["MongoWaitQueueTimeoutError", "MongoServerSelectionError", "MongooseServerSelectionError", "MongoPoolClearedError"]) {
      expect(isDatabaseAvailabilityError(Object.assign(new Error("unavailable"), { name }))).toBe(true);
    }
    expect(isDatabaseAvailabilityError(new Error("Validation failed"))).toBe(false);
  });
});
