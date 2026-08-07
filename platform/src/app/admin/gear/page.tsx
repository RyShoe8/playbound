import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import dbConnect from "@/lib/db";
import Gear from "@/lib/models/Gear";

export const metadata: Metadata = { title: "Admin · Gear" };

export default async function AdminGearPage() {
  await dbConnect();
  
  // Sort by createdAt descending
  const gearItems = await Gear.find().sort({ createdAt: -1 }).lean();

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Gear</h1>
          <p className="mt-1 text-muted-foreground">
            Manage hardware products and their affiliate links.
          </p>
        </div>
        <Link
          href="/admin/gear/new"
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
        >
          <Plus className="size-4" /> New Gear
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Links</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {gearItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No gear added yet.
                </td>
              </tr>
            ) : (
              gearItems.map((item: any) => (
                <tr key={item.slug} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/gear/${item.slug}`}
                      className="font-semibold hover:underline"
                    >
                      {item.title}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{item.slug}</span>
                  </td>
                  <td className="px-4 py-2.5">{item.category}</td>
                  <td className="px-4 py-2.5">
                    {item.status === "published" ? (
                      <span className="text-play">Published</span>
                    ) : (
                      <span className="text-muted-foreground">Draft</span>
                    )}
                    {item.playboundCertified && (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                        Certified
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {item.affiliateLinks?.length || 0}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/admin/gear/${item.slug}`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}