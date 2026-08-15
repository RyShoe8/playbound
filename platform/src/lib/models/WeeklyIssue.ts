import { Schema, model, models } from "mongoose";

const WeeklyIssueSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    year: { type: Number, required: true },
    week: { type: Number, required: true },
    gameSlug: { type: String, required: true, index: true },
    publishedAt: { type: String, required: true },
    published: { type: Boolean, default: true, index: true },
    /** Newsletter builder payload — HTML is rendered on demand, not stored. */
    emailDraft: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

WeeklyIssueSchema.index({ year: 1, week: 1 }, { unique: true });

const WeeklyIssue = models.WeeklyIssue || model("WeeklyIssue", WeeklyIssueSchema);
export default WeeklyIssue;
