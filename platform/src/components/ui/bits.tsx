import Link from "next/link";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function Avatar({
  name,
  hue,
  size = "md",
  className,
}: {
  name: string;
  hue: number;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = { sm: "size-7 text-xs", md: "size-9 text-sm", lg: "size-12 text-base", xl: "size-20 text-2xl" };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        sizes[size],
        className
      )}
      style={{
        background: `linear-gradient(135deg, oklch(0.55 0.18 ${hue}), oklch(0.4 0.16 ${hue + 40}))`,
      }}
    >
      {name.charAt(0).toUpperCase()}
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

export function StatTile({
  label,
  value,
  hint,
  href,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  trend?: { value: number | string; label?: string };
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {trend && (
          <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
            vs {trend.value} {trend.label || "prev"}
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-card/80"
      >
        {inner}
      </Link>
    );
  }
  return <div className="rounded-xl border border-border bg-card p-4">{inner}</div>;
}

export function EmptyHint({ icon: Icon = Users, children }: { icon?: typeof Users; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
      <Icon className="size-6" />
      {children}
    </div>
  );
}
