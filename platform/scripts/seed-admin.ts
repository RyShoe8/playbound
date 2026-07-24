/**
 * Idempotent admin seed. Creates or upgrades ryanschumacher@themediashop.co
 * to a verified admin account.
 *
 * Usage (with MONGODB_URI set in the environment or .env.local):
 *   npm run seed:admin
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import dbConnect from "../src/lib/db";
import User from "../src/lib/models/User";

const ADMIN_EMAIL = "ryanschumacher@themediashop.co";
const ADMIN_USERNAME = "ryanschumacher";

async function main() {
  await dbConnect();

  const existing = await User.findOne({ email: ADMIN_EMAIL }).select("+password");

  if (existing) {
    existing.role = "admin";
    existing.emailVerified = true;
    await existing.save();
    console.log(`Updated existing user ${ADMIN_EMAIL} -> role: admin, emailVerified: true.`);
    console.log("Password unchanged. Sign in with your existing password.");
    process.exit(0);
  }

  const tempPassword = crypto.randomBytes(12).toString("base64url");
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  await User.create({
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    password: hashedPassword,
    role: "admin",
    emailVerified: true,
  });

  console.log("Created admin account:");
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Username: ${ADMIN_USERNAME}`);
  console.log(`  Password: ${tempPassword}`);
  console.log("\nSave this password now — it will not be shown again. Sign in at /login.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
