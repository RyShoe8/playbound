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

export type NavChild = {
  label: string;
  icon: LucideIcon;
  href: string;
  match: (pathname: string) => boolean;
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /**
   * Route prefixes that belong to this item's section, when its children live
   * outside its own path — Bugs and Versions are under Ops in the nav but not
   * in the URL, and the section has to stay open while you are on them.
   */
  family?: string[];
};

export const links: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  {
    href: "/admin/games",
    label: "Games",
    icon: Gamepad2,
    family: ["/admin/games", "/admin/mods", "/admin/collections"],
  },
  { href: "/admin/download-mirrors", label: "Download Mirrors", icon: DownloadCloud },
  { href: "/admin/gear", label: "Gear", icon: Mouse },
  { href: "/admin/hardware", label: "Hardware", icon: Cpu },
  { href: "/admin/developers", label: "Developers", icon: Building2 },
  { href: "/admin/community", label: "Community", icon: MessagesSquare },
  { href: "/admin/weekly", label: "Weekly", icon: Mail },
  { href: "/admin/free-offers", label: "Free Offers", icon: Gift },
  { href: "/admin/submissions", label: "Submissions", icon: Inbox },
  {
    href: "/admin/ops",
    label: "Ops",
    icon: Activity,
    family: ["/admin/ops", "/admin/bugs", "/admin/version-issues"],
  },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
];

export function linkActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function gameSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/games\/([^/]+)/);
  const slug = match?.[1] ?? null;
  if (slug === "new" || slug === "mods" || slug === "editions" || slug === "mod-classifications") {
    return null;
  }
  return slug;
}

/** Section-wide entries — the same wherever you are inside Games. */
const GLOBAL_GAME_CHILDREN: NavChild[] = [
  {
    label: "Collections",
    icon: Layers,
    href: "/admin/collections",
    match: (p) => p.startsWith("/admin/collections"),
  },
  {
    label: "Mod Classifications",
    icon: Tags,
    href: "/admin/games/mod-classifications",
    match: (p) => p.startsWith("/admin/games/mod-classifications"),
  },
];

/**
 * Games children, scoped to one game when you are inside one.
 *
 * Mods and Editions exist both globally and per game, so the hrefs change with
 * context while the labels do not — on a game you get that game's mods, off it
 * you get all of them.
 */
function gamesChildren(gameSlug: string | null): NavChild[] {
  if (gameSlug) {
    return [
      { label: "All Games", icon: Gamepad2, href: "/admin/games", match: () => false },
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
        match: (p) => p.startsWith(`/admin/games/${gameSlug}/mods`),
      },
      {
        label: "Editions",
        icon: Library,
        href: `/admin/games/${gameSlug}/editions`,
        match: (p) => p.startsWith(`/admin/games/${gameSlug}/editions`),
      },
      ...GLOBAL_GAME_CHILDREN,
    ];
  }
  return [
    {
      label: "Mods",
      icon: Puzzle,
      // /admin/mods redirects here, so both count as being on Mods.
      href: "/admin/games/mods",
      match: (p) => p.startsWith("/admin/games/mods") || p.startsWith("/admin/mods"),
    },
    {
      label: "Editions",
      icon: Library,
      href: "/admin/games/editions",
      match: (p) => p.startsWith("/admin/games/editions"),
    },
    ...GLOBAL_GAME_CHILDREN,
  ];
}

const OPS_CHILDREN: NavChild[] = [
  {
    label: "Bugs",
    icon: Bug,
    href: "/admin/bugs",
    match: (p) => p.startsWith("/admin/bugs"),
  },
  {
    label: "Versions",
    icon: AlertTriangle,
    href: "/admin/version-issues",
    match: (p) => p.startsWith("/admin/version-issues"),
  },
];

export function childrenFor(item: NavItem, gameSlug: string | null): NavChild[] {
  if (item.href === "/admin/games") return gamesChildren(gameSlug);
  if (item.href === "/admin/ops") return OPS_CHILDREN;
  return [];
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

  return (
    <nav className="border-b border-border bg-card/40">
      <div className="flex gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        {links.map((item) => {
          const children = childrenFor(item, gameSlug);
          const roots = item.family ?? [item.href];
          const inSection = roots.some((root) => linkActive(pathname, root));
          const onChild = children.some((child) => child.match(pathname));
          // The parent reads as active only when you are on the parent itself.
          // Landing on a child lights the child instead, so exactly one pill
          // in the section is ever highlighted.
          const parentActive = linkActive(pathname, item.href, item.exact) && !onChild;

          return (
            <div key={item.href + item.label} className="flex shrink-0 items-center gap-1">
              <NavPill
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={parentActive}
              />
              {inSection &&
                children.map((child) => (
                  <NavPill
                    key={`${item.href}-${child.label}`}
                    href={child.href}
                    label={child.label}
                    icon={child.icon}
                    active={child.match(pathname)}
                    nested
                  />
                ))}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
