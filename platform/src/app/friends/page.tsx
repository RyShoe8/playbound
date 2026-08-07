import { Metadata } from "next";
import { FriendsView } from "@/components/friends/FriendsView";

export const metadata: Metadata = {
  title: "Friends",
  description: "See who's playing and manage friend requests.",
};

export default function FriendsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Friends</h1>
        <p className="mt-2 text-muted-foreground">
          See who&apos;s playing and manage friend requests.
        </p>
      </div>
      <FriendsView />
    </div>
  );
}
