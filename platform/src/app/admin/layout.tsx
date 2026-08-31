import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { AdminNav } from "@/components/shell/AdminNav";

// Applies to every /admin/* route. Also disallowed in robots.ts — belt and braces.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Never prerendered.
 *
 * Admin pages are auth-gated and read live operational data, so a build-time
 * snapshot of one is meaningless — and worse than meaningless when the database
 * is briefly unreachable: /admin/ecommerce threw during static generation and
 * took the entire deploy down with it, on a page no anonymous visitor can even
 * load.
 *
 * Set on the layout so it covers all nineteen admin routes and any added later,
 * rather than relying on each new page to remember.
 *
 * Enforced by connection() rather than `dynamic = "force-dynamic"`, which
 * Cache Components replaces. The prediction above is not hypothetical: dropping
 * the old directive let the build try to prerender these pages again and
 * /admin/analytics/content took the deploy down exactly as described, on the
 * first attempt. connection() stops prerendering at this line, so nothing below
 * it — in the layout or any page under it — runs at build time.
 */

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/");

  return (
    <div>
      <AdminNav />
      {children}
    </div>
  );
}
