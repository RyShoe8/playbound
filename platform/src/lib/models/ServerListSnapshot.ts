import { Schema, model, models } from "mongoose";

/**
 * The last fetched public server list for one provider slug.
 *
 * Written only by /api/cron/server-lists (every five minutes). Pages and APIs
 * read it and never call an upstream master server themselves: every page
 * render used to be one cache revalidation away from fanning out to ~60
 * masters, each Vercel instance did that independently, and the timeouts were
 * logged against whatever unrelated request the instance was serving.
 *
 * A failed refresh keeps the previous `servers` and records `error`, so a
 * master that blips keeps showing its last good list (with its real age in
 * `okAt`) instead of dropping to nothing.
 */
const ServerListSnapshotSchema = new Schema(
  {
    slug: { type: String, required: true },
    servers: { type: [Schema.Types.Mixed], default: [] },
    /** From providers that report a count directly (fetchPlayerCount). */
    playerCount: {
      type: new Schema({ players: Number, servers: Number }, { _id: false }),
      default: null,
    },
    /**
     * Players and servers for the whole list (or the provider's own count).
     * Summary reads exclude `servers`, which is most of the document.
     */
    totals: {
      type: new Schema({ players: Number, servers: Number }, { _id: false }),
      default: null,
    },
    error: { type: String, default: null },
    fetchedAt: { type: Date, required: true },
    okAt: { type: Date, default: null },
  },
  { collection: "server_list_snapshots" }
);

ServerListSnapshotSchema.index({ slug: 1 }, { unique: true });

export default models.ServerListSnapshot || model("ServerListSnapshot", ServerListSnapshotSchema);
