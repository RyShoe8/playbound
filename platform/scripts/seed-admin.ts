/**
 * Idempotent admin seed. Creates or upgrades the founder account
 * to a verified admin.
 *
 * Usage (with MONGODB_URI set — e.g. via vercel env run):
 *   npm run seed:admin
 */
import { loadEnvConfig } from "@next/env";
import crypto from "crypto";
import bcrypt from "bcryptjs";

loadEnvConfig(process.cwd());

async function main() {
  const { FOUNDER_ADMIN_EMAILS, FOUNDER_ADMIN_USERNAME } = await import("../src/lib/admin");
  const dbConnect = (await import("../src/lib/db")).default;
  const User = (await import("../src/lib/models/User")).default;

  const ADMIN_EMAIL = FOUNDER_ADMIN_EMAILS[0];
  const ADMIN_USERNAME = FOUNDER_ADMIN_USERNAME;

  await dbConnect();

  const existing = await User.findOne({
    email: { $regex: new RegExp(`^${ADMIN_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  }).select("+password");

  if (existing) {
    existing.role = "admin";
    existing.emailVerified = true;
    existing.email = ADMIN_EMAIL;
    await existing.save();
    console.log(`Updated existing user ${ADMIN_EMAIL} -> role: admin, emailVerified: true.`);
    console.log("Password unchanged. Sign out and sign in again to refresh your session.");
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
