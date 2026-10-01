import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata("Join Party");

/** Shareable entry point. The existing Friends screen remains the party lobby. */
export default async function PartyLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  await dbConnect();
  const party = await Party.findById(id).select("visibility status").lean();
  if (!party || party.status === "ended") notFound();

  const destination = `/friends?party=${encodeURIComponent(id)}`;
  if (await getFriendsUserId()) redirect(destination);

  const friendsOnly = party.visibility === "friends";
  const signupHref = `/signup?from=party&next=${encodeURIComponent(`/party/${id}`)}`;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(`/party/${id}`)}`;
  return (
    <main className="mx-auto flex min-h-[65vh] max-w-xl flex-col justify-center px-4 py-12 text-center sm:px-6">
      <div className="rounded-2xl border border-border bg-card p-8">
        <h1 className="text-3xl font-extrabold">Join a PlayBound party</h1>
        <p className="mt-4 text-muted-foreground">
          {friendsOnly
            ? "This party is friends-only. Sign up or sign in, then connect with the host as a friend. You can also ask the host to switch the party to Public."
            : "Sign up or sign in to join this party."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={signupHref} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Sign Up</Link>
          <Link href={loginHref} className="rounded-lg border border-border px-5 py-2.5 text-sm font-bold">Sign In</Link>
        </div>
      </div>
    </main>
  );
}
