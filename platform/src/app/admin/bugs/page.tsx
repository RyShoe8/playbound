import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { ArrowLeft, Bug } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import BugReport from "@/lib/models/BugReport";
import { BUG_REPORT_STATUS_LABELS, type BugReportStatus } from "@/lib/bugReports";
import { BugReportActions } from "@/components/admin/BugReportActions";

export const metadata: Metadata = { title: "Bug reports" };

export default async function AdminBugsPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/");

  let items: {
    _id: { toString(): string };
    title: string;
    description: string;
    source: "website" | "launcher";
    pageUrl?: string | null;
    contactEmail?: string | null;
    submitterName?: string | null;
    launcherVersion?: string | null;
    platform?: string | null;
    status: BugReportStatus;
    adminNotes?: string | null;
    createdAt: Date;
  }[] = [];

  try {
    await dbConnect();
    items = await BugReport.find().sort({ createdAt: -1 }).limit(200).lean();
  } catch (err) {
    console.error("Failed to load bug reports:", err);
  }

  const openCount = items.filter((i) => i.status === "open" || i.status === "reviewing").length;

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Admin
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <Bug className="size-7 text-primary" /> Bug reports
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {openCount} open · {items.length} total
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bug reports yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={String(item._id)} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold">{item.title}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.source}
                    {item.launcherVersion ? ` · app ${item.launcherVersion}` : ""}
                    {item.platform ? ` · ${item.platform}` : ""}
                    {item.pageUrl ? (
                      <>
                        {" · "}
                        <a
                          href={item.pageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-primary hover:underline"
                        >
                          page
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                  {BUG_REPORT_STATUS_LABELS[item.status]}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {item.submitterName ?? "Anonymous"}
                {item.contactEmail ? ` · ${item.contactEmail}` : ""}
                {" · "}
                {new Date(item.createdAt).toLocaleString()}
              </p>
              <BugReportActions
                item={{
                  _id: String(item._id),
                  status: item.status,
                  adminNotes: item.adminNotes,
                }}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
