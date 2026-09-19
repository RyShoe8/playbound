"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, CheckCircle2, AlertCircle, Building2, ArrowLeft } from "lucide-react";

type Studio = {
  slug: string;
  name: string;
  tagline?: string;
  about?: string;
  founded?: number;
  location?: string;
  website?: string;
  artHue?: number;
};

export function StudioProfileEditor({ studio }: { studio: Studio }) {
  const router = useRouter();
  const [form, setForm] = useState({
    slug: studio.slug,
    name: studio.name || "",
    tagline: studio.tagline || "",
    about: studio.about || "",
    founded: studio.founded || 0,
    location: studio.location || "",
    website: studio.website || "",
    artHue: studio.artHue || 210,
  });

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);

    try {
      const res = await fetch("/api/developer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", text: data.error || "Failed to update profile" });
        return;
      }

      setStatus({ type: "success", text: "Studio profile updated successfully!" });
      router.refresh();
    } catch {
      setStatus({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {status && (
        <div
          className={`flex items-center gap-2.5 rounded-lg p-3 text-xs font-medium ${
            status.type === "success"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {status.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          {status.text}
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Building2 className="size-4 text-primary" />
          <h2 className="text-sm font-bold tracking-tight">Studio Identity &amp; Bio</h2>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Studio / Team Name</label>
              <input
                type="text"
                required
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Official Website</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                placeholder="https://yourstudio.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground">Tagline</label>
            <input
              type="text"
              maxLength={300}
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              placeholder="Independent game studio building real-time strategy games"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground">About the Studio / Project</label>
            <textarea
              rows={4}
              maxLength={8000}
              value={form.about}
              onChange={(e) => setForm({ ...form, about: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              placeholder="Tell players about your team, philosophy, history, and community..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Location</label>
              <input
                type="text"
                maxLength={200}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                placeholder="e.g. Remote / Stockholm, Sweden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Founded Year</label>
              <input
                type="number"
                min={1970}
                max={2100}
                value={form.founded || ""}
                onChange={(e) => setForm({ ...form, founded: Number(e.target.value) || 0 })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                placeholder="e.g. 2018"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Brand Hue (0–360)</label>
              <input
                type="number"
                min={0}
                max={360}
                value={form.artHue}
                onChange={(e) => setForm({ ...form, artHue: Number(e.target.value) || 210 })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Link
          href="/developer"
          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; Cancel and return to Dashboard
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Save className="size-4" />
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </form>
  );
}
