import { Schema, model, models, type Types } from "mongoose";

export interface ModeratorAuditLogDoc {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  actorUsername: string;
  action: string;
  targetType: string;
  targetId: Types.ObjectId;
  note?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const ModeratorAuditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorUsername: { type: String, required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    note: { type: String, maxlength: 2000, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ModeratorAuditLogSchema.index({ createdAt: -1 });
ModeratorAuditLogSchema.index({ targetType: 1, targetId: 1 });

const ModeratorAuditLog =
  models.ModeratorAuditLog || model("ModeratorAuditLog", ModeratorAuditLogSchema);
export default ModeratorAuditLog;
