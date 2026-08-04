"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Gamepad2 } from "lucide-react";

const tabs = [
  { href: "/admin/analytics", label: "Overview", icon: Activity, exact: true },
  { href: "/admin/analytics/gameplay", label: "Gameplay", icon: Gamepad2 },
];

export function AnalyticsSubNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-border/50 bg-card/20">
      <div className="flex gap-1 px-4 py-1.5 sm:px-6 lg:px-8">
        {tabs.map(({ href, label, icon: Icon, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="size-3" />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
