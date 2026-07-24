import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { LibraryBig, LogIn } from "lucide-react";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <LibraryBig className="size-10 text-primary" />
        <h1 className="text-2xl font-extrabold">Sign in to see your library</h1>
        <p className="text-sm text-muted-foreground">
          Your library tracks games you install through the PlayBound Launcher.
        </p>
        <Link
          href="/login?callbackUrl=/library"
          className="mt-2 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
        >
          <LogIn className="size-4" /> Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <LibraryBig className="size-10 text-primary" />
      <h1 className="text-2xl font-extrabold">Library sync is coming soon</h1>
      <p className="text-sm text-muted-foreground">
        Installs made through the PlayBound Launcher will appear here automatically once account
        sync ships. For now, the Launcher tracks your installs locally.
      </p>
      <Link href="/launcher" className="text-sm font-semibold text-primary hover:underline">
        Open the Launcher →
      </Link>
    </div>
  );
}
