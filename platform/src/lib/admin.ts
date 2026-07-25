/** Founder emails that receive admin on signup / seed. */
export const FOUNDER_ADMIN_EMAILS = ["ryanschumacher@themediashop.co"] as const;

export const FOUNDER_ADMIN_USERNAME = "ryanschumacher";

export function isFounderAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return (FOUNDER_ADMIN_EMAILS as readonly string[]).includes(normalized);
}
