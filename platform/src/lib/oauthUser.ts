import crypto from "crypto";
import { isFounderAdminEmail } from "@/lib/admin";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

/**
 * Resolving an OAuth sign-in to a PlayBound user.
 *
 * The linking rule is: trust Google's `email_verified`, and only that. If
 * Google says the address is verified and we already hold an account on the
 * same address, it is the same person — link and sign in. If Google has not
 * verified it, refuse, because an attacker who can create an unverified Google
 * profile on someone else's address would otherwise inherit their account.
 */

export type OAuthProfileInput = {
  provider: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
  image?: string | null;
};

export type OAuthResolution =
  | {
      ok: true;
      userId: string;
      username: string;
      role: "user" | "admin";
      tester: boolean;
      needsUsername: boolean;
    }
  | { ok: false; reason: string };

/** Placeholder username, replaced by the user on /welcome before they can act. */
function placeholderUsername(): string {
  return `pb_${crypto.randomBytes(6).toString("hex")}`;
}

export async function resolveOAuthUser(
  input: OAuthProfileInput
): Promise<OAuthResolution> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, reason: "NoEmail" };

  // Refusing unverified addresses is the entire security boundary of the
  // auto-linking policy. Do not relax this.
  if (!input.emailVerified) return { ok: false, reason: "EmailNotVerified" };

  await dbConnect();

  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.disabled) return { ok: false, reason: "AccountDisabled" };

    const providers: string[] = existing.authProviders ?? [];
    let dirty = false;

    if (!providers.includes(input.provider)) {
      existing.authProviders = [...providers, input.provider];
      dirty = true;
    }

    // A password account whose owner arrives via Google has now proved control
    // of the address, so treat the email as verified even if they never
    // clicked the original link.
    if (!existing.emailVerified) {
      existing.emailVerified = true;
      dirty = true;
    }

    if (!existing.image && input.image) {
      existing.image = input.image;
      dirty = true;
    }

    if (isFounderAdminEmail(email) && existing.role !== "admin") {
      existing.role = "admin";
      dirty = true;
    }

    if (dirty) await existing.save();

    return {
      ok: true,
      userId: existing._id.toString(),
      username: existing.username,
      role: existing.role,
      tester: Boolean(existing.tester),
      needsUsername: Boolean(existing.needsUsername),
    };
  }

  // New account. A placeholder username is written so the unique index is
  // satisfied, then middleware pins the user to /welcome until they pick a
  // real one — nothing they post can carry the placeholder.
  const created = await User.create({
    username: placeholderUsername(),
    email,
    authProviders: [input.provider],
    image: input.image ?? null,
    needsUsername: true,
    emailVerified: true,
    role: isFounderAdminEmail(email) ? "admin" : "user",
  });

  return {
    ok: true,
    userId: created._id.toString(),
    username: created.username,
    role: created.role,
    tester: Boolean(created.tester),
    needsUsername: true,
  };
}

/**
 * Suggest a username from an OAuth display name, for prefilling the picker.
 * Never assigned automatically — only offered.
 */
export function suggestUsername(name?: string | null, email?: string | null): string {
  const source = (name || email?.split("@")[0] || "").trim();
  const cleaned = source
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  return cleaned.length >= 3 ? cleaned : "";
}
