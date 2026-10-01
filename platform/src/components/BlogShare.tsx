"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

export function BlogShare({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`${title} ${url}`);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  }

  const linkClass = "inline-flex items-center rounded-full border border-border bg-background px-3 py-2 text-xs font-semibold transition hover:border-primary/50 hover:text-primary";

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Share this article">
      <span className="mr-1 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Share2 className="size-4" /> Share</span>
      <a className={linkClass} href={`https://bsky.app/intent/compose?text=${encodedText}`} target="_blank" rel="noopener noreferrer" aria-label="Share on Bluesky">Bluesky</a>
      <a className={linkClass} href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodedUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Share on X">X</a>
      <a className={linkClass} href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook">Facebook</a>
      <button type="button" onClick={() => void copyLink()} className={linkClass} aria-live="polite">
        {copied ? <Check className="mr-1.5 size-3.5" /> : <Copy className="mr-1.5 size-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
