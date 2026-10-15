import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), host: vi.fn() }));
vi.mock("./access", () => ({ authorizeServer: mocks.auth }));
vi.mock("@/lib/gameHost/client", () => ({ logsOnHost: mocks.host }));
import { getServerLogs } from "./logs";
beforeEach(() => { vi.resetAllMocks(); });
it("checks log-specific permission before reaching the host", async () => {
  mocks.auth.mockResolvedValue({ error: "Forbidden", status: 403 });
  expect(await getServerLogs("moderator", "id")).toMatchObject({ status: 403 });
  expect(mocks.auth).toHaveBeenCalledWith("moderator", "id", "server:read_logs");
  expect(mocks.host).not.toHaveBeenCalled();
});
it("uses the authorized server identity and returns bounded snapshots", async () => {
  mocks.auth.mockResolvedValue({ server: { _id: "authorized-id" } });
  mocks.host.mockResolvedValue({ available: true, lines: ["Ready"], truncated: false });
  expect(await getServerLogs("owner", "requested-id")).toMatchObject({ snapshot: { lines: ["Ready"] } });
  expect(mocks.host).toHaveBeenCalledWith("authorized-id");
});
it("never forwards raw host exceptions", async () => {
  mocks.auth.mockResolvedValue({ server: { _id: "id" } });
  mocks.host.mockRejectedValue(new Error("private filesystem path"));
  const result = await getServerLogs("owner", "id");
  expect(result).toMatchObject({ status: 503 });
  expect(JSON.stringify(result)).not.toContain("private filesystem");
});
