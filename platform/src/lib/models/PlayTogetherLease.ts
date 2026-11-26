import { Schema, model, models } from "mongoose";

// _id is the built-in unique index: safe even before the index cron has run.
const schema = new Schema({
  _id: String,
  owner: { type: String, required: true },
  until: { type: Date, required: true },
});
export default models.PlayTogetherLease || model("PlayTogetherLease", schema);
