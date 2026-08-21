import Link from "next/link";
import type { Metadata } from "next";
import { GearCard } from "@/components/gear/GearCard";
import { groupGearByCategory } from "@/lib/gear";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema } from "@/components/JsonLd";

export const metadata: Metadata = pageMetadata({
  title: "Gear — Hardware & Accessories",
  description:
    "Curated gaming hardware, tested and matched to the games in your PlayBound library. Headsets, controllers, keyboards and more, with what each one is actually good for.",
  path: "/gear",
});

export default async function GearDirectoryPage() {
  const grouped = await groupGearByCategory();
  const categories = Object.keys(grouped).sort();

  return (
    <div className="space-y-12 px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd data={graph(breadcrumbSchema([{ name: "Gear", path: "/gear" }]))} />
      <header className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Gear</h1>
      </header>

      {categories.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          Check back soon for our first batch of recommendations.
        </div>
      ) : (
        <div className="space-y-16">
          {categories.map((category) => (
            <section key={category}>
              <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
                <h2 className="text-2xl font-bold">{category}</h2>
                <Link
                  href={`/gear/${category.toLowerCase()}`}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  View all {category} →
                </Link>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                {grouped[category].slice(0, 4).map((gear: any) => (
                  <GearCard key={gear.slug} gear={gear} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
