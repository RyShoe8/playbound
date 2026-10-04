import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { Gamepad2, LogIn } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { getGame } from "@/lib/catalog";
import { findPendingGameLink, formatLinkCode, normalizeLinkCode, titleFromSlug } from "@/lib/gameAuth";
import { GameLinkApproval } from "@/components/GameLinkApproval";

export const metadata: Metadata = {
  title: "Sign in to a game",
  // Personal / auth route — must never be indexed.
  robots: { index: false, follow: false },
};

/**
 * /link?code=ABCD-EFGH — a game showed this code and opened this page. The
 * player signs in (or signs up) and approves; the game then signs itself in.
 */
export default async function GameLinkPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  // Per-request by nature: the signed-in viewer and a live link lookup.
  await connection();
  const sp = await searchParams;
  const code = normalizeLinkCode(sp.code);
  const session = await getServerSession(authOptions);
  const callbackPath = code ? `/link?code=${formatLinkCode(code)}` : "/link";

  if (!session?.user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <Gamepad2 className="size-10 text-primary" />
        <h1 className="text-2xl font-extrabold">Sign in to play online</h1>
        <p className="text-sm text-muted-foreground">
          Sign in or create a free PlayBound account, then approve the code your game is showing. Your friends,
          invites and online matches come with you.
        </p>
        {code && <p className="font-mono text-2xl font-bold tracking-widest">{formatLinkCode(code)}</p>}
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(callbackPath)}`}
          className="mt-2 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
        >
          <LogIn className="size-4" /> Sign In
        </Link>
        <Link
          href={`/signup?next=${encodeURIComponent(callbackPath)}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Create a free account
        </Link>
      </div>
    );
  }

  let pending = null;
  let gameTitle = "";
  if (code) {
    pending = await findPendingGameLink(code);
    if (pending) {
      const game = await getGame(pending.gameSlug, { includeTesting: true }).catch(() => null);
      gameTitle = game?.title || titleFromSlug(pending.gameSlug);
    }
  }

  return (
    <GameLinkApproval
      username={session.user.username}
      initialCode={code ? formatLinkCode(code) : ""}
      gameTitle={gameTitle}
      deviceName={pending?.deviceName || ""}
      codeFound={Boolean(pending)}
    />
  );
}
