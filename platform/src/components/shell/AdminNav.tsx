"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bug,
  CalendarDays,
  Gamepad2,
  Inbox,
  LayoutDashboard,
  Mail,
  MessagesSquare,
  Puzzle,
  Users,
} from "lucide-react";

const links = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/games", label: "Games", icon: Gamepad2 },
  { href: "/admin/mods", label: "Mods", icon: Puzzle },
  { href: "/admin/community", label: "Community", icon: MessagesSquare },
  { href: "/admin/weekly", label: "Weekly", icon: Mail },
  { href: "/admin/submissions", label: "Submissions", icon: Inbox },
  { href: "/admin/bugs", label: "Bugs", icon: Bug },
  { href: "/admin/version-issues", label: "Versions", icon: AlertTriangle },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/events/new", label: "Events", icon: CalendarDays },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-card/40">
      <div className="flex gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
