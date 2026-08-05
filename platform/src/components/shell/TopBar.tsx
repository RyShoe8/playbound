"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Play, Search } from "lucide-react";
import { Avatar } from "@/components/ui/bits";
import { SignOutButton } from "@/components/SignOutButton";
import { useTelemetry } from "@/lib/telemetry";
import { GameCompatibilityToggle } from "@/components/GameCompatibilityToggle";
import { MobileFriendsPanel } from "@/components/friends/MobileFriendsPanel";

export function TopBar() {
  const { data: session } = useSession();
  const { track } = useTelemetry();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        {/* mobile logo */}
        <Link href="/" className="flex items-center gap-2 lg:hidden">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <Play className="size-4 fill-primary-foreground text-primary-foreground" />
          </span>
          <span className="hidden text-base font-extrabold tracking-tight sm:inline">
            Play<span className="text-primary">Bound</span>
          </span>
        </Link>

        <form
          action="/search"
          className="relative mx-auto w-full max-w-xl"
          onSubmit={(e) => {
            const fd = new FormData(e.currentTarget);
            const query = String(fd.get("q") || "").trim();
            if (query) void track("search", { query });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            placeholder="Search games, developers, collections…"
            className="h-9 w-full rounded-full border border-input bg-secondary/60 pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <GameCompatibilityToggle variant="topbar" className="lg:hidden" />
          {session?.user ? (
            <>
              <MobileFriendsPanel />
              <Link href="/profile" title="Profile" className="rounded-full">
                <Avatar name={session.user.username ?? "?"} hue={265} size="sm" />
              </Link>
              <SignOutButton className="hidden sm:inline" />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-primary px-3.5 py-1.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 sm:px-4"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
