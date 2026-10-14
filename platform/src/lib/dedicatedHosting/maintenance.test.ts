import { beforeEach, describe, expect, it, vi } from "vitest";
import { maintenanceDue, maintenanceSettings } from "./maintenancePolicy";

const mocks = vi.hoisted(() => ({ find: vi.fn(), claim: vi.fn(), current: vi.fn(), update: vi.fn(), profile: vi.fn(), agent: vi.fn(), query: vi.fn(), authorize: vi.fn(), activity: vi.fn(), backup: vi.fn(), restart: vi.fn() }));
vi.mock("@/lib/models/CommunityServer", () => ({ default: { findOne: mocks.find, findOneAndUpdate: mocks.claim, findById: () => ({ lean: mocks.current }), updateOne: mocks.update } }));
vi.mock("@/lib/models/CommunityServerProfile", () => ({ default: { findOne: () => ({ lean: mocks.profile }) } }));
vi.mock("@/lib/gameHost/client", () => ({ listManagedHostRooms: mocks.agent }));
vi.mock("@/lib/communityHosting/playerQuery", () => ({ managedQueryKind: () => "agent-local", queryManagedOccupancy: mocks.query }));
vi.mock("./access", () => ({ authorizeServer: mocks.authorize, recordActivity: mocks.activity }));
vi.mock("./backups", () => ({ createBackup: mocks.backup }));
vi.mock("./servers", () => ({ restartServer: mocks.restart }));
import { runMaintenance, saveMaintenance } from "./maintenance";

const now = new Date("2026-10-14T06:15:00Z");
const server = { _id: "server", ownerId: "owner", profileKey: "xonotic:base", gameSlug: "xonotic", runtimeId: "room", desiredState: "running", maintenance: { enabled: true, hourUTC: 6 } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue(server);
  mocks.profile.mockResolvedValue({});
  mocks.agent.mockResolvedValue({ ok: true, rooms: [{ communityServerId: "server", roomId: "room", host: "localhost", port: 1 }] });
  mocks.query.mockResolvedValue({ players: 0 });
  mocks.claim.mockResolvedValue(server);
  mocks.current.mockResolvedValue(server);
  mocks.backup.mockResolvedValue({ ok: true });
  mocks.restart.mockResolvedValue({ ok: true });
  mocks.authorize.mockResolvedValue({ server });
});
describe("daily maintenance", () => {
  it("only runs within the selected UTC hour, once a day", () => {
    expect(maintenanceDue(server.maintenance, now)).toBe(true);
    expect(maintenanceDue({ ...server.maintenance, lastDay: "2026-10-14" }, now)).toBe(false);
    expect(maintenanceDue(server.maintenance, new Date("2026-10-14T07:00:00Z"))).toBe(false);
    expect(maintenanceDue({ enabled: false, hourUTC: 6 }, now)).toBe(false);
  });
  it.each([null, {}, { enabled: "false", hourUTC: 6 }, { enabled: true, hourUTC: -1 }, { enabled: true, hourUTC: 24 }, { enabled: true, hourUTC: 6.5 }])("rejects malformed settings %j", input => {
    expect(maintenanceSettings(input)).toBeNull();
  });
  it.each([null, { players: 1 }])("does not claim or restart with occupied/unknown query %j", async occupancy => {
    mocks.query.mockResolvedValue(occupancy);
    await runMaintenance("server", now);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.restart).not.toHaveBeenCalled();
  });
  it("two workers dispatch only once after the atomic claim", async () => {
    mocks.claim.mockResolvedValueOnce(server).mockResolvedValue(null);
    await Promise.all([runMaintenance("server", now), runMaintenance("server", now)]);
    expect(mocks.backup).toHaveBeenCalledTimes(1);
    expect(mocks.restart).toHaveBeenCalledTimes(1);
    expect(mocks.claim.mock.calls[0][0]).toMatchObject({ ownerType: "user", runtimeId: "room", "maintenance.lastDay": { $ne: "2026-10-14" } });
  });
  it("does not restart if a player joins during backup", async () => {
    mocks.query.mockResolvedValueOnce({ players: 0 }).mockResolvedValueOnce({ players: 1 });
    await runMaintenance("server", now);
    expect(mocks.backup).toHaveBeenCalledTimes(1);
    expect(mocks.restart).not.toHaveBeenCalled();
  });
  it("does not restart if backup fails or maintenance is disabled during preparation", async () => {
    mocks.backup.mockResolvedValueOnce({ error: "Backup unavailable" });
    await runMaintenance("server", now);
    expect(mocks.restart).not.toHaveBeenCalled();
    mocks.current.mockResolvedValueOnce({ ...server, maintenance: { enabled: false } });
    await runMaintenance("server", now);
    expect(mocks.restart).not.toHaveBeenCalled();
  });
  it("denies configuration from unauthorized roles without writing", async () => {
    mocks.authorize.mockResolvedValue({ error: "Forbidden", status: 403 });
    expect(await saveMaintenance("moderator", "server", { enabled: true, hourUTC: 6 })).toMatchObject({ status: 403 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
