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
  Plug,
  Server,
  ShieldCheck,
  ShoppingBag,
  Store,
  Bot,
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
    family: ["/admin/games", "/admin/mods", "/admin/collections", "/admin/developers"],
  },
  { href: "/admin/gear", label: "Gear", icon: Mouse },
  { href: "/admin/hardware", label: "Hardware", icon: Cpu },
  { href: "/admin/community", label: "Community", icon: MessagesSquare },
  { href: "/admin/weekly", label: "Weekly", icon: Mail },
  {
    href: "/admin/ecommerce",
    label: "eCommerce",
    icon: ShoppingBag,
    family: ["/admin/ecommerce", "/admin/free-offers"],
  },
  { href: "/admin/submissions", label: "Submissions", icon: Inbox },
  {
    href: "/admin/connect",
    label: "Connect",
    icon: Plug,
    family: ["/admin/connect"],
  },
  {
    href: "/admin/ops",
    label: "Ops",
    icon: Activity,
    family: [
      "/admin/ops",
      "/admin/bugs",
      "/admin/version-issues",
      "/admin/download-mirrors",
      "/admin/access-audit",
    ],
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
    label: "Developers",
    icon: Building2,
    href: "/admin/developers",
    match: (p) => p.startsWith("/admin/developers"),
  },
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

const ECOMMERCE_CHILDREN: NavChild[] = [
  {
    label: "Overview",
    icon: ShoppingBag,
    href: "/admin/ecommerce",
    match: (p) => p === "/admin/ecommerce",
  },
  {
    label: "Stores",
    icon: Store,
    href: "/admin/ecommerce/stores",
    match: (p) => p.startsWith("/admin/ecommerce/stores"),
  },
  {
    label: "Free Offers",
    icon: Gift,
    href: "/admin/free-offers",
    match: (p) => p.startsWith("/admin/free-offers") || p.startsWith("/admin/ecommerce/free-offers"),
  },
];

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
  {
    label: "Access Audit",
    icon: ShieldCheck,
    href: "/admin/access-audit",
    match: (p) => p.startsWith("/admin/access-audit"),
  },
  {
    label: "Download Mirrors",
    icon: DownloadCloud,
    href: "/admin/download-mirrors",
    match: (p) => p.startsWith("/admin/download-mirrors"),
  },
];

const CONNECT_CHILDREN: NavChild[] = [
  {
    label: "Game Servers",
    icon: Server,
    href: "/admin/connect/game-servers",
    match: (p) =>
      p.startsWith("/admin/connect/game-servers") ||
      p.startsWith("/admin/game-servers"),
  },
  {
    label: "Automated Events",
    icon: Bot,
    href: "/admin/connect/autonomous",
    match: (p) => p.startsWith("/admin/connect/autonomous"),
  },
];

export function childrenFor(item: NavItem, gameSlug: string | null): NavChild[] {
  if (item.href === "/admin/games") return gamesChildren(gameSlug);
  if (item.href === "/admin/ecommerce") return ECOMMERCE_CHILDREN;
  if (item.href === "/admin/connect") return CONNECT_CHILDREN;
  if (item.href === "/admin/ops") return OPS_CHILDREN;
  return [];
}

/** True when this route belongs to the item's section, children included. */
export function inSection(pathname: string, item: NavItem): boolean {
  const roots = item.family ?? [item.href];
  return roots.some((root) => linkActive(pathname, root, item.exact));
}

/**
 * The section owning this route, if it has a subnav.
 *
 * First match wins: sections never overlap, and resolving one owner is what
 * lets the second row show a single section's children rather than every
 * section's at once.
 */
export function activeSection(pathname: string, gameSlug: string | null) {
  for (const item of links) {
    const children = childrenFor(item, gameSlug);
    if (children.length > 0 && inSection(pathname, item)) {
      return { item, children };
    }
  }
  return null;
}

function NavPill({
  href,
  label,
  icon: Icon,
  active,
  sub,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  sub?: boolean;
}) {
  const base = sub
    ? "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors"
    : "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors";
  const tone = active
    ? sub
      ? "bg-secondary text-foreground"
      : "bg-primary text-primary-foreground"
    : "text-muted-foreground hover:bg-secondary hover:text-foreground";
  return (
    <Link href={href} className={`${base} ${tone}`}>
      <Icon className={sub ? "size-3" : "size-3.5"} />
      {label}
    </Link>
  );
}

export function AdminNav() {
  const pathname = usePathname();
  const gameSlug = gameSlugFromPath(pathname);
  const section = activeSection(pathname, gameSlug);

  return (
    <nav className="border-b border-border bg-card/40">
      <div className="flex gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        {links.map((item) => (
          <NavPill
            key={item.href + item.label}
            href={item.href}
            label={item.label}
            icon={item.icon}
            // The section stays lit while you are anywhere inside it; the row
            // below says which page.
            active={inSection(pathname, item)}
          />
        ))}
      </div>

      {/*
        Second row, not more pills on the first. Children of the section you
        are in only, so the top row stays a stable list of sections rather
        than growing and reordering as you navigate.
      */}
      {section && (
        <div className="flex gap-1 overflow-x-auto border-t border-border/60 bg-background/40 px-4 py-1.5 sm:px-6 lg:px-8">
          {section.children.map((child) => (
            <NavPill
              key={`${section.item.href}-${child.label}`}
              href={child.href}
              label={child.label}
              icon={child.icon}
              active={child.match(pathname)}
              sub
            />
          ))}
        </div>
      )}
    </nav>
  );
}
