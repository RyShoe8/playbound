import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
 */

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/");

  return (
    <div>
      <AdminNav />
      {children}
    </div>
  );
}
