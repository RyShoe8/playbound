import type { Metadata } from "next";
import { getModClassificationTree } from "@/lib/modClassifications";
import { ModClassificationsManager } from "@/components/admin/ModClassificationsManager";

export const metadata: Metadata = {
  title: "Admin · Mod Classifications",
  description: "Hierarchical taxonomy management for PlayBound mods",
};

export default async function AdminModClassificationsPage() {
  const { tree, flat } = await getModClassificationTree(true);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Mod Classifications</h1>
        <p className="mt-1 text-muted-foreground">
          Manage the hierarchical taxonomy used to organize, tag, and filter mods across PlayBound.
        </p>
      </div>

      <ModClassificationsManager initialTree={tree} initialFlat={flat} />
    </div>
  );
}
