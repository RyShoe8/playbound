import Link from "next/link";
import { Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PresenceStatus } from "@/lib/data/types";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "play" | "warn" | "outline";
  className?: string;
}) {
  const tones = {
    neutral: "bg-secondary text-secondary-foreground",
    brand: "bg-primary/15 text-primary",
    play: "bg-play/15 text-play",
    warn: "bg-amber-400/15 text-amber-300",
    outline: "border border-border text-muted-foreground",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Rating({ value, count, className }: { value: number; count?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", className)}>
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      <span className="font-semibold">{value.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-muted-foreground">({Intl.NumberFormat("en", { notation: "compact" }).format(count)})</span>
      )}
    </span>
  );
}

export function PlayersOnline({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm text-muted-foreground", className)}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-play opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-play" />
      </span>
      <span className="font-medium text-foreground">{Intl.NumberFormat("en").format(count)}</span> online
    </span>
  );
}

const presenceColor: Record<PresenceStatus, string> = {
  Online: "bg-play",
  Playing: "bg-play",
  "Hosting Server": "bg-sky-400",
  Away: "bg-amber-400",
  "Looking for Group": "bg-primary",
  "Watching Replay": "bg-fuchsia-400",
};

export function Avatar({
  name,
  hue,
  size = "md",
  status,
  className,
}: {
  name: string;
  hue: number;
  size?: "sm" | "md" | "lg" | "xl";
  status?: PresenceStatus;
  className?: string;
}) {
  const sizes = { sm: "size-7 text-xs", md: "size-9 text-sm", lg: "size-12 text-base", xl: "size-20 text-2xl" };
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full font-bold text-white",
          sizes[size]
        )}
        style={{
          background: `linear-gradient(135deg, oklch(0.55 0.18 ${hue}), oklch(0.4 0.16 ${hue + 40}))`,
        }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      {status && (
        <span
          className={cn(
            "absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-background",
            presenceColor[status]
          )}
        />
      )}
    </span>
  );
}

export function SectionHeader({
  title,
  subtitle,
  href,
  linkLabel = "See all",
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="shrink-0 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EmptyHint({ icon: Icon = Users, children }: { icon?: typeof Users; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
      <Icon className="size-6" />
      {children}
    </div>
  );
}
