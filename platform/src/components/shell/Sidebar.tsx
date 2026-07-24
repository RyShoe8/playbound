"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Compass,
  FolderHeart,
  Hammer,
  House,
  LibraryBig,
  Play,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { currentUser, friendsPlaying, totalPlayersOnline } from "@/lib/data";
import { Avatar } from "@/components/ui/bits";

const nav = [
  { href: "/", label: "Home", icon: House },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/library", label: "Library", icon: LibraryBig },
  { href: "/developers", label: "Developers", icon: Hammer },
  { href: "/collections", label: "Collections", icon: FolderHeart },
  { href: "/community", label: "Community", icon: Users },
  { href: "/events", label: "Events", icon: CalendarDays },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <Link href="/" className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary shadow-[0_0_28px_-6px_var(--primary)]">
          <Play className="size-4.5 fill-primary-foreground text-primary-foreground" />
        </span>
        <span className="text-lg font-extrabold tracking-tight">
          Play<span className="text-primary">Bound</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-0.5 px-3">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
              isActive(href)
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            )}
          >
            <Icon className={cn("size-4.5", isActive(href) && "text-primary")} />
            {label}
          </Link>
        ))}
        <div className="pt-4">
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
              isActive("/admin")
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            )}
          >
            <Shield className={cn("size-4.5", isActive("/admin") && "text-primary")} />
            Admin
          </Link>
        </div>
      </nav>

      <div className="border-t border-sidebar-border px-5 py-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-play opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-play" />
          </span>
          <span className="font-semibold text-foreground">
            {Intl.NumberFormat("en").format(totalPlayersOnline)}
          </span>
          players online now
        </p>
        <p className="mt-1">{friendsPlaying.length} friends in game</p>
      </div>

      <Link
        href="/profile"
        className="flex items-center gap-3 border-t border-sidebar-border px-5 py-4 transition-colors hover:bg-sidebar-accent/60"
      >
        <Avatar name={currentUser.name} hue={currentUser.avatarHue} status="Online" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{currentUser.name}</p>
          <p className="text-xs text-muted-foreground">Level {currentUser.level}</p>
        </div>
      </Link>
    </aside>
  );
}
