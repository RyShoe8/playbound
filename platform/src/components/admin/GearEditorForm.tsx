"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

const label = "block text-xs font-semibold text-muted-foreground";
const field =
  "mt-1 h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
const area =
  "mt-1 w-full resize-y rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

export type GearDraft = {
  slug: string;
  title: string;
  category: string;
  description: string;
  playboundCertified: boolean;
  coverImage: string | null;
  platforms: string[];
  bestFor: string[];
  status: "draft" | "published";
  affiliateLinks: { retailer: string; url: string; price: string | null; shipping: string | null; isActive: boolean }[];
};

export function GearEditorForm({ mode, initial }: { mode: "create" | "edit"; initial: GearDraft }) {
  const router = useRouter();
  const [form, setForm] = useState<GearDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function patch<K extends keyof GearDraft>(key: K, value: GearDraft[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addAffiliateLink() {
    patch("affiliateLinks", [
      ...form.affiliateLinks,
      { retailer: "Amazon", url: "", price: null, shipping: null, isActive: true },
    ]);
  }

  function updateAffiliateLink(index: number, key: string, value: any) {
    const next = [...form.affiliateLinks];
    next[index] = { ...next[index], [key]: value };
    patch("affiliateLinks", next);
  }

  function removeAffiliateLink(index: number) {
    patch(
      "affiliateLinks",
      form.affiliateLinks.filter((_, i) => i !== index)
    );
  }

  function handleListChange(key: "platforms" | "bestFor", val: string) {
    patch(
      key,
      val.split(",").map((s) => s.trim()).filter(Boolean)
    );
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(mode === "create" ? "/api/admin/gear" : `/api/admin/gear/${initial.slug}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Save failed");
        setBusy(false);
        return;
      }
      router.push("/admin/gear");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete the "${form.title}" gear item?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/gear/${initial.slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Delete failed");
        setBusy(false);
        return;
      }
      router.push("/admin/gear");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Title</label>
          <input
            required
            value={form.title}
            onChange={(e) => patch("title", e.target.value)}
            className={field}
            placeholder="e.g. Xbox Wireless Controller"
          />
        </div>
        <div>
          <label className={label}>Slug</label>
          <input
            required
            value={form.slug}
            onChange={(e) => patch("slug", e.target.value)}
            className={field}
            disabled={mode === "edit"}
            placeholder="xbox-wireless-controller"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Category</label>
          <PremiumSelect
            value={form.category}
            onChange={(e) => patch("category", e.target.value)}
            className={field}
          >
            <option value="Controllers">Controllers</option>
            <option value="Mobile">Mobile</option>
            <option value="TV">TV</option>
            <option value="Audio">Audio</option>
            <option value="Accessories">Accessories</option>
            <option value="Storage">Storage</option>
            <option value="Mouse">Mouse</option>
            <option value="Keyboard">Keyboard</option>
          </PremiumSelect>
        </div>
        <div>
          <label className={label}>Cover Image URL (optional)</label>
          <input
            value={form.coverImage || ""}
            onChange={(e) => patch("coverImage", e.target.value)}
            className={field}
            placeholder="/gear/xbox-controller.jpg"
          />
        </div>
      </div>

      <div>
        <label className={label}>Description</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => patch("description", e.target.value)}
          className={area}
          placeholder="Detailed editorial review..."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Platforms (comma separated)</label>
          <input
            value={form.platforms.join(", ")}
            onChange={(e) => handleListChange("platforms", e.target.value)}
            className={field}
            placeholder="Windows, macOS, Xbox"
          />
        </div>
        <div>
          <label className={label}>Best For Genres (comma separated)</label>
          <input
            value={form.bestFor.join(", ")}
            onChange={(e) => handleListChange("bestFor", e.target.value)}
            className={field}
            placeholder="FPS, Platformer"
          />
        </div>
      </div>

      <div className="flex gap-6 pt-2">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={form.playboundCertified}
            onChange={(e) => patch("playboundCertified", e.target.checked)}
            className="size-4"
          />
          Playbound Certified
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={form.status === "published"}
            onChange={(e) => patch("status", e.target.checked ? "published" : "draft")}
            className="size-4"
          />
          Published
        </label>
      </div>

      <div className="space-y-4 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Affiliate Links</h3>
          <button
            type="button"
            onClick={addAffiliateLink}
            className="flex items-center gap-1 text-sm font-bold text-primary hover:underline"
          >
            <Plus className="size-4" /> Add Link
          </button>
        </div>

        {form.affiliateLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No affiliate links added.</p>
        ) : (
          <div className="space-y-3">
            {form.affiliateLinks.map((link, i) => (
              <div key={i} className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3">
                <div className="flex-1 min-w-[200px] space-y-2">
                  <div>
                    <label className={label}>Retailer</label>
                    <input
                      value={link.retailer}
                      onChange={(e) => updateAffiliateLink(i, "retailer", e.target.value)}
                      className={field}
                      placeholder="Amazon, Best Buy..."
                    />
                  </div>
                  <div>
                    <label className={label}>URL</label>
                    <input
                      value={link.url}
                      onChange={(e) => updateAffiliateLink(i, "url", e.target.value)}
                      className={field}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="w-32 space-y-2">
                  <div>
                    <label className={label}>Price (optional)</label>
                    <input
                      value={link.price || ""}
                      onChange={(e) => updateAffiliateLink(i, "price", e.target.value)}
                      className={field}
                      placeholder="$59.99"
                    />
                  </div>
                  <div>
                    <label className={label}>Shipping (optional)</label>
                    <input
                      value={link.shipping || ""}
                      onChange={(e) => updateAffiliateLink(i, "shipping", e.target.value)}
                      className={field}
                      placeholder="Prime"
                    />
                  </div>
                </div>
                <div className="flex w-full items-center justify-between pt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={link.isActive}
                      onChange={(e) => updateAffiliateLink(i, "isActive", e.target.checked)}
                      className="size-4"
                    />
                    Live
                  </label>
                  <button
                    type="button"
                    onClick={() => removeAffiliateLink(i)}
                    className="flex items-center gap-1 text-xs text-destructive hover:underline"
                  >
                    <X className="size-3" /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2 pt-4">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Saving…" : mode === "create" ? "Create Gear" : "Save changes"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-full border border-border px-5 py-2 text-sm font-bold text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
