import User from "@/lib/models/User";
import { normalizeUsername } from "@/lib/username";
import { gameAssignmentEmailHtml, sendMail } from "@/lib/mailer";
import { absoluteUrl } from "@/lib/site";

/** Resolve the admin editor's account input before writing an ObjectId field. */
export async function resolveGameOwnerUserId(value: string | null): Promise<string | null> {
  const input = value?.trim();
  if (!input) return null;

  const query = /^[a-f\d]{24}$/i.test(input)
    ? { _id: input }
    : input.includes("@")
      ? { email: input.toLowerCase() }
      : {
          $or: [
            { usernameNormalized: normalizeUsername(input) },
            // Older accounts can predate the normalized username field.
            { username: { $regex: new RegExp(`^${input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
          ],
        };
  const user = await User.findOne(query).select("_id").lean();
  return user ? String(user._id) : null;
}

export function isNewGameAssignment(previousId: unknown, nextId: string | null): boolean {
  return Boolean(nextId && String(previousId || "") !== nextId);
}

/** A mail failure must not turn a successfully saved assignment into a 500. */
export async function notifyGameAssigned(userId: string, title: string, slug: string): Promise<boolean> {
  try {
    const user = await User.findById(userId).select("email username").lean();
    if (!user?.email) return false;
    const url = absoluteUrl(`/developer/games/${encodeURIComponent(slug)}/edit`);
    await sendMail(user.email, `You can now manage ${title} on PlayBound`, gameAssignmentEmailHtml(user.username || "there", title, url));
    return true;
  } catch (error) {
    console.error("Game assignment notification failed:", error);
    return false;
  }
}
