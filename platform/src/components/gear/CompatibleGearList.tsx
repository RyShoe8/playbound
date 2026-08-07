import dbConnect from "@/lib/db";
import GearRecommendation from "@/lib/models/GearRecommendation";
import Gear from "@/lib/models/Gear";
import { GearCard } from "./GearCard";

export async function CompatibleGearList({ gameSlug, gameTitle }: { gameSlug: string; gameTitle: string }) {
  await dbConnect();
  
  // Find all recommendations for this game
  const recommendations = await GearRecommendation.find({ gameSlug }).lean();
  
  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  // Fetch the actual gear items
  const gearSlugs = recommendations.map((r: any) => r.gearSlug);
  const gearItems = await Gear.find({ slug: { $in: gearSlugs }, status: "published" }).lean();

  if (gearItems.length === 0) {
    return null;
  }

  // Map them together
  const list = gearItems.map((gear: any) => {
    const rec = recommendations.find((r: any) => r.gearSlug === gear.slug);
    return {
      gear,
      rank: rec?.rank,
      notes: rec?.notes,
    };
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Recommended Gear for {gameTitle}</h2>
      <div className="grid gap-4">
        {list.map((item: any) => (
          <GearCard key={item.gear.slug} gear={item.gear} rank={item.rank} notes={item.notes} />
        ))}
      </div>
    </div>
  );
}
