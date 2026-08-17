import { create } from "zustand";

interface DiscordProfile {
  username: string;
  globalName?: string | null;
  avatar?: string | null;
  linkedAt: string;
}

interface DiscordState {
  discordLinked: boolean;
  discordProfile: DiscordProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  unlink: () => Promise<void>;
}

export const useDiscordStore = create<DiscordState>((set) => ({
  discordLinked: false,
  discordProfile: null,
  loading: true,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/account/discord");
      if (!res.ok) {
        throw new Error("Failed to fetch Discord status");
      }
      const data = await res.json();
      if (data.linked) {
        set({
          discordLinked: true,
          discordProfile: {
            username: data.username,
            globalName: data.globalName,
            avatar: data.avatar,
            linkedAt: data.linkedAt,
          },
          loading: false,
        });
      } else {
        set({ discordLinked: false, discordProfile: null, loading: false });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      set({ error: message, loading: false });
    }
  },
  unlink: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/account/discord/unlink", { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to unlink Discord");
      }
      set({ discordLinked: false, discordProfile: null, loading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      set({ error: message, loading: false });
    }
  },
}));
