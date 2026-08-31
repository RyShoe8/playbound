import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { getGame } from "@/lib/catalog";
import { listAllMods } from "@/lib/mods";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Admin · ${slug} mods` } satisfies Metadata;
}

export default async function AdminGameModsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const { slug } = await params;
  const game = await getGame(slug, { includeUnpublished: true });
  if (!game) notFound();

  const mods = (await listAllMods()).filter((m) => m.baseGameSlug === slug);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={`/admin/games/${game.slug}/edit`}
            className="text-sm font-semibold text-muted-foreground hover:underline"
          >
            ← {game.title}
          </Link>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Mods</h1>
          <p className="mt-1 text-muted-foreground">
            Packageable add-ons for {game.title}. Launcher installs into the detected game folder.
          </p>
        </div>
        <Link
          href={`/admin/games/${game.slug}/mods/new`}
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
              <th className="px-4 py-3 font-semibold">Install</th>
              <th className="px-4 py-3 font-semibold">Version</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {mods.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No mods for {game.title} yet. Create one to show on the game&apos;s Mods tab.
                </td>
              </tr>
            ) : (
              mods.map((m) => (
                <tr key={m.slug} className="border-b border-border bg-card last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{m.title}</td>
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
                    <span
                      className={
                        m.status === "published"
                          ? "font-semibold text-primary"
                          : m.status === "testing"
                            ? "font-semibold text-amber-600 dark:text-amber-300"
                            : "text-muted-foreground"
                      }
                    >
                      {m.status === "published"
                        ? "Published"
                        : m.status === "testing"
                          ? "Testing"
                          : "Draft"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/admin/mods/${m.slug}/edit`}
                      className="font-semibold text-primary hover:underline"
                    >
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
