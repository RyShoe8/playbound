import { Schema, model, models } from "mongoose";

/** Singleton newsletter builder defaults (footer links, community copy). */
const NewsletterEmailTemplateSchema = new Schema(
  {
    _id: { type: String, required: true },
    footer: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

const NewsletterEmailTemplate =
  models.NewsletterEmailTemplate ||
  model("NewsletterEmailTemplate", NewsletterEmailTemplateSchema);

export default NewsletterEmailTemplate;
