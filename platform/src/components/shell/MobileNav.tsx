"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Gamepad2, House, LibraryBig, Puzzle, Server, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: House },
  { href: "/discover", label: "Games", icon: Gamepad2 },
  { href: "/mods", label: "Mods", icon: Puzzle },
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/library", label: "Library", icon: LibraryBig },
];

export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const isAdmin = session?.user?.role === "admin";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-sidebar/95 backdrop-blur-md lg:hidden">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[10px] font-semibold",
            isActive(href) ? "text-primary" : "text-muted-foreground"
          )}
        >
          <Icon className="size-5" />
          {label}
        </Link>
      ))}
      {isAdmin && (
        <Link
          href="/admin"
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[10px] font-semibold",
            isActive("/admin") ? "text-primary" : "text-muted-foreground"
          )}
        >
          <Shield className="size-5" />
          Admin
        </Link>
      )}
    </nav>
  );
}
