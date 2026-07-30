import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { suggestUsername } from "@/lib/oauthUser";
import { privateMetadata } from "@/lib/seo";
import { UsernamePicker } from "@/components/UsernamePicker";

export const metadata = privateMetadata("Choose your username");

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // Already claimed — nothing to do here.
  if (!session.user.needsUsername) redirect("/profile");

  const { next } = await searchParams;

  return (
    <UsernamePicker
      suggestion={suggestUsername(session.user.name, session.user.email)}
      email={session.user.email ?? ""}
      // Only same-origin paths, so ?next= cannot be used as an open redirect.
      next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/profile"}
    />
  );
}
