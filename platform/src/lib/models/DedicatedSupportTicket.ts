import { Schema, model, models } from "mongoose";

const MessageSchema = new Schema({
  authorId: { type: Schema.Types.ObjectId, required: true },
  authorRole: { type: String, enum: ["customer", "admin"], required: true },
  body: { type: String, required: true, maxlength: 4000 },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const DedicatedSupportTicketSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  serverId: { type: Schema.Types.ObjectId, ref: "CommunityServer", default: null },
  category: { type: String, enum: ["billing", "server", "game", "other"], required: true },
  subject: { type: String, required: true, maxlength: 120 },
  status: { type: String, enum: ["open", "waiting_on_customer", "resolved"], default: "open", index: true },
  messages: { type: [MessageSchema], default: [] },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

DedicatedSupportTicketSchema.index({ ownerId: 1, lastMessageAt: -1 });
DedicatedSupportTicketSchema.index({ status: 1, lastMessageAt: -1 });

export default models.DedicatedSupportTicket || model("DedicatedSupportTicket", DedicatedSupportTicketSchema);
