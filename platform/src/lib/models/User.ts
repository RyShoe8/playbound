import { Schema, model, models } from "mongoose";

const UserSchema = new Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  /**
   * Only required for password accounts. Google users never set one, so this
   * is conditionally required rather than always — otherwise every OAuth
   * signup fails validation.
   */
  password: {
    type: String,
    select: false,
    required: function (this: { authProviders?: string[] }) {
      return !(this.authProviders ?? []).length;
    },
  },
  /**
   * OAuth providers linked to this account, e.g. ["google"]. An account can
   * have both a password and linked providers — see the linking rules in
   * src/lib/auth.ts.
   */
  authProviders: { type: [String], default: [] },
  /** Avatar URL from the OAuth provider, when there is one. */
  image: { type: String, default: null },
  /**
   * True between an OAuth signup and the user choosing a PlayBound username.
   * Middleware holds them on /welcome until this clears, so no user can post
   * a review or discussion under an auto-generated placeholder.
   */
  needsUsername: { type: Boolean, default: false },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  disabled: { type: Boolean, default: false, index: true },
  emailVerified: { type: Boolean, default: false },
  verificationTokenHash: { type: String, select: false },
  verificationTokenExpires: { type: Date, select: false },
  // Indexed: every launcher request looks a user up by this hash, and the
  // lookup runs before the caller is authenticated. Without the index an
  // unauthenticated request with any random Bearer token forces a full
  // collection scan.
  launcherTokenHash: { type: String, select: false, index: true, sparse: true },
  launcherTokenCreatedAt: { type: Date, select: false },
  /** Denormalized community counters and moderation state. */
  community: {
    topicCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    helpfulCount: { type: Number, default: 0 },
    warnings: { type: Number, default: 0 },
    suspendedUntil: { type: Date, default: null },
  },
  /** Optional linked Discord identity (Phase 5). */
  connectedAccounts: {
    discord: {
      discordUserId: { type: String, default: null },
      username: { type: String, default: null },
      avatarUrl: { type: String, default: null },
      connectedAt: { type: Date, default: null },
    },
  },
  createdAt: { type: Date, default: Date.now },
});

const User = models.User || model("User", UserSchema);
export default User;
