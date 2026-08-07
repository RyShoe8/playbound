import { create } from "zustand";

export type FriendUser = {
  id: string;
  username: string;
  email?: string;
  image?: string | null;
  discordLinked: boolean;
  friendshipId: string;
  presence: {
    status: "online" | "offline" | "playing" | "browsing" | "away";
    platform?: string;
    currentGameId?: string | null;
    currentEditionId?: string | null;
    currentPage?: string | null;
    lastHeartbeat?: Date;
    lastSeen?: Date;
  };
};

export type FriendRequestUser = {
  id: string;
  username: string;
  email?: string;
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
  onlineFriends: FriendUser[];
  offlineFriends: FriendUser[];
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
  removeFriend: (friendId: string) => Promise<void>;
  blockUser: (targetUserId: string) => Promise<void>;
  setSelectedFriend: (friend: FriendUser | null) => void;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
};

let pollInterval: ReturnType<typeof setInterval> | null = null;

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  playingFriends: [],
  onlineFriends: [],
  offlineFriends: [],
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
        const online = friends.filter((f) => ["online", "browsing", "away"].includes(f.presence.status));
        const offline = friends.filter((f) => f.presence.status === "offline");

        set({
          friends,
          playingFriends: playing,
          onlineFriends: online,
          offlineFriends: offline,
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

  setSelectedFriend: (friend) => set({ selectedFriend: friend }),

  startPolling: (intervalMs = 30000) => {
    if (pollInterval) clearInterval(pollInterval);
    // Initial fetch
    get().fetchFriends();
    get().fetchRequests();
    
    pollInterval = setInterval(() => {
      get().fetchFriends();
      get().fetchRequests();
    }, intervalMs);
  },

  stopPolling: () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  },
}));
