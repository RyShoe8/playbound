import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  game: null as null | Record<string, unknown>,
  updates: [] as Array<{ filter: Record<string, unknown>; update: Record<string, unknown> }>,
  send: vi.fn(),
}));

vi.mock("@/lib/site", () => ({ IS_PRODUCTION: true }));
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/discordProvision", () => ({ requestNewGameDiscordAnnounce: state.send }));
vi.mock("@/lib/models/CatalogGame", () => ({
  default: {
    updateOne: vi.fn(async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      state.updates.push({ filter, update });
      const set = update.$set as Record<string, unknown>;
      if (set?.discordAnnouncement && state.game) state.game.discordAnnouncement = set.discordAnnouncement;
      if (set?.["discordAnnouncement.sentAt"] && state.game) {
        (state.game.discordAnnouncement as Record<string, unknown>).sentAt = set["discordAnnouncement.sentAt"];
      }
    }),
    findOne: vi.fn(() => ({
      select: () => ({
        lean: async () => {
          const announcement = state.game?.discordAnnouncement as Record<string, unknown> | undefined;
          return announcement?.publishedAt && !announcement?.sentAt ? state.game : null;
        },
      }),
    })),
  },
}));

import { deliverGameAnnouncement, queueGameAnnouncement } from "./discordGameAnnouncement";

describe("new game Discord announcement", () => {
  beforeEach(() => {
    state.game = { slug: "test-game", title: "Test Game" };
    state.updates = [];
    state.send.mockReset();
  });

  it("queues only the named published game and keeps failed delivery pending", async () => {
    const publishedAt = new Date("2026-10-22T12:00:00Z");
    await queueGameAnnouncement("test-game", publishedAt);
    expect(state.updates[0].filter).toEqual({ slug: "test-game", status: "published" });
    expect(state.updates[0].update).toEqual({
      $set: { discordAnnouncement: { publishedAt, sentAt: null, lastAttemptAt: null } },
    });
    state.send.mockResolvedValue(false);
    expect(await deliverGameAnnouncement("test-game")).toBe(false);
    expect((state.game?.discordAnnouncement as Record<string, unknown>).sentAt).toBeNull();
  });

  it("marks a successful send and cannot send it again", async () => {
    await queueGameAnnouncement("test-game", new Date("2026-10-22T12:00:00Z"));
    state.send.mockResolvedValue(true);
    expect(await deliverGameAnnouncement("test-game")).toBe(true);
    expect(state.send).toHaveBeenCalledWith(expect.objectContaining({
      slug: "test-game",
      publicationAt: new Date("2026-10-22T12:00:00Z"),
    }));
    expect(await deliverGameAnnouncement("test-game")).toBe(false);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect((state.game?.discordAnnouncement as Record<string, unknown>).sentAt).toBeInstanceOf(Date);
  });
});
