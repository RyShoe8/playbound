import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: vi.fn(), find: vi.fn(), update: vi.fn(), adapter: vi.fn(), restart: vi.fn(), status: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/models/Party", () => ({ default: { findById: mock.find, findOneAndUpdate: mock.update } }));
vi.mock("@/lib/friendsAuth", () => ({ getFriendsUserId: mock.user }));
vi.mock("@/lib/serverControl/partyServer", () => ({ createPartyServerAdapter: mock.adapter }));
import { POST } from "./route";
const id = "0123456789abcdef01234567";
const context = { params: Promise.resolve({ id }) };
const request = (body: unknown = { action: "restart" }) => new Request("http://test/api/parties/server-action", { method: "POST", body: JSON.stringify(body) });
const party = () => ({ _id: id, leaderId: "leader", members: [{ userId: "leader" }, { userId: "member" }], gameSlug: "openarena", editionSlug: null, hostMode: "self", status: "launching" });
beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue("leader"); mock.find.mockResolvedValue(party()); mock.update.mockResolvedValue({});
  mock.status.mockResolvedValue({ status: "running" });
  mock.adapter.mockImplementation((_party, options) => ({ kind: "local", capabilities: { restart: true }, getStatus: mock.status,
    restart: async () => { mock.restart(); await options.save(); } }));
});
it("denies signed-out users and non-leaders before any mutation", async () => {
  mock.user.mockResolvedValue(null);
  expect((await POST(request(), context)).status).toBe(401);
  mock.user.mockResolvedValue("member");
  expect((await POST(request(), context)).status).toBe(403);
  expect(mock.update).not.toHaveBeenCalled();
});
it("never controls public/VPS servers through the local action route", async () => {
  mock.adapter.mockReturnValue({ kind: "vps-agent", capabilities: { restart: true } });
  expect((await POST(request(), context)).status).toBe(409);
  mock.adapter.mockReturnValue(null);
  expect((await POST(request(), context)).status).toBe(409);
  expect(mock.restart).not.toHaveBeenCalled();
});
it.each([{ action: "stop" }, { action: "restart", command: "anything" }, { action: "shell" }, null])("rejects arbitrary operations: %j", async (input) => {
  expect((await POST(request(input), context)).status).toBe(400);
  expect(mock.update).not.toHaveBeenCalled();
});
it("queues an atomic revision increment without overwriting settings", async () => {
  const response = await POST(request(), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ outcome: "queued" });
  expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ leaderId: "leader", hostMode: "self", gameSlug: "openarena", selfHostReady: true, $expr: expect.any(Object) }), {
    $inc: { "selfHostControl.desiredRevision": 1 }, $set: { "selfHostControl.lastError": null },
  });
});
it("refuses ended/pending parties and fails closed if ownership changes during save", async () => {
  mock.find.mockResolvedValue({ ...party(), status: "ended" });
  expect((await POST(request(), context)).status).toBe(409);
  mock.find.mockResolvedValue(party()); mock.status.mockResolvedValue({ status: "pending" });
  expect((await POST(request(), context)).status).toBe(409);
  mock.status.mockResolvedValue({ status: "running" }); mock.update.mockResolvedValue(null);
  expect((await POST(request(), context)).status).toBe(503);
});
