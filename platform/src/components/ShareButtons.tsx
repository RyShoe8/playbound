"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { telemetry } from "@/lib/telemetry";

/**
 * Share a game, edition, mod or event.
 *
 * `compact` is one button for a page's action row: on phones (anything with
 * the Web Share API) it opens the device's own share sheet, which already
 * knows the player's apps; elsewhere it opens a small menu. `row` is the full
 * set of links for further down a page, where a reader who has just finished
 * the description is most likely to pass it on.
 *
 * Links carry utm_source=share so shares are countable without any tracking
 * script on the destination.
 */
type Props = {
  url: string;
  title: string;
  /** Short line to go with the link, e.g. a tagline. */
  text?: string;
  variant?: "compact" | "row";
  /** Telemetry: what is being shared ("game", "edition", "mod", "event"). */
  kind: string;
  slug: string;
  className?: string;
  /** For the compact button on dark hero imagery. */
  tone?: "default" | "onImage";
};

function withShareUtm(url: string, network: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "share");
    u.searchParams.set("utm_medium", network);
    return u.toString();
  } catch {
    return url;
  }
}

function networks(url: string, title: string, text?: string) {
  const line = text ? `${title} — ${text}` : title;
  const at = (n: string) => encodeURIComponent(withShareUtm(url, n));
  return [
    { id: "reddit", label: "Reddit", href: `https://www.reddit.com/submit?url=${at("reddit")}&title=${encodeURIComponent(title)}` },
    { id: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(line)}&url=${at("x")}` },
    { id: "bluesky", label: "Bluesky", href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${line} ${withShareUtm(url, "bluesky")}`)}` },
    { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${at("facebook")}` },
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${line} ${withShareUtm(url, "whatsapp")}`)}` },
  ];
}

export function ShareButtons({ url, title, text, variant = "compact", kind, slug, className, tone = "default" }: Props) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const links = networks(url, title, text);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const shared = (network: string) => void telemetry.track("content_shared", { kind, slug, network });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(withShareUtm(url, "copy"));
      setCopied(true);
      shared("copy");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function nativeOrMenu() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title, text, url: withShareUtm(url, "native") });
        shared("native");
        return;
      } catch {
        // Dismissed or unsupported for this data: fall back to the menu.
      }
    }
    setOpen((v) => !v);
  }

  const pill =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition";
  const pillTone =
    tone === "onImage"
      ? "border-white/25 bg-black/40 text-white backdrop-blur hover:bg-black/60"
      : "border-border bg-background hover:border-primary/50 hover:text-primary";

  if (variant === "row") {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)} aria-label={`Share ${title}`}>
        <span className="mr-1 inline-flex items-center gap-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
          <Share2 className="size-4" /> Share
        </span>
        {links.map((n) => (
          <a key={n.id} className={cn(pill, pillTone)} href={n.href} target="_blank" rel="noopener noreferrer" onClick={() => shared(n.id)} aria-label={`Share on ${n.label}`}>
            {n.label}
          </a>
        ))}
        <button type="button" onClick={() => void copyLink()} className={cn(pill, pillTone)} aria-live="polite">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    );
  }

  return (
    <div ref={wrap} className={cn("relative inline-flex", className)}>
      <button type="button" onClick={() => void nativeOrMenu()} className={cn(pill, pillTone, "h-10 px-4 text-sm")} aria-haspopup="menu" aria-expanded={open}>
        <Share2 className="size-4" /> Share
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-xl">
          {links.map((n) => (
            <a key={n.id} role="menuitem" href={n.href} target="_blank" rel="noopener noreferrer" onClick={() => { shared(n.id); setOpen(false); }} className="block rounded-lg px-3 py-2 hover:bg-secondary">
              {n.label}
            </a>
          ))}
          <button type="button" role="menuitem" onClick={() => void copyLink()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-secondary">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
