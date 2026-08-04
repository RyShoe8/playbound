import type { Metadata } from "next";
import { DeveloperEditorForm } from "@/components/admin/DeveloperEditorForm";

export const metadata: Metadata = { title: "Admin · New developer" };

export default function NewDeveloperPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight">New developer</h1>
      <p className="text-sm text-muted-foreground">
        Once saved, this team becomes selectable in the Developer dropdown on every game and mod.
      </p>
      <DeveloperEditorForm
        mode="create"
        initial={{
          slug: "",
          name: "",
          tagline: "",
          about: "",
          founded: 0,
          location: "",
          website: "",
          artHue: 210,
          published: true,
        }}
      />
    </div>
  );
}
