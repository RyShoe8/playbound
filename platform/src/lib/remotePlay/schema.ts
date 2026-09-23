import { z } from "zod";

/** POST /api/remote-play/requests — a client device asks a host device (same account) to stream a game. */
export const createRemotePlayRequestSchema = z.object({
  hostDeviceId: z.string().trim().min(10).max(80),
  clientDeviceId: z.string().trim().min(10).max(80),
  gameSlug: z.string().trim().min(1).max(120),
  editionSlug: z.string().trim().min(1).max(120).nullable().optional(),
});

/** PATCH /api/remote-play/requests/[id] — host or client updating the handoff's status. */
export const patchRemotePlayRequestSchema = z.object({
  status: z.enum(["ready", "streaming", "ended", "declined"]).optional(),
  joinUrl: z.string().trim().url().max(500).optional(),
  terminationReason: z
    .enum(["player_exit", "game_crashed", "host_offline", "network_error", "repaired"])
    .nullable()
    .optional(),
});

export type CreateRemotePlayRequestInput = z.infer<typeof createRemotePlayRequestSchema>;
export type PatchRemotePlayRequestInput = z.infer<typeof patchRemotePlayRequestSchema>;
