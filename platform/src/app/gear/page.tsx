import Link from "next/link";
import type { Metadata } from "next";
import dbConnect from "@/lib/db";
import Gear from "@/lib/models/Gear";
import { GearCard } from "@/components/gear/GearCard";

export const metadata: Metadata = {
  title: "Playbound Gear · Hardware & Accessories",
  description: "Curated gaming hardware recommendations integrated with your game library.",
};

export default async function GearDirectoryPage() {
  await dbConnect();
  
  // Find all published gear
  const allGear = await Gear.find({ status: "published" }).lean();
  
  // Group by category
  const grouped: Record<string, any[]> = {};
  for (const item of allGear) {
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category].push(item);
  }

  const categories = Object.keys(grouped).sort();

  return (
    <div className="space-y-12 px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <header className="text-center space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Gear</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Hardware recommendations driven by the games you actually play. Playbound Certified and tested by the community.
        </p>
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
