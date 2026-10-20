import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const state = vi.hoisted(() => ({ user: null as null | { _id: string; username: string }, room: null as null | { sessionId: string }, query: {} as Record<string, unknown>, update: vi.fn() }));
vi.mock("@/lib/library", () => ({ userFromLauncherBearer: async () => state.user }));
vi.mock("@/lib/db", () => ({ default: async () => {} }));
vi.mock("@/lib/discussion/rateLimit", () => ({ checkRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/models/GameLobbyMember", () => ({ default: { updateOne: (...args: unknown[]) => state.update(...args), deleteOne: vi.fn() } }));
vi.mock("@/lib/models/MultiplayerSession", () => ({ default: { findOne: (query: Record<string, unknown>) => { state.query = query; return { select: () => ({ lean: async () => state.room }) }; } } }));
import { POST, GET } from "./route";
beforeEach(() => { state.user = null; state.room = null; state.update.mockClear(); });
const request = (body: unknown) => new Request("https://example.test/api/game-lobby/hyperdisc-arena", { method: "POST", body: JSON.stringify(body) });
it("requires account authentication for reading and advertising", async () => {
  expect((await GET(request({}))).status).toBe(401);
  expect((await POST(request({}))).status).toBe(401);
  expect(state.update).not.toHaveBeenCalled();
});
it("rejects an unowned or expired room", async () => {
  state.user = { _id: "u", username: "Real name" };
  expect((await POST(request({ sessionId: "s", hostToken: "wrong" }))).status).toBe(409);
  expect(state.query.hostTokenHash).toBe(createHash("sha256").update("wrong").digest("hex"));
  expect(state.query.gameSlug).toBe("hyperdisc-arena");
  expect(state.query.status).toBe("waiting");
  expect(state.query.lastHeartbeat).toBeDefined();
  expect(state.query.$expr).toEqual({ $lt: ["$playerCount", "$maxPlayers"] });
  expect(state.update).not.toHaveBeenCalled();
});
it("uses the authenticated name and a short expiry", async () => {
  state.user = { _id: "u", username: "Real name" };
  state.room = { sessionId: "s" };
  expect((await POST(request({ sessionId: "s", hostToken: "valid", name: "Impersonated" }))).status).toBe(200);
  const patch = state.update.mock.calls[0][1].$set;
  expect(patch.name).toBe("Real name");
  expect(patch.sessionId).toBe("s");
  expect(patch.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(45000);
});
