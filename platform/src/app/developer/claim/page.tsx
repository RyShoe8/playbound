import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { DeveloperClaimForm } from "./DeveloperClaimForm";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default async function ClaimPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login?next=/developer/claim");
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/developer"
          className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Claim Game or Studio</h1>
          <p className="text-xs text-muted-foreground">
            Connect an existing PlayBound page to your developer account.
          </p>
        </div>
      </div>

      <DeveloperClaimForm userEmail={session.user.email || ""} />
    </div>
  );
}
