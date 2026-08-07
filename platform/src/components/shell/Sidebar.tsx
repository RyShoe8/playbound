"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  CalendarDays,
  Gamepad2,
  House,
  LibraryBig,
  Mail,
  MessagesSquare,
  Play,
  Puzzle,
  Server,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import { SITE_DISCORD_INVITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/bits";
import { SignOutButton } from "@/components/SignOutButton";
import { GameCompatibilityToggle } from "@/components/GameCompatibilityToggle";

const nav = [
  { href: "/", label: "Home", icon: House },
  { href: "/discover", label: "Games", icon: Gamepad2 },
  { href: "/mods", label: "Mods", icon: Puzzle },
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/library", label: "Library", icon: LibraryBig },
  { href: "/weekly", label: "Weekly", icon: Mail },
  { href: "/friends", label: "Friends", icon: Users },
  { href: "/standards", label: "Our Standard", icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

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
        {session?.user?.role === "admin" && (
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
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <a
          href={SITE_DISCORD_INVITE}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 transition-colors hover:border-primary/50 hover:bg-primary/15"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <MessagesSquare className="size-4 text-primary" />
            Join the Discord
          </span>
          <span className="text-xs leading-snug text-muted-foreground">
            Hang with the community, find people to play with, and hear about new games.
          </span>
          <span className="inline-flex w-full items-center justify-center rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
            Open Discord
          </span>
        </a>
        <div className="mb-3">
          <GameCompatibilityToggle variant="sidebar" />
        </div>
        {session?.user ? (
          <div className="space-y-1">
            <Link
              href="/profile"
              className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-sidebar-accent/60"
            >
              <Avatar name={session.user.username ?? session.user.email ?? "?"} hue={265} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{session.user.username}</p>
                <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
              </div>
            </Link>
            <SignOutButton className="w-full px-2 py-2 text-left hover:bg-sidebar-accent/60" />
          </div>
        ) : (
          <div className="flex gap-2 px-2 py-2">
            <Link
              href="/login"
              className="flex-1 rounded-full bg-secondary py-2 text-center text-sm font-bold transition-colors hover:bg-secondary/70"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="flex-1 rounded-full bg-primary py-2 text-center text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
            >
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
