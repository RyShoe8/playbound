import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { KeyRound, LogIn } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { issueLauncherTokenForUser } from "@/lib/library";
import { LauncherAuthHandoff } from "@/components/LauncherAuthHandoff";

export const metadata: Metadata = { title: "Connect Launcher" };

export default async function LauncherAuthPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <KeyRound className="size-10 text-primary" />
        <h1 className="text-2xl font-extrabold">Sign in to connect the launcher</h1>
        <p className="text-sm text-muted-foreground">
          Optional — installs still work without an account. Sign in only if you want library sync
          and other account features.
        </p>
        <Link
          href="/login?callbackUrl=/launcher/auth"
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

  let token: string;
  try {
    token = await issueLauncherTokenForUser(session.user.id);
  } catch (err) {
    console.error("Launcher auth mint failed:", err);
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-extrabold">Couldn&apos;t connect</h1>
        <p className="text-sm text-muted-foreground">Something went wrong minting a launcher token. Try again.</p>
        <Link href="/launcher/auth" className="text-sm font-semibold text-primary hover:underline">
          Retry
        </Link>
      </div>
    );
  }

  return <LauncherAuthHandoff token={token} username={session.user.username} />;
}
