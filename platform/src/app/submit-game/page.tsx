import type { Metadata } from "next";
import { SubmitGameForm } from "@/components/SubmitGameForm";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Submit a Game",
  description:
    "Know a great free or affordable game that clears the PlayBound Bar? Submit it for assessment against our four published criteria.",
  path: "/submit-game",
});

export default function SubmitGamePage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Submit a game</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Know a great free game or a standout title regularly available for $15 or less? Tell us about it. Submissions are
          reviewed by the team — approved titles are added to the curated catalog manually.
        </p>
      </div>
      <SubmitGameForm />
    </div>
  );
}
