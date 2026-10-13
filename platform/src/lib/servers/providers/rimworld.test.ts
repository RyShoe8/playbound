import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/gameHost/client",()=>({fetchRimworldBrowser:vi.fn()}));
import { normalizeRimworldServers } from "./rimworld";
describe("RimWorld Together discovery",()=>{
  it("labels the edition and preserves unknown population",()=>{
    const rows=normalizeRimworldServers([{name:"Colony",host:"example.com",port:25555,players:3,maxPlayers:16},{host:"example.net",port:25555,players:2147483647,maxPlayers:2147483647}]);
    expect(rows[0]).toMatchObject({gameSlug:"rimworld",editionSlug:"rimworld-together",players:3,maxPlayers:16});
    expect(rows[1]).toMatchObject({players:null,maxPlayers:null});
  });
  it("excludes private and invalid entries",()=>{
    expect(normalizeRimworldServers([{host:"private.test",port:25555,isPrivate:true},{host:"bad/path",port:80}])).toEqual([]);
  });
});
