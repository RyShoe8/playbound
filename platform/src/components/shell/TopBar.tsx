"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Play, Search } from "lucide-react";
import { Avatar } from "@/components/ui/bits";

export function TopBar() {
  const { data: session } = useSession();

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

        <form action="/search" className="relative mx-auto w-full max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            placeholder="Search games, developers, collections…"
            className="h-9 w-full rounded-full border border-input bg-secondary/60 pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
        </form>

        <div className="ml-auto flex items-center gap-2">
          {session?.user ? (
            <Link href="/profile" title="Profile">
              <Avatar name={session.user.username ?? "?"} hue={265} size="sm" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-full px-3.5 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
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
