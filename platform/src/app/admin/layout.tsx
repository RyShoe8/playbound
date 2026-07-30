import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { AdminNav } from "@/components/shell/AdminNav";

// Applies to every /admin/* route. Also disallowed in robots.ts — belt and braces.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

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
