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
  Tags,
  Users,
  Mouse,
  Cpu,
  Gift,
  Activity,
  DownloadCloud,
  type LucideIcon,
} from "lucide-react";

type NavChild = {
  label: string;
  icon: LucideIcon;
  href: string;
  match: (pathname: string) => boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const links: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/games", label: "Games", icon: Gamepad2 },
  { href: "/admin/download-mirrors", label: "Download Mirrors", icon: DownloadCloud },
  { href: "/admin/collections", label: "Collections", icon: Layers },
  { href: "/admin/gear", label: "Gear", icon: Mouse },
  { href: "/admin/hardware", label: "Hardware", icon: Cpu },
  { href: "/admin/developers", label: "Developers", icon: Building2 },
  { href: "/admin/community", label: "Community", icon: MessagesSquare },
  { href: "/admin/weekly", label: "Weekly", icon: Mail },
  { href: "/admin/free-offers", label: "Free Offers", icon: Gift },
  { href: "/admin/submissions", label: "Submissions", icon: Inbox },
  { href: "/admin/bugs", label: "Bugs", icon: Bug },
  { href: "/admin/ops", label: "Ops", icon: Activity },
  { href: "/admin/version-issues", label: "Versions", icon: AlertTriangle },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
];

function linkActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function gameSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/games\/([^/]+)/);
  const slug = match?.[1] ?? null;
  if (slug === "new" || slug === "mods" || slug === "editions" || slug === "mod-classifications") {
    return null;
  }
  return slug;
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

export function AdminNav() {
  const pathname = usePathname();
  const gameSlug = gameSlugFromPath(pathname);

  const onClassifications = pathname.startsWith("/admin/games/mod-classifications");
  const onMods = pathname.startsWith("/admin/games/mods") || pathname.startsWith("/admin/mods") || pathname.includes("/mods");
  const onEditions = pathname.startsWith("/admin/games/editions") || pathname.includes("/editions");
  const onGames =
    (pathname === "/admin/games" || pathname.startsWith("/admin/games/new") || pathname.startsWith("/admin/games/")) &&
    !onClassifications &&
    !onMods &&
    !onEditions;

  const onGamesFamily =
    linkActive(pathname, "/admin/games") ||
    linkActive(pathname, "/admin/mods") ||
    onMods ||
    onEditions ||
    onClassifications;

  const gamesSubChildren: NavChild[] = gameSlug
    ? [
        {
          label: "All Games",
          icon: Gamepad2,
          href: "/admin/games",
          match: () => false,
        },
        {
          label: "Game Details",
          icon: Gamepad2,
          href: `/admin/games/${gameSlug}/edit`,
          match: (p) => p.startsWith(`/admin/games/${gameSlug}/edit`),
        },
        {
          label: "Mods",
          icon: Puzzle,
          href: `/admin/games/${gameSlug}/mods`,
          match: (p) => p.includes("/mods"),
        },
        {
          label: "Editions",
          icon: Library,
          href: `/admin/games/${gameSlug}/editions`,
          match: (p) => p.includes("/editions"),
        },
        {
          label: "Mod Classifications",
          icon: Tags,
          href: "/admin/games/mod-classifications",
          match: (p) => p.startsWith("/admin/games/mod-classifications"),
        },
      ]
    : [
        {
          label: "Mods",
          icon: Puzzle,
          href: "/admin/games/mods",
          match: () => onMods,
        },
        {
          label: "Editions",
          icon: Library,
          href: "/admin/games/editions",
          match: () => onEditions,
        },
        {
          label: "Mod Classifications",
          icon: Tags,
          href: "/admin/games/mod-classifications",
          match: () => onClassifications,
        },
      ];

  return (
    <nav className="border-b border-border bg-card/40">
      <div className="flex gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        {links.map((item) => {
          const isGames = item.href === "/admin/games";
          const active = isGames ? onGamesFamily : linkActive(pathname, item.href, item.exact);

          return (
            <div key={item.href + item.label} className="flex shrink-0 items-center gap-1">
              <NavPill
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={active && (isGames ? onGames : true)}
              />
              {isGames &&
                onGamesFamily &&
                gamesSubChildren.map((child) => {
                  const subActive = child.match(pathname);
                  return (
                    <NavPill
                      key={`${item.href}-${child.label}`}
                      href={child.href}
                      label={child.label}
                      icon={child.icon}
                      active={subActive}
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
