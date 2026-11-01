import { getServerSession } from "next-auth/next";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Edition from "@/lib/models/Edition";
import { canEditAssignedItem } from "@/lib/developerAccess";
import { AssignedItemEditor } from "@/components/developer/AssignedItemEditor";

export default async function ManageEdition({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?next=/developer");
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) notFound();
  await dbConnect();
  const edition = await Edition.findById(id).lean();
  if (!edition) notFound();
  if (!canEditAssignedItem(session.user, edition)) redirect("/developer");
  return <AssignedItemEditor title={edition.name} endpoint={`/api/developer/editions/${id}`} initial={{
    name: edition.name || "", shortDescription: edition.shortDescription || "", description: edition.description || "",
    website: edition.links?.website || "", heroImage: edition.branding?.heroImage || "",
  }} labels={{ name: "Edition name", shortDescription: "Short description", description: "Description", website: "Website URL", heroImage: "Hero image URL" }} />;
}
