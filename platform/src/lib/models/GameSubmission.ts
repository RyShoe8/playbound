import { Schema, model, models } from "mongoose";

const GameSubmissionSchema = new Schema({
  title: { type: String, required: true, maxlength: 120 },
  website: { type: String, required: true, maxlength: 500 },
  githubRepo: { type: String, maxlength: 200, default: null },
  description: { type: String, required: true, maxlength: 4000 },
  license: { type: String, maxlength: 120, default: null },
  contactEmail: { type: String, required: true, lowercase: true, trim: true },
  submitterName: { type: String, maxlength: 80, default: null },
  submittedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
    index: true,
  },
  adminNotes: { type: String, maxlength: 2000, default: null },
  createdAt: { type: Date, default: Date.now },
  decidedAt: { type: Date, default: null },
});

const GameSubmission = models.GameSubmission || model("GameSubmission", GameSubmissionSchema);
export default GameSubmission;
