import { Schema, model, models, type Types } from "mongoose";
import {
  PARTY_STATUSES,
  PARTY_VISIBILITIES,
  PARTY_MEMBER_ROLES,
  PARTY_MAX_SIZE,
} from "@/lib/playTogether/types";

/**
 * A PlayBound party — a first-class coordination object.
 *
 * Discord handles conversation. This model handles:
 *   who is playing together, what game, which edition/mods,
 *   who is invited, who has joined, who is ready, and launching.
 *
 * One active party per leader at a time (unique partial index).
 */

const PartyPublicServerSchema = new Schema(
  {
    id: { type: String, default: null },
    name: { type: String, default: null },
    host: { type: String, default: null },
    port: { type: Number, default: null },
    mod: { type: String, default: null },
    protected: { type: Boolean, default: false },
  },
  { _id: false }
);

const PartyHostedSchema = new Schema(
  {
    roomId: { type: String, default: null },
    status: {
      type: String,
      enum: ["none", "pending", "ready", "failed"],
      default: "none",
    },
    host: { type: String, default: null },
    port: { type: Number, default: null },
    name: { type: String, default: null },
    error: { type: String, default: null },
    roomCode: { type: String, default: null },
    provisionedAt: { type: Date, default: null },
  },
  { _id: false }
);

/**
 * Overlay segment for `virtual-lan` games, which have no address to connect to
 * and find each other by broadcast instead.
 *
 * One NetBird group per party, one policy scoping traffic to that group, and
 * an ephemeral setup key that enrols a member's machine straight into it. The
 * key is a credential — it is handed out through an authenticated per-member
 * call, never through the party payload.
 */
const PartyLanSchema = new Schema(
  {
    groupId: { type: String, default: null },
    policyId: { type: String, default: null },
    setupKeyId: { type: String, default: null },
    // Not `select: false` — provisioning, enrolment and release all read it,
    // and a silently-absent field there fails as "no virtual LAN". It is kept
    // out of responses by `lanPayloadFromDoc` omitting it instead.
    setupKey: { type: String, default: null },
    status: {
      type: String,
      enum: ["none", "pending", "ready", "failed"],
      default: "none",
    },
    error: { type: String, default: null },
    provisionedAt: { type: Date, default: null },
    /** When status entered pending — used to retry if a prior attempt died mid-flight. */
    pendingAt: { type: Date, default: null },
  },
  { _id: false }
);

const PartyMemberSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: PARTY_MEMBER_ROLES,
      default: "member",
    },
    ready: { type: Boolean, default: false },
    // NetBird address reported by this member's launcher. Kept out of the
    // normal party payload and exposed only through the authenticated LAN
    // enrollment endpoint so LAN-discovery bridges can reach party peers.
    lanAddress: { type: String, default: null },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PartySchema = new Schema(
  {
    leaderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    members: {
      type: [PartyMemberSchema],
      default: [],
      validate: {
        validator: (v: unknown[]) => v.length <= 20,
        message: "Party cannot exceed 20 members",
      },
    },

    name: { type: String, default: null, maxlength: 60 },

    /**
     * The leader's OS at creation, for attributing party telemetry.
     *
     * Party provisioning — Discord, hosting, virtual LAN — runs server-side
     * with no request behind it, so those events had no platform and every one
     * of them landed in the Ops card's Unknown bucket. Stamping it once here
     * costs nothing at creation and lets a party failure be attributed to a
     * real platform. Null for parties created before this existed, which the
     * card reports as Server rather than pretending to know.
     */
    leaderOs: { type: String, default: null },

    // Game configuration — optional at create; leader picks it in the party window.
    gameSlug: { type: String, default: "", index: true },
    editionSlug: { type: String, default: null },
    modSlugs: { type: [String], default: [] },

    /*
     * Which of OpenRA's bundled games (Red Alert / Tiberian Dawn / Dune 2000)
     * this party is playing. OpenRA's "official" edition is one client that
     * can run any of the three, so editionSlug alone cannot tell a joiner's
     * launcher which Game.Mod to launch with — it always fell back to "ra",
     * and a self-hosted Tiberian Dawn or Dune 2000 night made every join fail
     * with "the server is running an incompatible mod". Null everywhere else.
     */
    openRaMod: { type: String, enum: ["ra", "cnc", "d2k", null], default: null },

    status: {
      type: String,
      enum: PARTY_STATUSES,
      default: "forming",
      index: true,
    },

    visibility: {
      type: String,
      enum: PARTY_VISIBILITIES,
      default: "friends",
    },

    passwordSalt: { type: String, default: null },
    passwordHash: { type: String, default: null },
    voiceEnabled: { type: Boolean, default: true },

    maxSize: {
      type: Number,
      default: PARTY_MAX_SIZE,
      min: 2,
      max: 20,
    },

    /*
     * Where the room runs: "public" on a community dedicated server, "self" on
     * the leader's own machine, "dedicated" on the PlayBound VPS. Null on
     * parties created before host modes existed, and every reader treats that
     * as the game's own default — so old parties keep behaving exactly as they
     * did.
     */
    hostMode: {
      type: String,
      enum: ["self", "dedicated", "public", null],
      default: null,
    },

    // Set only after the leader's launcher confirms the local game server is
    // actually listening. `status: launching` alone merely means Start Game
    // was clicked and is not safe for members to connect to.
    selfHostReady: { type: Boolean, default: false },
    selfHostReadyAt: { type: Date, default: null },

    /*
     * Community dedicated server picked from the live list. Only meaningful
     * when hostMode is "public"; Join Game maps it into the hosted payload.
     */
    publicServer: { type: PartyPublicServerSchema, default: () => ({}) },

    // Optional association with a PlatformEvent (4K).
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "PlatformEvent",
      default: null,
      index: true,
    },

    // Discord voice channel coordination (4J).
    discord: {
      voiceChannelId: { type: String, default: null },
      textChannelId: { type: String, default: null },
      categoryId: { type: String, default: null },
      inviteUrl: { type: String, default: null },
      provisionedAt: { type: Date, default: null },
      cleanedAt: { type: Date, default: null },
      relocatedAt: { type: Date, default: null },
    },

    // Public VPS dedicated room for NAT-sensitive listen-server games.
    hosted: { type: PartyHostedSchema, default: () => ({}) },

    // Shared L2 segment for LAN-discovery-only games.
    lan: { type: PartyLanSchema, default: () => ({}) },

    lastActivity: { type: Date, default: Date.now, index: true },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// "Which parties is this user in?" — the most common query.
PartySchema.index({ "members.userId": 1, status: 1 });

// Sweep: find stale non-ended parties.
PartySchema.index({ status: 1, lastActivity: 1 });

// Game-page parties: "3 friends are in a party playing OpenRA."
PartySchema.index({ gameSlug: 1, status: 1 });

// One active party per leader (prevent duplicates).
PartySchema.index(
  { leaderId: 1 },
  { unique: true, partialFilterExpression: { status: { $nin: ["ended"] } } }
);

// Event-linked parties (4K).
PartySchema.index(
  { eventId: 1, status: 1 },
  { partialFilterExpression: { eventId: { $ne: null } } }
);

export type PartyMemberDoc = {
  userId: Types.ObjectId;
  role: string;
  ready: boolean;
  lanAddress?: string | null;
  joinedAt: Date;
};

export type PartyDoc = {
  _id: Types.ObjectId;
  leaderId: Types.ObjectId;
  members: PartyMemberDoc[];
  name?: string | null;
  /** Leader's OS at creation; null for parties predating the field. */
  leaderOs?: string | null;
  gameSlug: string;
  editionSlug?: string | null;
  modSlugs: string[];
  openRaMod?: "ra" | "cnc" | "d2k" | null;
  status: string;
  visibility: string;
  passwordSalt?: string | null;
  passwordHash?: string | null;
  voiceEnabled?: boolean;
  maxSize: number;
  /** "self" | "dedicated" | "public"; null means the game's default for parties predating host modes. */
  hostMode?: "self" | "dedicated" | "public" | null;
  selfHostReady?: boolean;
  selfHostReadyAt?: Date | null;
  publicServer?: {
    id?: string | null;
    name?: string | null;
    host?: string | null;
    port?: number | null;
    mod?: string | null;
    protected?: boolean;
  } | null;
  eventId?: Types.ObjectId | null;
  discord: {
    voiceChannelId?: string | null;
    textChannelId?: string | null;
    categoryId?: string | null;
    inviteUrl?: string | null;
    provisionedAt?: Date | null;
    cleanedAt?: Date | null;
    relocatedAt?: Date | null;
  };
  hosted?: {
    roomId?: string | null;
    status?: string;
    host?: string | null;
    port?: number | null;
    name?: string | null;
    error?: string | null;
    roomCode?: string | null;
    provisionedAt?: Date | null;
  };
  lan?: {
    groupId?: string | null;
    policyId?: string | null;
    setupKeyId?: string | null;
    setupKey?: string | null;
    status?: string;
    error?: string | null;
    provisionedAt?: Date | null;
    pendingAt?: Date | null;
  };
  lastActivity: Date;
  endedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const Party = models.Party || model("Party", PartySchema);
export default Party;
