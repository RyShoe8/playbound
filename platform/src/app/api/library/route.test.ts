import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
const getGame = vi.fn();
const getEditionBySlug = vi.fn();
const findOneAndUpdate = vi.fn();
const updateMany = vi.fn();
const revalidateLibraryPages = vi.fn();

vi.mock("next-auth/next", () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/lib/catalog", () => ({
  getGame: (...args: unknown[]) => getGame(...args),
  gamesFor: vi.fn(async () => []),
}));
vi.mock("@/lib/editions", () => ({
  getEditionBySlug: (...args: unknown[]) => getEditionBySlug(...args),
}));
vi.mock("@/lib/models/LibraryEntry", () => ({
  default: {
    findOneAndUpdate: (...args: unknown[]) => ({ lean: async () => findOneAndUpdate(...args) }),
    updateMany: (...args: unknown[]) => updateMany(...args),
  },
}));
vi.mock("@/lib/libraryCascade", () => ({
  revalidateLibraryPages: (...args: unknown[]) => revalidateLibraryPages(...args),
  removeLibraryModsForGame: vi.fn(),
}));
vi.mock("@/lib/telemetry/server/trackServerEvent", () => ({ trackServerEvent: vi.fn(async () => undefined) }));

import { DELETE, POST } from "./route";

const request = (url: string, init?: RequestInit) =>
  new Request(url, { ...init, headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0", ...(init?.headers ?? {}) } });

describe("library editions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: "user1" } });
    getGame.mockResolvedValue({ slug: "alien-swarm", title: "Alien Swarm", browserPlayable: false });
    getEditionBySlug.mockResolvedValue({ slug: "alien-swarm-reactive-drop" });
    findOneAndUpdate.mockResolvedValue({
      gameSlug: "alien-swarm",
      installed: false,
      saved: true,
      addedAt: new Date("2026-10-01"),
      savedEditions: ["alien-swarm-reactive-drop"],
    });
    updateMany.mockResolvedValue({ modifiedCount: 1 });
  });

  it("adds an edition to savedEditions without claiming it is installed", async () => {
    const res = await POST(
      request("http://localhost/api/library", {
        method: "POST",
        body: JSON.stringify({ slug: "alien-swarm", editionSlug: "alien-swarm-reactive-drop", intent: "save" }),
      })
    );
    expect(res.status).toBe(201);
    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ userId: "user1", gameSlug: "alien-swarm" });
    expect(update.$addToSet).toEqual({ savedEditions: "alien-swarm-reactive-drop" });
    expect(update.$setOnInsert).toMatchObject({ saved: true, installed: false });
    expect(update.$set).not.toHaveProperty("installed");
    expect((await res.json()).savedEditions).toEqual(["alien-swarm-reactive-drop"]);
  });

  it("refuses an edition the game does not have, and bad slugs", async () => {
    getEditionBySlug.mockResolvedValue(undefined);
    const unknown = await POST(
      request("http://localhost/api/library", {
        method: "POST",
        body: JSON.stringify({ slug: "alien-swarm", editionSlug: "nope" }),
      })
    );
    expect(unknown.status).toBe(404);
    const malformed = await POST(
      request("http://localhost/api/library", {
        method: "POST",
        body: JSON.stringify({ slug: "alien-swarm", editionSlug: "../x" }),
      })
    );
    expect(malformed.status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("removes only the saved edition and keeps the game", async () => {
    const res = await DELETE(
      request("http://localhost/api/library?slug=alien-swarm&editionSlug=alien-swarm-reactive-drop", { method: "DELETE" })
    );
    expect(res.status).toBe(200);
    expect(updateMany.mock.calls[0][1].$pull).toEqual({ savedEditions: "alien-swarm-reactive-drop" });
    expect(updateMany.mock.calls[0][0]).toEqual({ userId: "user1", gameSlug: "alien-swarm" });
  });

  it("requires a signed-in user", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(
      request("http://localhost/api/library", {
        method: "POST",
        body: JSON.stringify({ slug: "alien-swarm", editionSlug: "alien-swarm-reactive-drop" }),
      })
    );
    expect(res.status).toBe(401);
  });
});
