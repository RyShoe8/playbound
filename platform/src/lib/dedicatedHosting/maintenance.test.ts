import { beforeEach, describe, expect, it, vi } from "vitest";
import { maintenanceDue, maintenanceSettings, nextMaintenanceWindow } from "./maintenancePolicy";

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
describe("scheduled maintenance", () => {
  it("preserves legacy daily schedules and respects selected UTC weekdays", async () => {
    expect(maintenanceDue(server.maintenance, now)).toBe(true);
    expect(maintenanceDue({ ...server.maintenance, daysUTC: [1, 3, 5] }, now)).toBe(true);
    mocks.find.mockResolvedValue({ ...server, maintenance: { ...server.maintenance, daysUTC: [1] } });
    await runMaintenance("server", now);
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(maintenanceDue({ ...server.maintenance, daysUTC: [] }, now)).toBe(false);
  });
  it.each([[], [0, 0], [7], [-1], [1.5], [true], null, "Monday"])("rejects invalid days %j", daysUTC => {
    expect(maintenanceSettings({ enabled: true, hourUTC: 6, daysUTC })).toBeNull();
  });
  it("does not reset selected weekdays when an older launcher omits them", async () => {
    await saveMaintenance("owner", "server", { enabled: true, hourUTC: 7 });
    expect(mocks.update.mock.calls[0][1].$set).not.toHaveProperty("maintenance.daysUTC");
    expect(maintenanceSettings({ enabled: true, hourUTC: 6, daysUTC: [5, 1] })?.daysUTC).toEqual([1, 5]);
  });
  it("finds the next selected window, including current and already-claimed days", () => {
    expect(nextMaintenanceWindow({ ...server.maintenance, daysUTC: [3] }, now)).toEqual({ start: "2026-10-14T06:00:00.000Z", end: "2026-10-14T07:00:00.000Z" });
    expect(nextMaintenanceWindow({ ...server.maintenance, daysUTC: [3], lastDay: "2026-10-14" }, now)?.start).toBe("2026-10-21T06:00:00.000Z");
    expect(nextMaintenanceWindow({ ...server.maintenance, daysUTC: [1] }, new Date("2026-10-16T07:00:00Z"))?.start).toBe("2026-10-19T06:00:00.000Z");
    expect(nextMaintenanceWindow({ enabled: false, hourUTC: 6 }, now)).toBeNull();
  });
  it.each(["2026-03-07T07:00:00Z", "2026-10-31T07:00:00Z"])("UTC schedules retain their hour across DST near %s", value => {
    const window = nextMaintenanceWindow({ enabled: true, hourUTC: 6, daysUTC: [0] }, new Date(value));
    expect(new Date(window!.start).getUTCHours()).toBe(6);
    expect(new Date(window!.end).getTime() - new Date(window!.start).getTime()).toBe(3600_000);
  });
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
    expect(mocks.update.mock.calls[0][1].$set["maintenance.lastCheckResult"]).toContain(occupancy ? "players are online" : "player count is unknown");
    expect(mocks.activity).not.toHaveBeenCalled();
  });
  it("two workers dispatch only once after the atomic claim", async () => {
    mocks.claim.mockResolvedValueOnce(server).mockResolvedValue(null);
    await Promise.all([runMaintenance("server", now), runMaintenance("server", now)]);
    expect(mocks.backup).toHaveBeenCalledTimes(1);
    expect(mocks.restart).toHaveBeenCalledTimes(1);
    expect(mocks.claim.mock.calls[0][0]).toMatchObject({ ownerType: "user", runtimeId: "room", "maintenance.lastDay": { $ne: "2026-10-14" } });
    expect(mocks.claim.mock.calls[0][0].$and[0].$or).toContainEqual({ "maintenance.daysUTC": 3 });
  });
  it("does not restart if a player joins during backup", async () => {
    mocks.query.mockResolvedValueOnce({ players: 0 }).mockResolvedValueOnce({ players: 1 });
    await runMaintenance("server", now);
    expect(mocks.backup).toHaveBeenCalledTimes(1);
    expect(mocks.restart).not.toHaveBeenCalled();
  });
  it("rechecks a changed weekday or hour after backup", async () => {
    mocks.current.mockResolvedValueOnce({ ...server, maintenance: { ...server.maintenance, daysUTC: [1] } });
    await runMaintenance("server", now);
    expect(mocks.restart).not.toHaveBeenCalled();
    mocks.current.mockResolvedValueOnce({ ...server, maintenance: { ...server.maintenance, hourUTC: 7 } });
    await runMaintenance("server", now);
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
  it.each(["stopped", "running"])("configuration-only tasks back up a %s server without querying or restarting it", async desiredState => {
    const backupServer = { ...server, desiredState, maintenance: { ...server.maintenance, action: "configuration-backup" } };
    mocks.find.mockResolvedValue(backupServer);
    mocks.claim.mockResolvedValueOnce(backupServer).mockResolvedValue(null);
    await Promise.all([runMaintenance("server", now), runMaintenance("server", now)]);
    expect(mocks.backup).toHaveBeenCalledTimes(1);
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.restart).not.toHaveBeenCalled();
    expect(mocks.claim.mock.calls[0][0]).toMatchObject({ "maintenance.action": "configuration-backup", "maintenance.lastDay": { $ne: "2026-10-14" } });
    expect(mocks.activity).toHaveBeenCalledWith("server", { kind: "system" }, "maintenance_ran", expect.stringContaining("Server state unchanged"));
  });
  it("requires backup permission for backup-only schedules and rejects arbitrary commands", async () => {
    expect(maintenanceSettings({ enabled: true, hourUTC: 6, action: "console" })).toBeNull();
    await saveMaintenance("owner", "server", { enabled: true, hourUTC: 6, action: "configuration-backup" });
    expect(mocks.authorize).toHaveBeenLastCalledWith("owner", "server", "server:create_backup");
    expect(mocks.update.mock.calls[0][1].$set["maintenance.action"]).toBe("configuration-backup");
  });
  it("retains the selected task when an older client omits it", async () => {
    mocks.authorize.mockResolvedValue({ server: { ...server, maintenance: { ...server.maintenance, action: "configuration-backup" } } });
    await saveMaintenance("owner", "server", { enabled: true, hourUTC: 7 });
    expect(mocks.authorize).toHaveBeenLastCalledWith("owner", "server", "server:create_backup");
    expect(mocks.update.mock.calls[0][1].$set).not.toHaveProperty("maintenance.action");
  });
  it("does not save a backup schedule without backup permission", async () => {
    mocks.authorize.mockResolvedValueOnce({ server }).mockResolvedValueOnce({ error: "Forbidden", status: 403 });
    expect(await saveMaintenance("restricted", "server", { enabled: true, hourUTC: 6, action: "configuration-backup" })).toMatchObject({ status: 403 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not restart when the selected task changes during backup", async () => {
    mocks.current.mockResolvedValue({ ...server, maintenance: { ...server.maintenance, action: "configuration-backup" } });
    await runMaintenance("server", now);
    expect(mocks.restart).not.toHaveBeenCalled();
  });
});
