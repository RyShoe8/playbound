import { Schema, model, models, Types } from "mongoose";
import { LIBRARY_PLATFORMS, type LibraryPlatform } from "@/lib/libraryPlatform";

const LibraryEntrySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  gameSlug: { type: String, required: true, index: true },
  /**
   * The device this entry belongs to. A library entry is per-platform: a game
   * installed from the Play Store on a phone is not installed on the user's
   * desktop, and showing it there would offer a Play button that does nothing.
   *
   * Defaults to "desktop" because every entry written before this field
   * existed came from the launcher, which only runs on desktop.
   */
  platform: {
    type: String,
    enum: LIBRARY_PLATFORMS,
    default: "desktop",
    index: true,
  },
  /**
   * How the entry came to exist. Store redirects are *inferred* — we send the
   * user to Google Play and never hear whether they went through with it — so
   * install statistics can separate a confirmed launcher install from an
   * assumed one rather than treating them as equally certain.
   */
  source: {
    type: String,
    enum: ["launcher", "store_redirect", "browser", "manual"],
    default: "manual",
  },
  saved: { type: Boolean, default: false },
  installed: { type: Boolean, default: false },
  version: { type: String },
  installedAt: { type: Date },
  addedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

/**
 * One entry per user, per game, per platform.
 *
 * Supersedes the old { userId, gameSlug } unique index, which allowed only a
 * single entry per game and so could not represent "installed on my phone but
 * not my desktop". Mongo does not drop a superseded index on its own — the
 * deploy runs `migrate:library-platform` to do that. Until it does, the old
 * constraint still applies and a second platform is rejected.
 */
LibraryEntrySchema.index({ userId: 1, gameSlug: 1, platform: 1 }, { unique: true });

export type LibraryEntryDoc = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  gameSlug: string;
  platform: LibraryPlatform;
  source?: "launcher" | "store_redirect" | "browser" | "manual";
  saved: boolean;
  installed: boolean;
  version?: string;
  installedAt?: Date;
  addedAt: Date;
  updatedAt: Date;
};

const LibraryEntry = models.LibraryEntry || model("LibraryEntry", LibraryEntrySchema);
export default LibraryEntry;
