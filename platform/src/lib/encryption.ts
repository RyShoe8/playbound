import crypto from "crypto";

const ENCRYPTION_KEY = process.env.DISCORD_ENCRYPTION_KEY; // Must be 32 bytes hex
const ALGORITHM = "aes-256-gcm";

/**
 * Encrypts a string using AES-256-GCM.
 * Returns a base64 string containing the iv, encrypted text, and auth tag.
 */
export function encryptString(text: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error("DISCORD_ENCRYPTION_KEY is not configured.");
  }
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  if (key.length !== 32) {
    throw new Error("DISCORD_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters).");
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedText
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}
