import { Schema, model, models } from "mongoose";

const UserSchema = new Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, sparse: true },
  password: { type: String, select: false }, // For credentials auth
  avatarUrl: String,
  isGuest: { type: Boolean, default: true },
  stats: {
    gamesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    score: { type: Number, default: 0 }
  },
  friends: [{ type: Schema.Types.ObjectId, ref: "User" }],
  newsletter: { subscribed: { type: Boolean, default: false } },
  createdAt: { type: Date, default: Date.now }
});

const User = models.User || model("User", UserSchema);
export default User;
