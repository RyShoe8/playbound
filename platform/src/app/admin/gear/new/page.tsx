import type { Metadata } from "next";
import { GearEditorForm } from "@/components/admin/GearEditorForm";

export const metadata: Metadata = { title: "Admin · New Gear" };

export default function NewGearPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight">New Gear</h1>
      <GearEditorForm
        mode="create"
        initial={{
          slug: "",
          title: "",
          category: "Controllers",
          description: "",
          playboundCertified: false,
          coverImage: null,
          platforms: [],
          bestFor: [],
          status: "draft",
          affiliateLinks: [],
        }}
      />
    </div>
  );
}
