import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { listManageableDevelopers } from "@/lib/developerAccess";
import { StudioProfileEditor } from "./StudioProfileEditor";
import { Building2, ArrowLeft } from "lucide-react";

export default async function EditStudioProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login?next=/developer/profile/edit");
  }

  const developers = await listManageableDevelopers(session.user.id);

  if (developers.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border border-border bg-card p-8 text-center">
        <Building2 className="mx-auto size-10 text-muted-foreground/50" />
        <h1 className="text-lg font-bold">No Studio Profile Linked</h1>
        <p className="text-xs text-muted-foreground leading-relaxed">
          You have not yet claimed or been assigned a developer studio profile.
          If your studio is already on PlayBound, submit a quick claim to get verified.
        </p>
        <div className="pt-4 flex justify-center gap-3">
          <Link
            href="/developer"
            className="rounded-lg border border-border bg-secondary px-4 py-2 text-xs font-bold"
          >
            Dashboard
          </Link>
          <Link
            href="/developer/claim"
            className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
          >
            Claim Studio Profile
          </Link>
        </div>
      </div>
    );
  }

  const primaryStudio = developers[0] as Record<string, any>;
  const serializableStudio = {
    slug: String(primaryStudio.slug),
    name: String(primaryStudio.name),
    tagline: String(primaryStudio.tagline || ""),
    about: String(primaryStudio.about || ""),
    founded: Number(primaryStudio.founded) || 0,
    location: String(primaryStudio.location || ""),
    website: String(primaryStudio.website || ""),
    artHue: Number(primaryStudio.artHue) || 210,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/developer"
          className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Edit Studio Profile</h1>
          <p className="text-xs text-muted-foreground">
            Manage public details for <span className="font-semibold text-foreground">{serializableStudio.name}</span>
          </p>
        </div>
      </div>

      <StudioProfileEditor studio={serializableStudio} />
    </div>
  );
}
