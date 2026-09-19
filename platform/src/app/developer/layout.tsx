import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Code2, Gamepad2, Building2, ShieldAlert, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Developer Portal — PlayBound",
  description: "Manage your game pages and studio profile on PlayBound.",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?next=/developer");
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Back to Site
            </Link>
            <span className="text-border">|</span>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                <Code2 className="size-4" />
              </span>
              <span className="text-sm font-bold tracking-tight">Developer Portal</span>
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/developer"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Gamepad2 className="size-3.5 text-primary" />
              My Games
            </Link>
            <Link
              href="/developer/profile/edit"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Building2 className="size-3.5 text-primary" />
              Studio Profile
            </Link>
            <Link
              href="/developer/claim"
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              <ShieldAlert className="size-3.5" />
              Claim Game
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
