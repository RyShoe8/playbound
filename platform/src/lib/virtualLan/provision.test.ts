import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateOne: vi.fn(),
  createPartyNetwork: vi.fn(),
  deletePartyNetwork: vi.fn(),
}));

vi.mock("@/lib/models/Party", () => ({ default: { updateOne: mocks.updateOne } }));
vi.mock("./client", () => ({
  isVirtualLanConfigured: () => true,
  createPartyNetwork: mocks.createPartyNetwork,
  deletePartyNetwork: mocks.deletePartyNetwork,
}));
vi.mock("@/lib/playTogether/partyTelemetry", () => ({
  partyEventProps: () => ({}), trackPartyEvent: vi.fn(),
  trackPartyFailure: vi.fn(), trackPartyOk: vi.fn(),
}));

import { provisionPartyLan } from "./provision";

const network = { groupId: "group", policyId: "policy", setupKeyId: "key-id", setupKey: "secret" };

function party() {
  return {
    _id: "party-1", gameSlug: "hedgewars", hostMode: "self",
    maxSize: 4, lan: { status: "none" }, save: vi.fn(),
  } as unknown as Parameters<typeof provisionPartyLan>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createPartyNetwork.mockResolvedValue(network);
});

describe("party network provisioning", () => {
  it("creates the network only after claiming the current self-host attempt", async () => {
    mocks.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    expect(await provisionPartyLan(party())).toBe(false);
    expect(mocks.createPartyNetwork).not.toHaveBeenCalled();
  });

  it("deletes a network if the party switched modes while it was being created", async () => {
    mocks.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 0 });
    expect(await provisionPartyLan(party())).toBe(false);
    expect(mocks.deletePartyNetwork).toHaveBeenCalledWith(network);
  });

  it("keeps a network only when its ready state commits to the party", async () => {
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    const current = party();
    expect(await provisionPartyLan(current)).toBe(true);
    expect(current.lan?.status).toBe("ready");
    expect(mocks.deletePartyNetwork).not.toHaveBeenCalled();
  });
});
