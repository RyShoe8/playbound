"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, FolderOpen, Play, Puzzle, Trash2 } from "lucide-react";
import {
  launcherOpenModFolderUrl,
  launcherPlayModUrl,
  launcherUninstallModUrl,
} from "@/lib/launcher";
import { cn } from "@/lib/utils";

export type LibraryModItem = { slug: string; title: string };

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
              <div className="flex flex-wrap items-center gap-1">
                <a
                  href={launcherPlayModUrl(m.slug)}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-play px-2 py-0.5 text-[10px] font-bold text-play-foreground hover:brightness-110"
                  title={`Play ${m.title}`}
                >
                  <Play className="size-2.5 fill-current" /> Play
                </a>
                <a
                  href={launcherOpenModFolderUrl(m.slug)}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground hover:bg-secondary/70"
                  title="Open mod folder"
                >
                  <FolderOpen className="size-2.5" /> Folder
                </a>
                <a
                  href={launcherUninstallModUrl(m.slug)}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive hover:bg-destructive/25"
                  title="Remove mod"
                >
                  <Trash2 className="size-2.5" /> Uninstall
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
