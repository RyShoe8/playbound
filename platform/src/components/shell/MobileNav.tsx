"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Gamepad2, House, LibraryBig, Mouse, Puzzle, Server, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: House },
  { href: "/discover", label: "Games", icon: Gamepad2 },
  { href: "/mods", label: "Mods", icon: Puzzle },
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/library", label: "Library", icon: LibraryBig },
  { href: "/gear", label: "Gear", icon: Mouse },
];

export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const isAdmin = session?.user?.role === "admin";

  /*
   * Admin is part of the list rather than a sibling appended after it, so the
   * column count and the items it has to fit can never disagree.
   */
  const navItems = isAdmin
    ? [...items, { href: "/admin", label: "Admin", icon: Shield }]
    : items;

  return (
    /*
     * Grid, not flex, because the flex row could be pushed past the viewport.
     *
     * `flex-1` is `flex: 1 1 0%`, but a flex item keeps `min-width: auto` and
     * so refuses to shrink below its own icon-plus-label width. At the 10px
     * these labels are set in, seven of those still fit on a 360px screen — the
     * row only breaks once the text is rendered larger than asked for, which is
     * routine on a phone: Chrome for Android inflates small text via font
     * boosting, and accessibility text settings do the same. Measured on a
     * 360px viewport, the flex row overflows by 40px once the label renders at
     * 20px, and nothing clipped it, so the document scrolled sideways.
     *
     * Tailwind's grid-cols-* are `repeat(N, minmax(0, 1fr))`, and that 0 floor
     * is what fixes it — columns divide the width they are given instead of
     * demanding what their contents want. Both class names are written out in
     * full because Tailwind only sees literal strings. `overflow-hidden` makes
     * it structural: whatever happens to the text, this bar cannot widen the
     * page.
     */
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 grid w-full max-w-[100vw] overflow-hidden border-t border-border bg-sidebar/95 backdrop-blur-md lg:hidden",
        isAdmin ? "grid-cols-7" : "grid-cols-6"
      )}
    >
      {navItems.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[10px] font-semibold",
            isActive(href) ? "text-primary" : "text-muted-foreground"
          )}
        >
          <Icon className="size-5 shrink-0" />
          {/* Ellipsis rather than overflow if a label still outgrows its column. */}
          <span className="max-w-full truncate">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
