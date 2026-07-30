import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { developers } from "@/lib/data";
import { listAllGames } from "@/lib/catalog";
import { getModAdmin } from "@/lib/mods";
import type { ModPayload } from "@/lib/modPayload";
import { ModEditorForm } from "@/components/admin/ModEditorForm";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Admin · Edit mod ${slug}` } satisfies Metadata;
}

export default async function AdminEditModPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await getModAdmin(slug);
  if (!doc) notFound();

  const games = await listAllGames();
  const initial: ModPayload = {
    slug: String(doc.slug),
    title: String(doc.title),
    tagline: String(doc.tagline),
    description: String(doc.description),
    baseGameSlug: String(doc.baseGameSlug),
    developerSlug: String(doc.developerSlug),
    developerName: doc.developerName ? String(doc.developerName) : null,
    license: String(doc.license),
    releaseYear: Number(doc.releaseYear),
    sizeMB: Number(doc.sizeMB),
    website: String(doc.website),
    githubRepo: doc.githubRepo ? String(doc.githubRepo) : null,
    downloadKind: (doc.downloadKind as ModPayload["downloadKind"]) || "github-zip",
    assetPattern: doc.assetPattern ? String(doc.assetPattern) : null,
    directUrl: doc.directUrl ? String(doc.directUrl) : null,
    installRelativePath: String(doc.installRelativePath ?? "mods"),
    art: doc.art as ModPayload["art"],
    coverImage: doc.coverImage ? String(doc.coverImage) : null,
    screenshots: (doc.screenshots as string[]) ?? [],
    published: Boolean(doc.published),
    managedBy: (doc.managedBy as ModPayload["managedBy"]) || "admin",
    ownerUserId: doc.ownerUserId ? String(doc.ownerUserId) : null,
    // Editorial depth — installSteps and faq are auto-derived on save, the
    // prose fields gate publishing.
    longDescription: doc.longDescription ? String(doc.longDescription) : undefined,
    whatItChanges: doc.whatItChanges ? String(doc.whatItChanges) : undefined,
    compatibility: doc.compatibility ? String(doc.compatibility) : undefined,
    installSteps: (doc.installSteps as ModPayload["installSteps"]) ?? [],
    faq: (doc.faq as ModPayload["faq"]) ?? [],
  };

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Edit {initial.title}</h1>
        <p className="mt-1 text-muted-foreground">Published mods appear on the base game&apos;s Mods tab.</p>
      </div>
      <ModEditorForm
        mode="edit"
        initial={initial}
        developers={developers.map((d) => ({ slug: d.slug, name: d.name }))}
        games={games.map((g) => ({ slug: g.slug, title: g.title }))}
      />
    </div>
  );
}
