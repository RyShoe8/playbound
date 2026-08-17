"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, FolderOpen, Play, Puzzle, Trash2 } from "lucide-react";
import {
  launcherOpenModFolderUrl,
  launcherPlayModUrl,
  launcherUninstallModUrl,
} from "@/lib/launcher";
import { startPcUninstall } from "@/lib/watchLibraryGone";
import { cn } from "@/lib/utils";

export type LibraryModItem = { slug: string; title: string };

function ModRowActions({ slug, title }: { slug: string; title: string }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [hidden, setHidden] = useState(false);
  const stopWatch = useRef<(() => void) | null>(null);

  useEffect(() => () => stopWatch.current?.(), []);

  async function removeFromLibrary() {
    if (removing) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/library/mods?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setRemoving(false);
        return;
      }
      setHidden(true);
      router.refresh();
    } catch {
      setRemoving(false);
    }
  }

  function uninstallFromPc() {
    stopWatch.current?.();
    stopWatch.current = startPcUninstall({
      kind: "mod",
      slug,
      deepLink: launcherUninstallModUrl(slug),
      onGone: () => {
        setHidden(true);
        router.refresh();
      },
    });
  }

  if (hidden) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <a
        href={launcherPlayModUrl(slug)}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-play px-2 py-0.5 text-[10px] font-bold text-play-foreground hover:brightness-110"
        title={`Play ${title}`}
      >
        <Play className="size-2.5 fill-current" /> Play
      </a>
      <a
        href={launcherOpenModFolderUrl(slug)}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground hover:bg-secondary/70"
        title="Open mod folder"
      >
        <FolderOpen className="size-2.5" /> Folder
      </a>
      <button
        type="button"
        disabled={removing}
        onClick={() => void removeFromLibrary()}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive hover:bg-destructive/25 disabled:opacity-50"
        title="Remove from library"
      >
        <Trash2 className="size-2.5" /> {removing ? "…" : "Remove"}
      </button>
      <button
        type="button"
        onClick={uninstallFromPc}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground hover:bg-secondary/70"
        title="Uninstall from this PC via the PlayBound app"
      >
        Uninstall from PC
      </button>
    </div>
  );
}

export function LibraryModsDisclosure({ mods }: { mods: LibraryModItem[] }) {
  const [open, setOpen] = useState(false);
  if (mods.length === 0) return null;

  return (
    <div className="w-full px-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-1 rounded-lg px-1 py-1 text-left text-[11px] font-bold text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1">
          <Puzzle className="size-3 text-primary" />
          Mods ({mods.length})
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ul className="mt-1 space-y-1 border-l border-border pl-2">
          {mods.map((m) => (
            <li key={m.slug} className="flex min-w-0 flex-col gap-1">
              <Link
                href={`/mods/${m.slug}`}
                className="min-w-0 truncate text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              >
                {m.title}
              </Link>
              <ModRowActions slug={m.slug} title={m.title} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
