import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ aggregate: vi.fn(), games: vi.fn(), editions: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/models/TelemetryEvent", () => ({ default: { aggregate: mocks.aggregate } }));
vi.mock("@/lib/catalog", () => ({ listGames: mocks.games }));
vi.mock("@/lib/editions", () => ({ listEditionsForGames: mocks.editions }));
import { weeklyPopular } from "./weeklyPopular";
import { GAMEPLAY_ID, PLAY_END_MATCH } from "./admin/gameplayEvents";
beforeEach(() => {
  mocks.games.mockResolvedValue([{slug:"game",title:"Game"}]);
  mocks.editions.mockResolvedValue(new Map([["game",[{slug:"base",name:"Base"},{slug:"mod",name:"Multiplayer"}]]]));
});
it("keeps two editions of one game independently ranked and retains unattributed legacy play", async () => {
  mocks.aggregate.mockResolvedValue([
    {_id:{gameSlug:"game",editionSlug:"mod"},totalMs:300},
    {_id:{gameSlug:"game",editionSlug:"base"},totalMs:200},
    {_id:{gameSlug:"game",editionSlug:null},totalMs:100},
    {_id:{gameSlug:"game",editionSlug:"retired"},totalMs:50},
    {_id:{gameSlug:"hidden",editionSlug:null},totalMs:40},
  ]);
  expect((await weeklyPopular()).map(row => row.edition?.slug || null)).toEqual(["mod","base",null]);
  const pipeline = mocks.aggregate.mock.calls.at(-1)![0];
  expect(pipeline[1].$group._id).toEqual(GAMEPLAY_ID);
  expect(pipeline[0].$match.$or).toEqual(PLAY_END_MATCH.$or);
  expect(pipeline[0].$match.isBot).toEqual({$ne:true});
  expect(pipeline[0].$match.createdAt.$gte).toBeInstanceOf(Date);
});
