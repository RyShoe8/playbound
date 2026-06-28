import { Schema, model, models } from "mongoose";

const NewsletterSubscriberSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  email: { type: String, required: true, unique: true },
  subscribed: { type: Boolean, default: true },
  listId: Number,
  createdAt: { type: Date, default: Date.now }
});

const NewsletterSubscriber = models.NewsletterSubscriber || model("NewsletterSubscriber", NewsletterSubscriberSchema);
export default NewsletterSubscriber;
