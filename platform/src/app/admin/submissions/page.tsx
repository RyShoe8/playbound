import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { ArrowLeft, Inbox } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import GameSubmission from "@/lib/models/GameSubmission";
import { SubmissionActions } from "@/components/SubmissionActions";
import { LocalTime } from "@/components/LocalTime";

export const metadata: Metadata = { title: "Game Submissions" };

export default async function AdminSubmissionsPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/");

  let items: {
    _id: { toString(): string };
    title: string;
    website: string;
    githubRepo?: string | null;
    description: string;
    license?: string | null;
    contactEmail: string;
    submitterName?: string | null;
    status: "pending" | "approved" | "rejected";
    adminNotes?: string | null;
    createdAt: Date;
  }[] = [];

  try {
    await dbConnect();
    items = await GameSubmission.find().sort({ createdAt: -1 }).limit(100).lean();
  } catch (err) {
    console.error("Failed to load submissions:", err);
  }

  const pending = items.filter((i) => i.status === "pending");

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Admin
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <Inbox className="size-7 text-primary" /> Game submissions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pending.length} pending · {items.length} total
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No submissions yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={String(item._id)} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold">{item.title}</h2>
                  <a
                    href={item.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {item.website}
                  </a>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                  {item.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {item.submitterName ?? "Anonymous"} · {item.contactEmail}
                {item.license ? ` · ${item.license}` : ""}
                {item.githubRepo ? ` · ${item.githubRepo}` : ""}
                {" · "}
                <LocalTime value={new Date(item.createdAt).toISOString()} />
              </p>
              <SubmissionActions
                item={{
                  _id: String(item._id),
                  title: item.title,
                  website: item.website,
                  githubRepo: item.githubRepo,
                  description: item.description,
                  license: item.license,
                  contactEmail: item.contactEmail,
                  submitterName: item.submitterName,
                  status: item.status,
                  adminNotes: item.adminNotes,
                  createdAt: new Date(item.createdAt).toISOString(),
                }}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
