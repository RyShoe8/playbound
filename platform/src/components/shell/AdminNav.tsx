"use client";

import { useState } from "react";
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
  MonitorPlay,
  Bot,
  Loader2,
  BadgePercent,
  Megaphone,
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
   * outside its own path — Versions is under Ops, Feedback is under Users.
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
    family: ["/admin/games", "/admin/mods", "/admin/collections", "/admin/developers", "/admin/control-profiles"],
  },
  { href: "/admin/gear", label: "Gear", icon: Mouse },
  { href: "/admin/hardware", label: "Hardware", icon: Cpu },
  { href: "/admin/community", label: "Community", icon: MessagesSquare },
  { href: "/admin/weekly", label: "Weekly", icon: Mail },
  {
    href: "/admin/ecommerce",
    label: "eCommerce",
    icon: ShoppingBag,
    family: ["/admin/ecommerce", "/admin/free-offers", "/admin/store-discounts"],
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
      "/admin/version-issues",
      "/admin/download-mirrors",
      "/admin/access-audit",
    ],
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: Users,
    family: ["/admin/users", "/admin/feedback", "/admin/bugs"],
  },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
];

function linkActive(pathname: string, href: string, exact?: boolean) {
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
    label: "Control Profiles",
    icon: Gamepad2,
    href: "/admin/control-profiles",
    match: (p) => p.startsWith("/admin/control-profiles"),
  },
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
  {
    label: "Discord",
    icon: Bot,
    href: "/admin/games/discord",
    match: (p) => p.startsWith("/admin/games/discord"),
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
  {
    label: "Store Discounts",
    icon: BadgePercent,
    href: "/admin/store-discounts",
    match: (p) => p.startsWith("/admin/store-discounts"),
  },
];

const OPS_CHILDREN: NavChild[] = [
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

const USERS_CHILDREN: NavChild[] = [
  {
    label: "Users",
    icon: Users,
    href: "/admin/users",
    match: (p) => p === "/admin/users",
  },
  {
    label: "Feedback",
    icon: Megaphone,
    href: "/admin/feedback",
    match: (p) => p.startsWith("/admin/feedback") || p.startsWith("/admin/bugs"),
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
    label: "Parties",
    icon: Users,
    href: "/admin/connect/parties",
    match: (p) => p.startsWith("/admin/connect/parties"),
  },
  {
    label: "Streaming",
    icon: MonitorPlay,
    href: "/admin/connect/streaming",
    match: (p) => p.startsWith("/admin/connect/streaming"),
  },
];

export function childrenFor(item: NavItem, gameSlug: string | null): NavChild[] {
  if (item.href === "/admin/games") return gamesChildren(gameSlug);
  if (item.href === "/admin/ecommerce") return ECOMMERCE_CHILDREN;
  if (item.href === "/admin/connect") return CONNECT_CHILDREN;
  if (item.href === "/admin/ops") return OPS_CHILDREN;
  if (item.href === "/admin/users") return USERS_CHILDREN;
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
  pending,
  onClick,
  sub,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  pending?: boolean;
  onClick?: () => void;
  sub?: boolean;
}) {
  const base = sub
    ? "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors"
    : "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors";
  const tone = active
    ? sub
      ? "bg-secondary text-foreground"
      : "bg-primary text-primary-foreground"
    : pending
      ? "bg-secondary/80 text-foreground"
      : "text-muted-foreground hover:bg-secondary hover:text-foreground";
  return (
    // Every admin destination is dynamic and many run live Mongo/analytics
    // queries. Prefetching the entire visible nav fans those expensive routes
    // out on every admin page load and can exhaust the small database pool.
    <Link href={href} prefetch={false} onClick={onClick} className={`${base} ${tone}`}>
      {pending ? (
        <Loader2 className={`animate-spin ${sub ? "size-3" : "size-3.5"}`} />
      ) : (
        <Icon className={sub ? "size-3" : "size-3.5"} />
      )}
      {label}
    </Link>
  );
}

export function AdminNav() {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);
  const pendingHref = pending?.from === pathname ? pending.href : null;

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
            pending={pendingHref === item.href && !inSection(pathname, item)}
            onClick={() => {
              if (pathname !== item.href) setPending({ href: item.href, from: pathname });
            }}
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
              pending={pendingHref === child.href && !child.match(pathname)}
              onClick={() => {
                  if (pathname !== child.href) setPending({ href: child.href, from: pathname });
              }}
              sub
            />
          ))}
        </div>
      )}
    </nav>
  );
}
