export type SignupMethodLabel = "Google" | "Standard" | "Unknown";

/** Legacy accounts lack signupMethod; only infer their origin when unambiguous. */
export function signupMethodLabel(user: {
  signupMethod?: string | null;
  authProviders?: string[] | null;
  hasPassword: boolean;
}): SignupMethodLabel {
  if (user.signupMethod === "google") return "Google";
  if (user.signupMethod === "standard") return "Standard";
  const google = Boolean(user.authProviders?.includes("google"));
  if (google && !user.hasPassword) return "Google";
  if (!google && user.hasPassword) return "Standard";
  return "Unknown";
}
