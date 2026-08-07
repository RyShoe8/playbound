"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bug,
  Building2,
  CalendarDays,
  Gamepad2,
  Inbox,
  Layers,
  LayoutDashboard,
  Library,
  Mail,
  MessagesSquare,
  Puzzle,
  Users,
  type LucideIcon,
} from "lucide-react";

type NavChild = { href: string; label: string; icon: LucideIcon; editionsShortcut?: boolean };
type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  children?: NavChild[];
};

const links: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  {
    href: "/admin/games",
    label: "Games",
    icon: Gamepad2,
    children: [
      { href: "/admin/mods", label: "Mods", icon: Puzzle },
      // No global editions index — jump into the current game's editions when possible.
      { href: "/admin/games", label: "Editions", icon: Library, editionsShortcut: true },
    ],
  },
  { href: "/admin/collections", label: "Collections", icon: Layers },
  { href: "/admin/developers", label: "Developers", icon: Building2 },
  { href: "/admin/community", label: "Community", icon: MessagesSquare },
  { href: "/admin/weekly", label: "Weekly", icon: Mail },
  { href: "/admin/submissions", label: "Submissions", icon: Inbox },
  { href: "/admin/bugs", label: "Bugs", icon: Bug },
  { href: "/admin/version-issues", label: "Versions", icon: AlertTriangle },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/events/new", label: "Events", icon: CalendarDays },
];

function linkActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavPill({
  href,
  label,
  icon: Icon,
  active,
  nested,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  nested?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
        nested ? "ml-1" : ""
      } ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </Link>
  );
}

function editionsHref(pathname: string): string {
  const match = pathname.match(/^\/admin\/games\/([^/]+)/);
  if (match) return `/admin/games/${match[1]}/editions`;
  return "/admin/games";
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-card/40">
      <div className="flex gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        {links.map((item) => {
          const onMods = linkActive(pathname, "/admin/mods");
          const onEditions = pathname.includes("/editions");
          const onGames =
            item.href === "/admin/games"
              ? linkActive(pathname, "/admin/games") && !onMods
              : linkActive(pathname, item.href, item.exact);

          return (
            <div key={item.href + item.label} className="flex shrink-0 items-center gap-1">
              <NavPill
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={item.children ? onGames || onEditions : onGames}
              />
              {item.children?.map((child) => {
                const href = child.editionsShortcut ? editionsHref(pathname) : child.href;
                const active = child.editionsShortcut
                  ? onEditions
                  : linkActive(pathname, child.href);
                return (
                  <NavPill
                    key={`${item.href}-${child.label}`}
                    href={href}
                    label={child.label}
                    icon={child.icon}
                    active={active}
                    nested
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
