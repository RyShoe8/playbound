"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Play, Search } from "lucide-react";
import { Avatar } from "@/components/ui/bits";
import { SignOutButton } from "@/components/SignOutButton";
import { useTelemetry } from "@/lib/telemetry";
import { MobileCatalogPreferences } from "@/components/shell/MobileCatalogPreferences";
import { MobileFriendsButton } from "@/components/friends/MobileFriendsButton";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { BackButton } from "@/components/shell/BackButton";

function TopBarSearch() {
  const searchParams = useSearchParams();
  const { track } = useTelemetry();
  const q = searchParams?.get("q") ?? "";

  return (
    <form
      action="/search"
      className="relative mx-auto flex-1 min-w-0 max-w-xl"
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        const query = String(fd.get("q") || "").trim();
        if (query) void track("search", { query });
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        name="q"
        key={q}
        defaultValue={q}
        placeholder="Search games, developers…"
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-full border border-input bg-secondary/80 pr-4 pl-9 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground transition-colors focus:border-ring focus:bg-secondary focus:ring-2 focus:ring-ring/40"
      />
    </form>
  );
}

function TopBarSearchFallback() {
  return (
    <form action="/search" className="relative mx-auto flex-1 min-w-0 max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        name="q"
        placeholder="Search games, developers…"
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-full border border-input bg-secondary/80 pr-4 pl-9 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground transition-colors focus:border-ring focus:bg-secondary focus:ring-2 focus:ring-ring/40"
      />
    </form>
  );
}

export function TopBar() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-30 w-full max-w-full overflow-hidden border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex h-14 w-full max-w-full items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <BackButton />
        {/* mobile logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2 lg:hidden">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Play className="size-4 fill-primary-foreground text-primary-foreground" />
          </span>
          <span className="hidden text-base font-extrabold tracking-tight sm:inline">
            Play<span className="text-primary">Bound</span>
          </span>
        </Link>

        <Suspense fallback={<TopBarSearchFallback />}>
          <TopBarSearch />
        </Suspense>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <MobileCatalogPreferences className="lg:hidden" />
          {session?.user ? (
            <>
              <NotificationBell />
              <MobileFriendsButton />
              <Link href="/profile" title="Profile" className="shrink-0 rounded-full">
                <Avatar name={session.user.username ?? "?"} hue={265} size="sm" />
              </Link>
              <SignOutButton className="hidden sm:inline" />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground sm:px-3 sm:text-sm"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-all hover:brightness-110 sm:px-4 sm:text-sm"
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
