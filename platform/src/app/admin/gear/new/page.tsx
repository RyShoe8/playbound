import type { Metadata } from "next";
import { GearEditorForm } from "@/components/admin/GearEditorForm";

export const metadata: Metadata = { title: "Admin · New Gear" };

export default function NewGearPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">New Gear</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Paste an affiliate link to start — we fill title, description, images, and price when the
          store page exposes them. Add more store links afterward for price comparison, then tidy
          the draft before publishing.
        </p>
      </div>
      <GearEditorForm
        mode="create"
        initial={{
          slug: "",
          title: "",
          category: "Controllers",
          description: "",
          playboundCertified: false,
          coverImage: null,
          screenshots: [],
          platforms: [],
          bestFor: [],
          status: "draft",
          affiliateLinks: [],
        }}
      />
    </div>
  );
}
