import { describe, it, expect, vi, beforeEach } from "vitest";
import { maybeNotifyFriendsStartedPlaying } from "./activityNotify";
import * as catalog from "@/lib/catalog";
import * as notify from "@/lib/playTogether/notify";
import User from "@/lib/models/User";

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/catalog", () => ({
  getGame: vi.fn(),
}));

vi.mock("@/lib/playTogether/notify", () => ({
  createFriendPlayingNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/models/User", () => ({
  default: {
    findById: vi.fn(),
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: "friend-1", preferences: {} },
        ]),
      }),
    }),
  },
}));

vi.mock("@/lib/models/Friend", () => ({
  default: {
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { requesterId: "user-1", recipientId: "friend-1" },
        ]),
      }),
    }),
  },
}));

vi.mock("@/lib/models/Party", () => ({
  default: {
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock("@/lib/models/Presence", () => ({
  default: {
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock("@/lib/models/Notification", () => ({
  default: {
    findOne: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    }),
  },
}));

describe("maybeNotifyFriendsStartedPlaying multiplayer filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: "user-1",
          username: "TestUser",
          preferences: {},
        }),
      }),
    } as unknown as ReturnType<typeof User.findById>);
  });

  it("does not notify friends when playing a single-player game", async () => {
    vi.mocked(catalog.getGame).mockResolvedValue({
      slug: "freetrain",
      title: "FreeTrain",
      features: ["Singleplayer"],
      tags: ["Simulation"],
      multiplayer: false,
    } as unknown as Awaited<ReturnType<typeof catalog.getGame>>);

    await maybeNotifyFriendsStartedPlaying({
      userId: "user-1",
      previousStatus: "online",
      nextStatus: "playing",
      nextGameId: "freetrain",
    });

    expect(notify.createFriendPlayingNotification).not.toHaveBeenCalled();
  });

  it("notifies friends when playing a multiplayer game", async () => {
    vi.mocked(catalog.getGame).mockResolvedValue({
      slug: "tmnt-rescue-palooza",
      title: "Teenage Mutant Ninja Turtles: Rescue-Palooza!",
      features: ["Co-op", "Multiplayer"],
      tags: ["Beat 'em up"],
      multiplayer: true,
    } as unknown as Awaited<ReturnType<typeof catalog.getGame>>);

    await maybeNotifyFriendsStartedPlaying({
      userId: "user-1",
      previousStatus: "online",
      nextStatus: "playing",
      nextGameId: "tmnt-rescue-palooza",
    });

    expect(notify.createFriendPlayingNotification).toHaveBeenCalledWith({
      recipientId: "friend-1",
      fromUserId: "user-1",
      fromUsername: "TestUser",
      gameSlug: "tmnt-rescue-palooza",
      gameTitle: "Teenage Mutant Ninja Turtles: Rescue-Palooza!",
    });
  });
});
