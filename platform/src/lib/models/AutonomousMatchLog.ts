import { Schema, model, models, type Document } from "mongoose";

export interface AutonomousMatchLogDoc extends Document {
  gameSlug: string;
  editionSlug?: string | null;
  gameTitle?: string;
  roomId?: string;
  partyId?: string;
  host?: string;
  port?: number;
  eventId?: Schema.Types.ObjectId;
  startedAt: Date;
  endsAt?: Date;
  stoppedAt?: Date;
  durationMinutes?: number;
  status: "completed" | "force_stopped" | "failed";
  error?: string;
  createdAt: Date;
}

const AutonomousMatchLogSchema = new Schema(
  {
    gameSlug: { type: String, required: true, index: true },
    editionSlug: { type: String, default: null },
    gameTitle: { type: String, default: null },
    roomId: { type: String, default: null },
    partyId: { type: String, default: null },
    host: { type: String, default: null },
    port: { type: Number, default: null },
    eventId: { type: Schema.Types.ObjectId, ref: "PlatformEvent", default: null },
    startedAt: { type: Date, required: true, default: Date.now },
    endsAt: { type: Date, default: null },
    stoppedAt: { type: Date, default: null },
    durationMinutes: { type: Number, default: null },
    status: {
      type: String,
      enum: ["completed", "force_stopped", "failed"],
      default: "completed",
      index: true,
    },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

export default models.AutonomousMatchLog ||
  model<AutonomousMatchLogDoc>("AutonomousMatchLog", AutonomousMatchLogSchema);
