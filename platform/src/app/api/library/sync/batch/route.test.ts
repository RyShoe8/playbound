import { describe, expect, it, vi, beforeEach } from "vitest";

const gamesFor = vi.fn();
const resolveGameForSync = vi.fn();
const getMod = vi.fn();
const userFromLauncherBearer = vi.fn();
const findOneAndUpdate = vi.fn();
const updateMany = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/catalog", () => ({
  gamesFor: (...args: unknown[]) => gamesFor(...args),
  resolveGameForSync: (...args: unknown[]) => resolveGameForSync(...args),
}));

vi.mock("@/lib/mods", () => ({
  getMod: (...args: unknown[]) => getMod(...args),
}));

vi.mock("@/lib/library", () => ({
  userFromLauncherBearer: (...args: unknown[]) => userFromLauncherBearer(...args),
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn(async () => undefined),
}));

vi.mock("@/lib/models/LibraryEntry", () => ({
  default: {
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
    updateMany: (...args: unknown[]) => updateMany(...args),
  },
}));

vi.mock("@/lib/models/LibraryModEntry", () => ({
  default: {
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
    deleteMany: (...args: unknown[]) => deleteMany(...args),
  },
}));

vi.mock("@/lib/telemetry/server/saveEvent", () => ({
  saveEvent: vi.fn(),
}));

vi.mock("@/lib/libraryCascade", () => ({
  revalidateLibraryPages: vi.fn(),
}));

describe("POST /api/library/sync/batch catalog resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFromLauncherBearer.mockResolvedValue({ _id: "user1" });
    gamesFor.mockResolvedValue([
      { slug: "openra", title: "OpenRA" },
      { slug: "openttd", title: "OpenTTD" },
    ]);
    resolveGameForSync.mockResolvedValue(undefined);
    getMod.mockResolvedValue(null);
    findOneAndUpdate.mockResolvedValue(null);
    updateMany.mockResolvedValue({ modifiedCount: 0 });
    deleteMany.mockResolvedValue({ deletedCount: 0 });
  });

  it("calls gamesFor once for repeated game slugs", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/library/sync/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test",
      },
      body: JSON.stringify({
        installs: [
          { slug: "openra", editionSlug: "base" },
          { slug: "openra", editionSlug: "ra" },
          { slug: "openttd" },
        ],
        modInstalls: [],
        prune: false,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(gamesFor).toHaveBeenCalledTimes(1);
    expect(gamesFor).toHaveBeenCalledWith(["openra", "openttd"], { includeUnpublished: true });
    expect(resolveGameForSync).not.toHaveBeenCalled();
  });
});
