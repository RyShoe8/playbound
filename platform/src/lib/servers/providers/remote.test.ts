import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRemoteMaster, fetchViaAdapterOrDirect } from "./remote";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("master adapter failures", () => {
  it("does not mistake an HTTP 200 poll error for an empty server list", async () => {
    vi.stubEnv("MASTER_ADAPTER_URL", "https://adapter.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ servers: [], error: "connect ECONNREFUSED" })));
    await expect(fetchRemoteMaster("hedgewars")).rejects.toThrow("connect ECONNREFUSED");
  });

  it("uses the direct source when the adapter poll fails", async () => {
    vi.stubEnv("MASTER_ADAPTER_URL", "https://adapter.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ servers: [], error: "upstream offline" })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const direct = vi.fn().mockResolvedValue([{ id: "direct", name: "Direct" }]);
    expect(await fetchViaAdapterOrDirect("example", direct)).toEqual([{ id: "direct", name: "Direct" }]);
    expect(direct).toHaveBeenCalledOnce();
  });
});
