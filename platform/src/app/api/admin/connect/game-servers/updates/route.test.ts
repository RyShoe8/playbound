import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), host: vi.fn() }));
vi.mock("@/lib/requireAdmin", () => ({ requireAdminSession: mock.write, requireAdminViewSession: mock.read }));
vi.mock("@/lib/gameHost/client", () => ({ installationUpdatesOnHost: mock.host }));
import { GET, POST } from "./route";
import { INSTALLATION_UPDATE_KEYS } from "@/lib/gameHost/installationKeys";

beforeEach(() => {
  vi.resetAllMocks();
  mock.read.mockResolvedValue({ session: { user: { role: "admin" } }, error: null });
  mock.write.mockResolvedValue({ session: { user: { id: "admin-id", role: "admin" } }, error: null });
  mock.host.mockResolvedValue({ targets: [], jobs: [] });
});
const request = (body: unknown) => new Request("http://test/api/admin/connect/game-servers/updates", { method: "POST", body: JSON.stringify(body) });

it("denies signed-out reads and non-admin writes before contacting the agent", async () => {
  mock.read.mockResolvedValue({ error: Response.json({ error: "Denied" }, { status: 403 }) });
  mock.write.mockResolvedValue({ error: Response.json({ error: "Denied" }, { status: 403 }) });
  expect((await GET()).status).toBe(403);
  expect((await POST(request({ action: "update", key: "unturned" }))).status).toBe(403);
  expect(mock.host).not.toHaveBeenCalled();
});
it("reads uncached update status", async () => {
  const response = await GET();
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ targets: [], jobs: [] });
});
it("takes the actor from the authorized session", async () => {
  expect((await POST(request({ action: "update", key: "unturned" }))).status).toBe(202);
  expect(mock.host).toHaveBeenCalledWith({ action: "update", key: "unturned", actor: "admin-id" });
});
it.each(INSTALLATION_UPDATE_KEYS)("accepts the fixed update action for %s", async (key) => {
  expect((await POST(request({ action: "update", key }))).status).toBe(202);
  expect(mock.host).toHaveBeenCalledWith({ action: "update", key, actor: "admin-id" });
});
it.each([
  { action: "update", key: "../other" },
  { action: "cancel", id: "../manifest" },
  { action: "update", key: "unturned", actor: "someone-else" },
  { action: "shell", key: "unturned", command: "anything" },
])("rejects untrusted paths, actions and actor overrides: %j", async (input) => {
  expect((await POST(request(input))).status).toBe(400);
  expect(mock.host).not.toHaveBeenCalled();
});
it("reports agent unavailability without turning it into an empty queue", async () => {
  mock.host.mockRejectedValue(new Error("unreachable"));
  expect((await GET()).status).toBe(503);
});
