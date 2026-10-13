import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), find: vi.fn(), adapter: vi.fn(), players: vi.fn(), command: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/models/Party", () => ({ default: {findById:mocks.find} }));
vi.mock("@/lib/friendsAuth", () => ({ getFriendsUserId:mocks.user }));
vi.mock("@/lib/serverControl/partyServer", () => ({ createPartyServerAdapter:mocks.adapter }));
import { GET, POST } from "./route";
const ctx = {params:Promise.resolve({id:"0123456789abcdef01234567"})};
const request = (command="list") => new Request("http://localhost/api/parties/test/server-runtime", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({command})});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue("leader");
  mocks.find.mockResolvedValue({gameSlug:"rimworld",editionSlug:"rimworld-together",leaderId:"leader",members:[{userId:"leader"},{userId:"member"}],hosted:{roomId:"private-room"}});
  mocks.adapter.mockReturnValue({capabilities:{console:true},getPlayers:mocks.players,sendCommand:mocks.command});
  mocks.players.mockResolvedValue([{id:"SmFja3k=",name:"Jacky"}]);
  mocks.command.mockResolvedValue("Players: 1");
});
describe("RimWorld party runtime access", () => {
  it("requires login and membership before querying the server", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await GET(request(),ctx)).status).toBe(401);
    mocks.user.mockResolvedValue("outsider");
    expect((await GET(request(),ctx)).status).toBe(403);
    expect(mocks.players).not.toHaveBeenCalled();
  });
  it("lets members read players but only the leader issue commands", async () => {
    mocks.user.mockResolvedValue("member");
    expect((await GET(request(),ctx)).status).toBe(200);
    expect((await POST(request(),ctx)).status).toBe(403);
    expect(mocks.command).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue("leader");
    expect((await POST(request(),ctx)).status).toBe(200);
    expect(mocks.command).toHaveBeenCalledWith("list");
  });
  it("does not grant controls when the party adapter refuses a public server", async () => {
    mocks.adapter.mockReturnValue(null);
    expect((await POST(request(),ctx)).status).toBe(403);
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("blocks destructive resets and multiline command injection", async () => {
    expect((await POST(request("resetserver"),ctx)).status).toBe(400);
    expect((await POST(request("list\nresetserver"),ctx)).status).toBe(400);
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("reports query failure as unavailable instead of an empty list", async () => {
    mocks.players.mockRejectedValue(new Error("stale snapshot"));
    expect((await GET(request(),ctx)).status).toBe(503);
  });
});
