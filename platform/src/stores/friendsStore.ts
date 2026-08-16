import { create } from "zustand";

export type FriendUser = {
  id: string;
  username: string;
  image?: string | null;
  discordLinked: boolean;
  friendshipId: string;
  presence: {
    status: string;
    platform?: string;
    currentGameId?: string | null;
    currentEditionId?: string | null;
    currentPartyId?: string | null;
    currentPage?: string | null;
    currentGameTitle?: string | null;
    lastHeartbeat?: Date;
    lastSeen?: Date;
    lookingForPlayers?: boolean;
    lookingForPlayersGameId?: string | null;
    /** Resolved server-side; the id alone is a slug and reads as one in the UI. */
    lookingForPlayersGameTitle?: string | null;
  };
  join?: {
    capability: string;
    label: string;
    href: string | null;
    reason?: string;
  };
  sharedGames?: { slug: string; title: string }[];
};

export type FriendRequestUser = {
  id: string;
  username: string;
  image?: string | null;
  discordLinked: boolean;
};

export type FriendRequest = {
  id: string;
  user: FriendRequestUser;
  createdAt: Date;
};

type FriendsState = {
  friends: FriendUser[];
  playingFriends: FriendUser[];
  awayFriends: FriendUser[];
  onlineFriends: FriendUser[];
  offlineFriends: FriendUser[];
  lookingFriends: FriendUser[];
  inPartyFriends: FriendUser[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  blockedUsers: FriendUser[]; // If we decide to fetch blocks
  loading: boolean;
  selectedFriend: FriendUser | null;
  
  fetchFriends: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  sendRequest: (targetUserId: string) => Promise<{ success: boolean; error?: string }>;
  acceptRequest: (requestId: string) => Promise<void>;
  declineRequest: (requestId: string) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;
  unblockUser: (targetUserId: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  blockUser: (targetUserId: string) => Promise<void>;
  setSelectedFriend: (friend: FriendUser | null) => void;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
};

let pollInterval: ReturnType<typeof setInterval> | null = null;
let pollSubscribers = 0;

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  playingFriends: [],
  awayFriends: [],
  onlineFriends: [],
  offlineFriends: [],
  lookingFriends: [],
  inPartyFriends: [],
  incomingRequests: [],
  outgoingRequests: [],
  blockedUsers: [],
  loading: false,
  selectedFriend: null,

  fetchFriends: async () => {
    try {
      const res = await fetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        const friends: FriendUser[] = data.friends || [];

        const playing = friends.filter((f) => f.presence.status === "playing");
        const away = friends.filter((f) => f.presence.status === "away");
        const online = friends.filter((f) =>
          ["online", "browsing", "viewing_game", "installing", "launching"].includes(
            f.presence.status
          )
        );
        const looking = friends.filter((f) => Boolean(f.presence.lookingForPlayers));
        const inParty = friends.filter((f) => Boolean(f.presence.currentPartyId));
        const offline = friends.filter(
          (f) =>
            f.presence.status === "offline" ||
            ![
              "playing",
              "online",
              "browsing",
              "away",
              "viewing_game",
              "installing",
              "launching",
            ].includes(f.presence.status)
        );

        set({
          friends,
          playingFriends: playing,
          awayFriends: away,
          onlineFriends: online,
          offlineFriends: offline,
          lookingFriends: looking,
          inPartyFriends: inParty,
        });
      }
    } catch (err) {
      console.error("Failed to fetch friends", err);
    }
  },

  fetchRequests: async () => {
    try {
      const res = await fetch("/api/friends/requests");
      if (res.ok) {
        const data = await res.json();
        set({
          incomingRequests: data.incoming || [],
          outgoingRequests: data.outgoing || [],
        });
      }
    } catch (err) {
      console.error("Failed to fetch requests", err);
    }
  },

  sendRequest: async (targetUserId: string) => {
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await get().fetchRequests();
      return { success: true };
    } catch (err) {
      console.error("Failed to send request", err);
      return { success: false, error: "Network error" };
    }
  },

  acceptRequest: async (requestId: string) => {
    try {
      const res = await fetch("/api/friends/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      if (res.ok) {
        await Promise.all([get().fetchFriends(), get().fetchRequests()]);
      }
    } catch (err) {
      console.error("Failed to accept request", err);
    }
  },

  declineRequest: async (requestId: string) => {
    try {
      const res = await fetch("/api/friends/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      if (res.ok) {
        await get().fetchRequests();
      }
    } catch (err) {
      console.error("Failed to decline request", err);
    }
  },

  cancelRequest: async (requestId: string) => {
    try {
      const res = await fetch("/api/friends/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      if (res.ok) {
        await get().fetchRequests();
      }
    } catch (err) {
      console.error("Failed to cancel request", err);
    }
  },

  removeFriend: async (friendId: string) => {
    try {
      const res = await fetch("/api/friends/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId }),
      });
      if (res.ok) {
        await get().fetchFriends();
      }
    } catch (err) {
      console.error("Failed to remove friend", err);
    }
  },

  blockUser: async (targetUserId: string) => {
    try {
      const res = await fetch("/api/friends/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      if (res.ok) {
        await Promise.all([get().fetchFriends(), get().fetchRequests()]);
      }
    } catch (err) {
      console.error("Failed to block user", err);
    }
  },

  unblockUser: async (targetUserId: string) => {
    try {
      const res = await fetch("/api/friends/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      if (res.ok) {
        await Promise.all([get().fetchFriends(), get().fetchRequests()]);
      }
    } catch (err) {
      console.error("Failed to unblock user", err);
    }
  },

  setSelectedFriend: (friend) => set({ selectedFriend: friend }),

  startPolling: (intervalMs = 30000) => {
    pollSubscribers += 1;
    // Always refresh when a subscriber mounts.
    get().fetchFriends();
    get().fetchRequests();
    if (pollInterval) return;

    pollInterval = setInterval(() => {
      get().fetchFriends();
      get().fetchRequests();
    }, intervalMs);
  },

  stopPolling: () => {
    pollSubscribers = Math.max(0, pollSubscribers - 1);
    if (pollSubscribers === 0 && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  },
}));
