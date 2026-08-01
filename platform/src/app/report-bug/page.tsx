import type { Metadata } from "next";
import { ReportBugForm } from "@/components/ReportBugForm";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Report a Bug",
  description: "Tell us about a problem on PlayBound or in the desktop app so we can fix it.",
  path: "/report-bug",
});

export default function ReportBugPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Report a bug</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Found something broken on the site or in the PlayBound app? Send details here — reports go
          straight to the admin queue. You can also report from the app under Settings.
        </p>
      </div>
      <ReportBugForm />
    </div>
  );
}
