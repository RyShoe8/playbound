import type { Metadata } from "next";
import { FeedbackForm } from "@/components/FeedbackForm";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Provide Feedback",
  description:
    "Report a bug or send a suggestion for PlayBound, the site or the desktop app — both go straight to the admin queue.",
  path: "/feedback",
});

export default function FeedbackPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Provide feedback</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Found something broken, or have an idea for PlayBound? You can report bugs or provide
          suggestions through the form below — both go straight to the admin queue. You can also
          report from the app under Settings.
        </p>
      </div>
      <FeedbackForm />
    </div>
  );
}
