"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Link2, Plus, X } from "lucide-react";
import { GENRES, GEAR_PLATFORMS, slugifyTitle } from "@/lib/gamePayload";

const label = "block text-xs font-semibold text-muted-foreground";
const field =
  "mt-1 h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
const area =
  "mt-1 w-full resize-y rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

const GENRE_SET = new Set<string>(GENRES);
const GEAR_PLATFORM_SET = new Set<string>(GEAR_PLATFORMS);

export type GearDraft = {
  slug: string;
  title: string;
  category: string;
  description: string;
  manufacturer: string | null;
  playboundCertified: boolean;
  coverImage: string | null;
  screenshots?: string[];
  videos?: string[];
  platforms: string[];
  bestFor: string[];
  status: "draft" | "published";
  affiliateLinks: {
    retailer: string;
    url: string;
    price: string | null;
    shipping: string | null;
    isActive: boolean;
  }[];
};

type ImportPayload = {
  ok: true;
  draft: {
    title: string;
    slug: string;
    description: string;
    category?: string | null;
    coverImage: string | null;
    screenshots: string[];
    manufacturer?: string | null;
    platforms?: string[];
    videos?: string[];
    candidateImages?: string[];
    affiliateLinks: GearDraft["affiliateLinks"];
  };
  retailer: string;
  price: string | null;
  warnings?: string[];
};

function ChipToggle({
  label: chipLabel,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-bold ${
        on ? "bg-primary text-primary-foreground" : "border border-border bg-secondary"
      }`}
    >
      {chipLabel}
    </button>
  );
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function filterKnown(list: string[], allowed: Set<string>): string[] {
  return list.filter((v) => allowed.has(v));
}

function upsertAffiliateLink(
  links: GearDraft["affiliateLinks"],
  incoming: GearDraft["affiliateLinks"][number]
): GearDraft["affiliateLinks"] {
  const byUrl = links.findIndex((l) => l.url === incoming.url);
  if (byUrl >= 0) {
    const next = [...links];
    next[byUrl] = { ...next[byUrl], ...incoming, url: incoming.url };
    return next;
  }
  const byRetailer = links.findIndex(
    (l) => l.retailer.toLowerCase() === incoming.retailer.toLowerCase() && !l.url
  );
  if (byRetailer >= 0) {
    const next = [...links];
    next[byRetailer] = { ...next[byRetailer], ...incoming };
    return next;
  }
  return [...links, incoming];
}

export function GearEditorForm({ mode, initial }: { mode: "create" | "edit"; initial: GearDraft }) {
  const router = useRouter();
  const [form, setForm] = useState<GearDraft>({
    ...initial,
    platforms: filterKnown(initial.platforms, GEAR_PLATFORM_SET),
    bestFor: filterKnown(initial.bestFor, GENRE_SET),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mediaNote, setMediaNote] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importNote, setImportNote] = useState("");
  const [candidateImages, setCandidateImages] = useState<string[]>([]);
  const [videoDraft, setVideoDraft] = useState("");
  const [categoryTouched, setCategoryTouched] = useState(mode === "edit");
  const [productFilled, setProductFilled] = useState(
    Boolean(initial.title.trim() || initial.coverImage || initial.description.trim())
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const pendingImageKindRef = useRef<"cover" | "shot">("cover");

  const hasProductFill = useMemo(
    () => productFilled || Boolean(form.title.trim() || form.coverImage || form.description.trim()),
    [productFilled, form.title, form.coverImage, form.description]
  );

  const platformSet = useMemo(() => new Set(form.platforms), [form.platforms]);
  const genreSet = useMemo(() => new Set(form.bestFor), [form.bestFor]);

  function patch<K extends keyof GearDraft>(key: K, value: GearDraft[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addAffiliateLink() {
    patch("affiliateLinks", [
      ...form.affiliateLinks,
      { retailer: "Amazon", url: "", price: null, shipping: null, isActive: true },
    ]);
  }

  function updateAffiliateLink(index: number, key: string, value: string | boolean | null) {
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

  async function callImport(url: string): Promise<ImportPayload> {
    const res = await fetch("/api/admin/gear/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || `Import failed (${res.status})`);
    }
    return data as ImportPayload;
  }

  function applyProductFill(payload: ImportPayload, opts: { replaceSlug: boolean }) {
    const link = payload.draft.affiliateLinks[0];
    // Same ordered unique list the server used for cover + screenshots.
    const candidates =
      payload.draft.candidateImages?.filter(Boolean) ??
      [
        ...(payload.draft.coverImage ? [payload.draft.coverImage] : []),
        ...(payload.draft.screenshots ?? []),
      ];
    if (candidates.length > 0) setCandidateImages(candidates);

    const nextPlatforms =
      payload.draft.platforms && payload.draft.platforms.length > 0
        ? filterKnown(payload.draft.platforms, GEAR_PLATFORM_SET)
        : null;

    setForm((prev) => {
      const canApplyCategory =
        !categoryTouched &&
        Boolean(payload.draft.category) &&
        (mode === "create" ? prev.category === "Controllers" || !prev.category : !prev.category);

      return {
        ...prev,
        title: payload.draft.title || prev.title,
        slug:
          opts.replaceSlug && mode === "create" && !prev.slug.trim()
            ? payload.draft.slug
            : mode === "create" && !prev.slug.trim()
              ? payload.draft.slug
              : prev.slug,
        description: payload.draft.description || prev.description,
        category: canApplyCategory && payload.draft.category ? payload.draft.category : prev.category,
        manufacturer:
          payload.draft.manufacturer !== undefined
            ? payload.draft.manufacturer
            : prev.manufacturer,
        platforms: nextPlatforms && nextPlatforms.length > 0 ? nextPlatforms : prev.platforms,
        videos:
          payload.draft.videos && payload.draft.videos.length > 0
            ? payload.draft.videos
            : prev.videos ?? [],
        coverImage: payload.draft.coverImage || prev.coverImage,
        screenshots:
          payload.draft.screenshots?.length > 0
            ? payload.draft.screenshots
            : prev.screenshots ?? [],
        affiliateLinks: link ? upsertAffiliateLink(prev.affiliateLinks, link) : prev.affiliateLinks,
      };
    });
    setProductFilled(true);
  }

  function pickCoverFromCandidate(url: string) {
    // Cover = picked; screenshots = every other candidate (same set, no extras).
    const shots = candidateImages.filter((u) => u !== url);
    setForm((prev) => ({ ...prev, coverImage: url, screenshots: shots }));
  }

  async function importProduct() {
    const url = importUrl.trim();
    if (!url || busy) return;
    setBusy(true);
    setError("");
    setImportNote("Fetching product…");
    try {
      const payload = await callImport(url);
      applyProductFill(payload, { replaceSlug: true });
      const warns = payload.warnings?.filter(Boolean) ?? [];
      setImportNote(
        warns.length
          ? `Imported from ${payload.retailer}. ${warns.join(" ")}`
          : `Imported product info from ${payload.retailer}.`
      );
      setImportUrl("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setError(msg);
      setImportNote(msg);
    } finally {
      setBusy(false);
    }
  }

  async function addStoreLinkOnly() {
    const url = importUrl.trim();
    if (!url || busy) return;
    setBusy(true);
    setError("");
    setImportNote("Adding store link…");
    try {
      const payload = await callImport(url);
      const link = payload.draft.affiliateLinks[0];
      if (link) {
        setForm((prev) => ({
          ...prev,
          affiliateLinks: upsertAffiliateLink(prev.affiliateLinks, link),
        }));
      }
      setImportNote(
        `Added ${payload.retailer}${payload.price ? ` at ${payload.price}` : ""} for price comparison.`
      );
      setImportUrl("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setError(msg);
      setImportNote(msg);
    } finally {
      setBusy(false);
    }
  }

  async function replaceProductFromLink() {
    const url = importUrl.trim();
    if (!url || busy) return;
    setBusy(true);
    setError("");
    setImportNote("Replacing product info…");
    try {
      const payload = await callImport(url);
      applyProductFill(payload, { replaceSlug: false });
      const warns = payload.warnings?.filter(Boolean) ?? [];
      setImportNote(
        warns.length
          ? `Replaced product info from ${payload.retailer}. ${warns.join(" ")}`
          : `Replaced product info from ${payload.retailer}.`
      );
      setImportUrl("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setError(msg);
      setImportNote(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = pendingImageKindRef.current;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Upload a JPG, PNG, or WebP image.");
      return;
    }

    setBusy(true);
    setError("");
    setMediaNote(kind === "cover" ? "Uploading cover…" : "Uploading screenshot…");

    try {
      const body = new FormData();
      body.set("file", file);
      body.set("slug", `gear-${form.slug || "upload"}`);
      body.set("kind", kind);

      const res = await fetch("/api/admin/games/upload", { method: "POST", body });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.error ?? "Upload failed";
        setError(msg);
        setMediaNote(msg);
        setBusy(false);
        return;
      }

      if (!data?.url || typeof data.url !== "string") {
        const msg = "Upload succeeded but no image URL was returned.";
        setError(msg);
        setMediaNote(msg);
        setBusy(false);
        return;
      }

      if (kind === "cover") {
        patch("coverImage", data.url);
        setMediaNote("Cover uploaded — save the gear to persist.");
      } else {
        setForm((prev) => ({
          ...prev,
          screenshots: [...(prev.screenshots ?? []), data.url].slice(0, 20),
        }));
        setMediaNote("Screenshot uploaded — save the gear to persist.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Image upload failed";
      setError(msg);
      setMediaNote(msg);
    }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const nextSlug = slugifyTitle(form.slug.trim() || form.title);
      const payload: GearDraft = {
        ...form,
        slug: nextSlug,
        platforms: filterKnown(form.platforms, GEAR_PLATFORM_SET),
        bestFor: filterKnown(form.bestFor, GENRE_SET),
      };
      const res = await fetch(mode === "create" ? "/api/admin/gear" : `/api/admin/gear/${initial.slug}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Save failed");
        setBusy(false);
        return;
      }
      const savedSlug =
        typeof data?.slug === "string" && data.slug.trim() ? data.slug.trim() : nextSlug;
      if (mode === "edit" && savedSlug !== initial.slug) {
        router.replace(`/admin/gear/${savedSlug}`);
        router.refresh();
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
      <input
        type="file"
        ref={fileRef}
        onChange={handleImageUpload}
        className="hidden"
        accept="image/jpeg,image/png,image/webp"
      />

      <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
        <div className="flex items-start gap-2">
          <Link2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <h2 className="font-bold">
              {hasProductFill ? "Add another store link" : "Paste an affiliate link to start"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasProductFill
                ? "Default adds a price-compare link. Use “Replace product info” if you prefer this store’s title, description, and images."
                : "We’ll pull title, description, images, and price when the page exposes them. You can clean everything up below."}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void (hasProductFill ? addStoreLinkOnly() : importProduct());
              }
            }}
            className={field + " mt-0 sm:flex-1"}
            placeholder="https://www.amazon.com/dp/… or any store product URL"
            disabled={busy}
          />
          {!hasProductFill ? (
            <button
              type="button"
              disabled={busy || !importUrl.trim()}
              onClick={() => void importProduct()}
              className="h-9 shrink-0 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "Importing…" : "Import product"}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !importUrl.trim()}
                onClick={() => void addStoreLinkOnly()}
                className="h-9 shrink-0 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-60"
              >
                {busy ? "Working…" : "Add store link"}
              </button>
              <button
                type="button"
                disabled={busy || !importUrl.trim()}
                onClick={() => void replaceProductFromLink()}
                className="h-9 shrink-0 rounded-full border border-border bg-secondary px-4 text-sm font-bold hover:bg-secondary/80 disabled:opacity-60"
              >
                Replace product info
              </button>
            </div>
          )}
        </div>
        {importNote && <p className="text-xs text-muted-foreground">{importNote}</p>}
      </section>

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
            onBlur={() => {
              const cleaned = slugifyTitle(form.slug.trim() || form.title);
              if (cleaned) patch("slug", cleaned);
            }}
            className={field}
            placeholder="xbox-wireless-controller"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Category</label>
          <PremiumSelect
            value={form.category}
            onChange={(e) => {
              setCategoryTouched(true);
              patch("category", e.target.value);
            }}
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
          <label className={label}>Manufacturer</label>
          <input
            value={form.manufacturer || ""}
            onChange={(e) => patch("manufacturer", e.target.value.trim() ? e.target.value : null)}
            className={field}
            placeholder="e.g. Microsoft, Logitech"
          />
        </div>
      </div>

      <div>
        <label className={label}>Platforms</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {GEAR_PLATFORMS.map((p) => (
            <ChipToggle
              key={p}
              label={p}
              on={platformSet.has(p)}
              onClick={() => patch("platforms", toggleInList(form.platforms, p))}
            />
          ))}
        </div>
      </div>

      <div>
        <label className={label}>Description</label>
        <textarea
          rows={5}
          value={form.description}
          onChange={(e) => patch("description", e.target.value)}
          className={area}
          placeholder="Detailed editorial review..."
        />
      </div>

      <div>
        <label className={label}>Best For Genres</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <ChipToggle
              key={g}
              label={g}
              on={genreSet.has(g)}
              onClick={() => patch("bestFor", toggleInList(form.bestFor, g))}
            />
          ))}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Media Uploads</h3>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                pendingImageKindRef.current = "cover";
                fileRef.current?.click();
              }}
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Upload Cover
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                pendingImageKindRef.current = "shot";
                fileRef.current?.click();
              }}
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Upload Screenshot
            </button>
          </div>
        </div>

        {mediaNote && <p className="text-xs text-muted-foreground">{mediaNote}</p>}

        {candidateImages.length > 0 && (
          <div className="space-y-2">
            <label className={label}>Pick cover from imported gallery</label>
            <p className="text-xs text-muted-foreground">
              Click an image to set it as the cover. Remaining images stay in the screenshot gallery.
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {candidateImages.map((url) => {
                const selected = form.coverImage === url;
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => pickCoverFromCandidate(url)}
                    className={
                      "relative overflow-hidden rounded-md border bg-secondary/20 transition-colors " +
                      (selected
                        ? "border-primary ring-2 ring-primary/40"
                        : "border-border hover:border-primary/50")
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="aspect-square w-full object-cover" />
                    {selected && (
                      <span className="absolute inset-x-0 bottom-0 bg-primary/90 py-0.5 text-[10px] font-bold text-primary-foreground">
                        Cover
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {form.coverImage && (
          <div className="space-y-2">
            <label className={label}>Cover Image</label>
            <div className="relative inline-block overflow-hidden rounded-md border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.coverImage} alt="Cover" className="h-24 w-auto object-cover" />
              <button
                type="button"
                onClick={() => patch("coverImage", null)}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
        )}

        {(form.screenshots?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <label className={label}>Screenshots / gallery</label>
            <div className="flex flex-wrap gap-2">
              {form.screenshots!.map((url, i) => (
                <div key={i} className="relative inline-block overflow-hidden rounded-md border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Screenshot ${i + 1}`} className="h-20 w-auto object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      const removed = form.screenshots![i];
                      const next = [...form.screenshots!];
                      next.splice(i, 1);
                      patch("screenshots", next);
                      setCandidateImages((prev) => prev.filter((u) => u !== removed));
                    }}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className={label}>Videos</label>
          {(form.videos?.length ?? 0) > 0 && (
            <ul className="space-y-1">
              {form.videos!.map((url, i) => (
                <li
                  key={`${url}-${i}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">{url}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...(form.videos ?? [])];
                      next.splice(i, 1);
                      patch("videos", next);
                    }}
                    className="shrink-0 text-destructive hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={videoDraft}
              onChange={(e) => setVideoDraft(e.target.value)}
              className={field + " mt-0 sm:flex-1"}
              placeholder="https://… mp4, YouTube, or Vimeo URL"
            />
            <button
              type="button"
              onClick={() => {
                const url = videoDraft.trim();
                if (!url) return;
                if ((form.videos ?? []).includes(url)) {
                  setVideoDraft("");
                  return;
                }
                patch("videos", [...(form.videos ?? []), url].slice(0, 12));
                setVideoDraft("");
              }}
              className="h-9 shrink-0 rounded-full border border-border bg-secondary px-4 text-sm font-bold hover:bg-secondary/80"
            >
              Add video
            </button>
          </div>
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
          <p className="text-sm text-muted-foreground">
            Paste a link above or add a row manually for price comparison across stores.
          </p>
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
