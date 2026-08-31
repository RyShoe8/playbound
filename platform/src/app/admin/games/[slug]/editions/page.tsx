import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { getGame } from "@/lib/catalog";
import { listAllEditionsForGame, deriveVirtualEdition, editionSource } from "@/lib/editions";
import { EDITION_STATUS_LABELS, EDITION_TYPE_LABELS, VERIFICATION_LABELS } from "@/lib/editionTypes";
import { EditionReorderList } from "@/components/admin/EditionReorderList";
import { MaterializeEditionsButton } from "@/components/admin/MaterializeEditionsButton";
import { SwgOneClickInstallButton } from "@/components/admin/SwgOneClickInstallButton";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Admin · ${slug} editions` } satisfies Metadata;
}

export default async function AdminGameEditionsPage({
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

  const editions = await listAllEditionsForGame(slug);
  const virtual = editions.length === 0 ? deriveVirtualEdition(game) : null;

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
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Editions</h1>
          <p className="mt-1 text-muted-foreground">
            Different ways to play {game.title} — official client, community servers, remasters.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {game.slug === "star-wars-galaxies" && <SwgOneClickInstallButton />}
          <MaterializeEditionsButton gameSlug={game.slug} />
          <Link
            href={`/admin/games/${game.slug}/editions/new`}
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
          >
            <Plus className="size-4" /> New edition
          </Link>
        </div>
      </div>

      {virtual && (
        <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm">
          <p className="font-semibold">No editions defined — using a generated Official edition</p>
          <p className="mt-1 text-muted-foreground">
            {game.title} currently shows a single &ldquo;{virtual.name}&rdquo; edition built from the
            game itself ({virtual.installMethod.replace(/_/g, " ")}). The game page hides the
            editions section entirely until you add a real one, so nothing changes for readers
            until then.
          </p>
        </div>
      )}

      {editions.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-3 font-semibold">Edition</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Install</th>
                  <th className="px-4 py-3 font-semibold">Stored in</th>
                  <th className="px-4 py-3 font-semibold">Certification</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Visibility</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {editions.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/games/${game.slug}/editions/${e.id}/edit`}
                        className="font-semibold hover:underline"
                      >
                        {e.name}
                      </Link>
                      {e.isDefault && (
                        <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          Default
                        </span>
                      )}
                      <span className="block text-xs text-muted-foreground">{e.slug}</span>
                    </td>
                    <td className="px-4 py-2.5">{EDITION_TYPE_LABELS[e.type]}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {e.installMethod.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-2.5">
                      {editionSource(e.id) === "seed" ? (
                        <span
                          className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground"
                          title="Served from the seed file. Saving any change creates the database row."
                        >
                          Seed
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Database</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{VERIFICATION_LABELS[e.verificationLevel]}</td>
                    <td className="px-4 py-2.5">{EDITION_STATUS_LABELS[e.status]}</td>
                    <td className="px-4 py-2.5">
                      {e.visibility === "public" ? (
                        <span className="text-play">Public</span>
                      ) : (
                        <span className="text-muted-foreground">{e.visibility}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/games/${game.slug}/editions/${e.slug}`}
                        className="mr-3 text-xs font-semibold text-muted-foreground hover:underline"
                      >
                        View
                      </Link>
                      <Link
                        href={`/admin/games/${game.slug}/editions/${e.id}/edit`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editions.length > 1 && (
            <EditionReorderList
              gameSlug={game.slug}
              editions={editions.map((e) => ({ id: e.id, name: e.name }))}
            />
          )}
        </>
      )}
    </div>
  );
}
