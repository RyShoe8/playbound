import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { BookOpen, LogIn, MessagesSquare, Star } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import GuidePost from "@/lib/models/GuidePost";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import { getGame } from "@/lib/catalog";
import { Avatar, EmptyHint, SectionHeader, StatTile } from "@/components/ui/bits";
import { ProfileSettings } from "@/components/ProfileSettings";
import { ConnectedAccounts } from "@/components/ConnectedAccounts";
import { SignOutButton } from "@/components/SignOutButton";
import User from "@/lib/models/User";
import Friend from "@/lib/models/Friend";

export const metadata: Metadata = {
  title: "Profile",
  // Personal / auth route — must never be indexed.
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <LogIn className="size-10 text-primary" />
        <h1 className="text-2xl font-extrabold">Sign in to view your profile</h1>
        <Link
          href="/login?callbackUrl=/profile"
          className="mt-2 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
        >
          Sign In
        </Link>
        <Link href="/signup" className="text-sm font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </div>
    );
  }

  const userId = session.user.id;
  let reviews: { gameSlug: string; title: string; createdAt: Date }[] = [];
  let guides: { gameSlug: string; title: string; createdAt: Date }[] = [];
  let posts: { gameSlug: string; title: string; slug: string; createdAt: Date }[] = [];
  let community = { topicCount: 0, replyCount: 0, helpfulCount: 0 };
  let googleConnected = false;
  let friendsCount = 0;
  let pendingRequestsCount = 0;

  try {
    await dbConnect();
    const [r, g, p, user, fCount, pCount] = await Promise.all([
      Review.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
      GuidePost.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
      DiscussionTopic.find({ authorId: userId, status: { $ne: "removed" } })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      User.findById(userId).select("community connectedAccounts authProviders").lean(),
      Friend.countDocuments({
        $or: [{ requesterId: userId }, { recipientId: userId }],
        status: "accepted",
      }),
      Friend.countDocuments({
        recipientId: userId,
        status: "pending",
      }),
    ]);
    reviews = r;
    guides = g;
    posts = p.map((t) => ({
      gameSlug: t.gameSlug,
      title: t.title,
      slug: t.slug,
      createdAt: t.createdAt,
    }));
    if (user?.community) {
      community = {
        topicCount: user.community.topicCount ?? 0,
        replyCount: user.community.replyCount ?? 0,
        helpfulCount: user.community.helpfulCount ?? 0,
      };
    }
    if (user?.authProviders?.includes("google")) {
      googleConnected = true;
    }
    friendsCount = fCount ?? 0;
    pendingRequestsCount = pCount ?? 0;
  } catch (err) {
    console.error("Failed to load profile activity:", err);
  }

  return (
    <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-border">
        <div className="h-28 bg-gradient-to-r from-primary/40 via-primary/15 to-transparent sm:h-36" />
        <div className="bg-card px-6 pb-6">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <Avatar name={session.user.username} hue={265} size="xl" className="ring-4 ring-card" />
            <div className="min-w-0 flex-1 pt-4">
              <h1 className="text-2xl font-extrabold tracking-tight">{session.user.username}</h1>
              <p className="text-sm text-muted-foreground">{session.user.email}</p>
            </div>
            {session.user.role === "admin" && (
              <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">Admin</span>
            )}
            <SignOutButton className="ml-auto rounded-full border border-border bg-secondary px-4 py-1.5 hover:bg-secondary/70" />
          </div>
        </div>
      </section>

      <ProfileSettings
        initialUsername={session.user.username}
        email={session.user.email ?? ""}
      />

      <section>
        <SectionHeader title="Friends" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <StatTile label="Friends" value={String(friendsCount)} />
          <StatTile label="Pending Requests" value={String(pendingRequestsCount)} />
        </div>
      </section>

      <ConnectedAccounts googleConnected={googleConnected} />

      <section>
        <SectionHeader title="Your Contributions" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Reviews" value={String(reviews.length)} />
          <StatTile label="Guides" value={String(guides.length)} />
          <StatTile label="Topics" value={String(community.topicCount || posts.length)} />
          <StatTile label="Helpful" value={String(community.helpfulCount)} />
        </div>
        {community.replyCount > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {community.replyCount} replies across discussions
          </p>
        )}
      </section>

      {reviews.length + guides.length + posts.length > 0 ? (
        <section>
          <SectionHeader title="Recent Activity" />
          <div className="space-y-2">
            {(
              await Promise.all(
                [
                  ...reviews.map((r) => ({ icon: Star, kind: "review" as const, slug: undefined as string | undefined, ...r })),
                  ...guides.map((g) => ({ icon: BookOpen, kind: "guide" as const, slug: undefined as string | undefined, ...g })),
                  ...posts.map((p) => ({ icon: MessagesSquare, kind: "post" as const, ...p })),
                ]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map(async (item, i) => {
                    const game = await getGame(item.gameSlug);
                    const href =
                      item.kind === "post" && item.slug
                        ? `/games/${item.gameSlug}/discussion/${item.slug}`
                        : `/games/${item.gameSlug}?tab=${item.kind === "review" ? "reviews" : item.kind === "guide" ? "guides" : "discussion"}`;
                    return (
                      <Link
                        key={i}
                        href={href}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                      >
                        <item.icon className="size-4 shrink-0 text-primary" />
                        <p className="min-w-0 flex-1 truncate text-sm">
                          &ldquo;{item.title}&rdquo; on {game?.title ?? item.gameSlug}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </Link>
                    );
                  })
              )
            )}
          </div>
        </section>
      ) : (
        <EmptyHint>You haven&apos;t posted anything yet. Visit a game page to write your first review.</EmptyHint>
      )}
    </div>
  );
}
