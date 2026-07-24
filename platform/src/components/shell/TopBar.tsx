import Link from "next/link";
import { Bell, Play, Search, Users } from "lucide-react";
import { currentUser, friendsPlaying } from "@/lib/data";
import { Avatar } from "@/components/ui/bits";

export function TopBar() {
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
            placeholder="Search games, developers, collections, players, servers…"
            className="h-9 w-full rounded-full border border-input bg-secondary/60 pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
        </form>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/community"
            className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Friends"
          >
            <Users className="size-4.5" />
            {friendsPlaying.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-play text-[10px] font-bold text-play-foreground">
                {friendsPlaying.length}
              </span>
            )}
          </Link>
          <Link
            href="/profile#notifications"
            className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Notifications"
          >
            <Bell className="size-4.5" />
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              3
            </span>
          </Link>
          <Link href="/profile" className="ml-1" title="Profile">
            <Avatar name={currentUser.name} hue={currentUser.avatarHue} size="sm" status="Online" />
          </Link>
        </div>
      </div>
    </header>
  );
}
