import type { Metadata } from "next";
import { notFound } from "next/navigation";
import dbConnect from "@/lib/db";
import Gear from "@/lib/models/Gear";
import { GearEditorForm } from "@/components/admin/GearEditorForm";

export const metadata: Metadata = { title: "Admin · Edit Gear" };

export default async function EditGearPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await dbConnect();
  const gear = await Gear.findOne({ slug }).lean();

  if (!gear) {
    notFound();
  }

  // Mongoose _id needs to be removed for passing as prop or mapped to string if needed.
  // For safety, we remap it to a clean object matching the draft type.
  const initial = {
    slug: gear.slug,
    title: gear.title,
    category: gear.category,
    description: gear.description,
    manufacturer: gear.manufacturer ?? null,
    playboundCertified: gear.playboundCertified,
    coverImage: gear.coverImage,
    screenshots: gear.screenshots || [],
    videos: gear.videos || [],
    platforms: gear.platforms || [],
    bestFor: gear.bestFor || [],
    status: gear.status,
    affiliateLinks: gear.affiliateLinks || [],
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Edit Gear</h1>
      <GearEditorForm mode="edit" initial={initial as any} />
    </div>
  );
}
