import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listAllMods } from "@/lib/mods";

export const metadata: Metadata = { title: "Admin · Mods" };

export default async function AdminModsPage() {
  const mods = await listAllMods();

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Mods</h1>
          <p className="mt-1 text-muted-foreground">
            Catalog mods tied to a base game. Launcher installs into the detected game folder.
          </p>
        </div>
        <Link
          href="/admin/mods/new"
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
        >
          <Plus className="size-4" /> New mod
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Mod</th>
              <th className="px-4 py-3 font-semibold">Base game</th>
              <th className="px-4 py-3 font-semibold">Install</th>
              <th className="px-4 py-3 font-semibold">Version</th>
              <th className="px-4 py-3 font-semibold">Published</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {mods.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No mods yet. Create one to show on a game&apos;s Mods tab.
                </td>
              </tr>
            ) : (
              mods.map((m) => (
                <tr key={m.slug} className="border-b border-border bg-card last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{m.title}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.baseGameSlug}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        m.downloadKind === "external"
                          ? "text-muted-foreground"
                          : "font-semibold text-primary"
                      }
                    >
                      {m.downloadKind === "external" ? "External link" : "One-click"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                    {m.detectedVersion || "—"}
                    {m.versionCheckStatus ? (
                      <span className="ml-1 text-xs uppercase">({m.versionCheckStatus})</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={m.published ? "font-semibold text-primary" : "text-muted-foreground"}>
                      {m.published ? "Yes" : "Draft"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/admin/mods/${m.slug}/edit`} className="font-semibold text-primary hover:underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
