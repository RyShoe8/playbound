import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import dbConnect from "@/lib/db";
import Gear from "@/lib/models/Gear";
import { GearCard } from "@/components/gear/GearCard";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema } from "@/components/JsonLd";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const name = category.charAt(0).toUpperCase() + category.slice(1);
  return pageMetadata({
    title: `${name} — Gaming ${name} We Recommend`,
    description: `Tested ${category} picks from PlayBound, matched to the games you already play. What each one is good at, and who it is not for.`,
    path: `/gear/${category}`,
  });
}

export default async function GearCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  await dbConnect();

  // Mongoose case-insensitive query or just mapping since categories are finite
  const items = await Gear.find({
    category: new RegExp(`^${category}$`, "i"),
    status: "published",
  }).lean();

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
