import { getServerSession } from "next-auth/next";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import CatalogMod from "@/lib/models/CatalogMod";
import { canEditAssignedItem } from "@/lib/developerAccess";
import { AssignedItemEditor } from "@/components/developer/AssignedItemEditor";

export default async function ManageMod({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?next=/developer");
  const { slug } = await params;
  await dbConnect();
  const mod = await CatalogMod.findOne({ slug }).lean();
  if (!mod) notFound();
  if (!canEditAssignedItem(session.user, mod)) redirect("/developer");
  return <AssignedItemEditor title={mod.title} endpoint={`/api/developer/mods/${encodeURIComponent(slug)}`} initial={{
    title: mod.title || "", tagline: mod.tagline || "", description: mod.description || "",
    website: mod.website || "", coverImage: mod.coverImage || "",
  }} labels={{ title: "Mod name", tagline: "Tagline", description: "Description", website: "Website URL", coverImage: "Cover image URL" }} />;
}
