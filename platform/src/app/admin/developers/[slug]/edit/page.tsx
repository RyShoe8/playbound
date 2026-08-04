import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDeveloper, getDeveloperAdmin } from "@/lib/developers";
import { listAllGames } from "@/lib/catalog";
import { listAllMods } from "@/lib/mods";
import { DeveloperEditorForm } from "@/components/admin/DeveloperEditorForm";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dev = await getDeveloper(slug);
  return { title: `Admin · Edit ${dev?.name ?? slug}` } satisfies Metadata;
}

export default async function EditDeveloperPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dev = await getDeveloperAdmin(slug);
  if (!dev) notFound();

  const [games, mods] = await Promise.all([listAllGames(), listAllMods()]);
  const devGames = games.filter((g) => g.developerSlug === slug);
  const usage = {
    games: devGames.length,
    mods: mods.filter((m) => m.developerSlug === slug).length,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Edit developer</h1>
        <p className="mt-1 text-muted-foreground">{dev.slug}</p>
      </div>

      <DeveloperEditorForm
        mode="edit"
        initial={{
          slug: dev.slug,
          name: dev.name,
          tagline: dev.tagline,
          about: dev.about,
          founded: dev.founded,
          location: dev.location,
          website: dev.website,
          artHue: dev.artHue,
          published: dev.published,
        }}
        usage={usage}
      />

      {devGames.length > 0 && (
        <div className="rounded-xl border border-border">
          <p className="border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Games by this developer
          </p>
          <ul className="divide-y divide-border">
            {devGames.map((g) => (
              <li key={g.slug} className="px-4 py-2.5 text-sm">
                <Link href={`/admin/games/${g.slug}/edit`} className="hover:underline">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
