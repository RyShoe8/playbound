import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GearCard } from "@/components/gear/GearCard";
import { listGearByCategory, resolveGearCategory } from "@/lib/gear";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema } from "@/components/JsonLd";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  /*
   * The real category name, not a capitalised URL segment. An unknown segment
   * 404s in the component below, so titling it from the raw param would only
   * ever produce metadata for a page that does not exist.
   */
  const name = resolveGearCategory(category);
  if (!name) return { title: "Not Found", robots: { index: false, follow: false } };

  return pageMetadata({
    title: `${name} — Gaming ${name} We Recommend`,
    description: `Tested ${name.toLowerCase()} picks from PlayBound, matched to the games you already play. What each one is good at, and who it is not for.`,
    path: `/gear/${name.toLowerCase()}`,
  });
}

export default async function GearCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const items = await listGearByCategory(category);

  if (items.length === 0) {
    notFound();
  }

  const categoryName = items[0].category;

  return (
    <div className="space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          breadcrumbSchema([
            { name: "Gear", path: "/gear" },
            { name: categoryName, path: `/gear/${category.toLowerCase()}` },
          ])
        )}
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/gear" className="hover:text-foreground">Gear</Link>
        <span>/</span>
        <span className="font-semibold text-foreground">{categoryName}</span>
      </div>

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{categoryName}</h1>
        <p className="mt-2 text-muted-foreground">
          The best {categoryName.toLowerCase()} curated by Playbound.
        </p>
      </div>

      <div className="grid gap-6">
        {items.map((gear: any) => (
          <GearCard key={gear.slug} gear={gear} />
        ))}
      </div>
    </div>
  );
}
