import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { PlayboundCertifiedBadge } from "./PlayboundCertifiedBadge";
import type { GearDraft } from "../admin/GearEditorForm"; // Reusing type for convenience, or we can define it properly

export function GearCard({ gear, rank, notes }: { gear: any; rank?: string | null; notes?: string }) {
  // We can sort affiliate links by some criteria or just show them
  const activeLinks = (gear.affiliateLinks || []).filter((l: any) => l.isActive);

  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 sm:flex-row sm:items-start">
      {gear.coverImage ? (
        <div className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gear.coverImage}
            alt={gear.title}
            className="h-32 w-32 rounded-lg object-cover sm:h-40 sm:w-40"
          />
        </div>
      ) : (
        <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-lg bg-secondary/50 sm:h-40 sm:w-40">
          <span className="text-muted-foreground text-xs uppercase">{gear.category}</span>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          {rank && <span className="text-2xl">{rank}</span>}
          <div className="flex-1 min-w-0">
            <Link href={`/gear/${gear.category.toLowerCase()}/${gear.slug}`} className="hover:underline">
              <h3 className="truncate text-lg font-bold">{gear.title}</h3>
            </Link>
          </div>
          {gear.playboundCertified && <PlayboundCertifiedBadge />}
        </div>
        
        {notes && (
          <p className="mt-2 text-sm font-medium italic text-muted-foreground">"{notes}"</p>
        )}

        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {gear.description}
        </p>

        <div className="mt-auto pt-4 flex flex-wrap items-center gap-2">
          {activeLinks.map((link: any, i: number) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold transition-colors hover:bg-secondary/80"
            >
              <ShoppingCart className="size-4" />
              Buy from {link.retailer}
              {link.price && <span className="font-normal text-muted-foreground ml-1">{link.price}</span>}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
