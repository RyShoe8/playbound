import { Check, Crown, Download, Loader2, LogOut, Phone, Play, Users, X } from "lucide-react";
import type { PartyActionIcon, PartyActionTone } from "@/lib/playTogether/partyActions";

/**
 * The web half of the party action bar's shared vocabulary.
 *
 * partyActions decides which icon and which colour role each button gets; this
 * turns those names into lucide components and Tailwind classes. The launcher
 * has its own half doing the same job with inline SVG and CSS variables. The
 * decision is shared, the rendering is not — an Electron renderer and a React
 * app cannot use one widget, but they can stop disagreeing about which button
 * is the primary one and whether it shows a spinner.
 */

const ICONS: Record<PartyActionIcon, typeof Play> = {
  play: Play,
  loader: Loader2,
  check: Check,
  x: X,
  phone: Phone,
  logout: LogOut,
  crown: Crown,
  users: Users,
  download: Download,
};

export function PartyActionIconView({
  icon,
  className = "size-4",
}: {
  icon: PartyActionIcon | null;
  className?: string;
}) {
  if (!icon) return null;
  const Icon = ICONS[icon];
  if (!Icon) return null;
  // The spinner is the one icon whose meaning depends on motion.
  const spin = icon === "loader" ? " animate-spin" : "";
  const fill = icon === "play" ? " fill-current" : "";
  return <Icon className={`${className}${spin}${fill}`} aria-hidden />;
}

const TONES: Record<PartyActionTone, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  success: "bg-green-600 text-white hover:bg-green-700",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  muted: "bg-muted text-muted-foreground hover:bg-muted/80",
};

/** Full class list for an action-bar button in the given tone. */
export function partyButtonClass(tone: PartyActionTone, extra = ""): string {
  return [
    "flex items-center gap-2 px-4 py-2 rounded-md font-bold text-sm transition-colors disabled:opacity-50",
    TONES[tone] ?? TONES.primary,
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Note colour, matching the launcher's info/error split. */
export function partyNoteClass(tone: "info" | "error"): string {
  return tone === "error"
    ? "text-xs text-destructive self-center"
    : "text-xs text-muted-foreground self-center";
}
