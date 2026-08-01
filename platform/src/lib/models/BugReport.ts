import { Schema, model, models } from "mongoose";
import { BUG_REPORT_SOURCES, BUG_REPORT_STATUSES } from "@/lib/bugReports";

const BugReportSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 160 },
    description: { type: String, required: true, maxlength: 8000 },
    source: {
      type: String,
      enum: BUG_REPORT_SOURCES,
      required: true,
      index: true,
    },
    pageUrl: { type: String, maxlength: 1000, default: null },
    contactEmail: { type: String, lowercase: true, trim: true, maxlength: 200, default: null },
    submitterName: { type: String, maxlength: 80, default: null },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    launcherVersion: { type: String, maxlength: 40, default: null },
    platform: { type: String, maxlength: 40, default: null },
    userAgent: { type: String, maxlength: 500, default: null },
    status: {
      type: String,
      enum: BUG_REPORT_STATUSES,
      default: "open",
      index: true,
    },
    adminNotes: { type: String, maxlength: 4000, default: null },
    moderatorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const BugReport = models.BugReport || model("BugReport", BugReportSchema);
export default BugReport;
