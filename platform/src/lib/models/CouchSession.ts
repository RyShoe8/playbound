import mongoose, { Schema, type Model } from "mongoose";

export interface ICouchSignalingMessage {
  id: string;
  senderRole: "host" | "controller";
  recipientRole: "host" | "controller";
  senderPeerId: string;
  payload: string;
  timestamp: number;
}

export interface ICouchController {
  controllerId: string;
  controllerToken: string;
  sessionToken: string | null;
  label: string;
  profile: string;
  status: "pending" | "approved" | "kicked";
  playerSlot: number | null;
  createdAt: number;
  lastSeen: number;
  deviceLabel?: string;
}

export interface ICouchHostEndpoints {
  wsUrls: string[];
  wsToken: string;
  iceServers?: { urls: string | string[]; username?: string; credential?: string }[];
}

export interface ICouchSession {
  sessionId: string;
  joinCode: string;
  hostToken: string;
  hostLabel: string;
  status: "open" | "ended";
  maxPlayers: number;
  createdAt: number;
  lastHeartbeat: number;
  controllers: ICouchController[];
  messages: ICouchSignalingMessage[];
  hostEndpoints: ICouchHostEndpoints | null;
  autoApprove: boolean;
  expiresAt: Date;
}

const CouchSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    joinCode: { type: String, required: true, unique: true, index: true },
    hostToken: { type: String, required: true },
    hostLabel: { type: String, default: "PlayBound" },
    status: { type: String, enum: ["open", "ended"], default: "open", index: true },
    maxPlayers: { type: Number, default: 4 },
    createdAt: { type: Number, required: true },
    lastHeartbeat: { type: Number, required: true },
    controllers: { type: [Schema.Types.Mixed], default: [] },
    messages: { type: [Schema.Types.Mixed], default: [] },
    hostEndpoints: { type: Schema.Types.Mixed, default: null },
    autoApprove: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { collection: "couch_sessions" }
);

// TTL index — Mongo drops ended/stale docs
CouchSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CouchSessionModel: Model<ICouchSession> =
  mongoose.models.CouchSession ||
  mongoose.model<ICouchSession>("CouchSession", CouchSessionSchema);

export default CouchSessionModel;
