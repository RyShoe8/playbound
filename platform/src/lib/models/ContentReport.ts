import { Schema, model, models, type Types } from "mongoose";
import {
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
} from "@/lib/discussion/reportConstants";

export type { ReportReason, ReportStatus, ReportTargetType };
export { REPORT_REASONS, REPORT_STATUSES, REPORT_TARGET_TYPES };

export interface ContentReportDoc {
  _id: Types.ObjectId;
  reporterId: Types.ObjectId;
  targetType: ReportTargetType;
  targetId: Types.ObjectId;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;
  moderatorId?: Types.ObjectId | null;
  resolutionNote?: string;
  createdAt: Date;
  resolvedAt?: Date | null;
}

const ContentReportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetType: { type: String, enum: REPORT_TARGET_TYPES, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, maxlength: 1000, default: null },
    status: {
      type: String,
      enum: REPORT_STATUSES,
      default: "open",
      index: true,
    },
    moderatorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolutionNote: { type: String, maxlength: 2000, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

ContentReportSchema.index({ status: 1, createdAt: -1 });
ContentReportSchema.index({ reporterId: 1, createdAt: -1 });

const ContentReport = models.ContentReport || model("ContentReport", ContentReportSchema);
export default ContentReport;
