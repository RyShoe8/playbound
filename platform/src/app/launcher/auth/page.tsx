import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { KeyRound, LogIn } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { LauncherAuthHandoff } from "@/components/LauncherAuthHandoff";

export const metadata: Metadata = {
  title: "Connect Launcher",
  // Personal / auth route — must never be indexed.
  robots: { index: false, follow: false },
};

export default async function LauncherAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sp = await searchParams;
  const fromApp = sp.from === "app";
  const session = await getServerSession(authOptions);
  const callbackPath = fromApp ? "/launcher/auth?from=app" : "/launcher/auth";

  if (!session?.user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <KeyRound className="size-10 text-primary" />
        <h1 className="text-2xl font-extrabold">
          {fromApp ? "Sign in to PlayBound" : "Sign in to connect the launcher"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {fromApp
            ? "Sign in once here — the app will stay signed in and sync your installs automatically."
            : "Optional — installs still work without an account. Sign in only if you want library sync and other account features."}
        </p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(callbackPath)}`}
          className="mt-2 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
        >
          <LogIn className="size-4" /> Sign In
        </Link>
        <Link href="/signup" className="text-sm font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </div>
    );
  }

  return <LauncherAuthHandoff username={session.user.username} autoConnect={fromApp} />;
}
