"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Save,
  ExternalLink,
  ShieldCheck,
  Image as ImageIcon,
  Layers,
  HardDrive,
  Download,
  Share2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { GENRES, PLATFORMS, FEATURES, LAUNCH_METHODS, LAUNCHER_KINDS } from "@/lib/gamePayload";
import type { DeveloperGamePayload } from "@/lib/developerGamePayload";

type InitialGame = DeveloperGamePayload & {
  slug: string;
  title: string;
  qualityBar?: {
    verdict?: string;
    lastVerified?: string;
    genuinelyFree?: boolean;
    finished?: boolean;
    activelyMaintained?: boolean;
    standsAlone?: boolean;
    highQuality?: boolean;
  } | null;
  whyWePickedIt?: string | null;
  thatOneThing?: string | null;
  bestFor?: string[];
  notFor?: string[];
  status?: string;
};

export function DeveloperGameEditorForm({ game }: { game: InitialGame }) {
  const router = useRouter();

  const [form, setForm] = useState<DeveloperGamePayload>({
    tagline: game.tagline || "",
    description: game.description || "",
    website: game.website || "",
    githubRepo: game.githubRepo || null,
    genres: game.genres || [],
    tags: game.tags || [],
    aliases: game.aliases || [],
    license: game.license || "Proprietary",
    releaseYear: game.releaseYear || new Date().getFullYear(),
    sizeMB: game.sizeMB || 0,
    platforms: game.platforms || ["Windows"],
    features: game.features || [],
    maxPlayers: game.maxPlayers || null,
    launchMethods: game.launchMethods || ["install"],
    browserPlayable: Boolean(game.browserPlayable),
    steamDeck: Boolean(game.steamDeck),
    steamAppId: game.steamAppId || null,
    androidStoreUrl: game.androidStoreUrl || null,
    iosStoreUrl: game.iosStoreUrl || null,
    coverImage: game.coverImage || null,
    screenshots: game.screenshots || [],
    videos: game.videos || [],
    systemRequirements: game.systemRequirements || {
      min: "Windows 10, 4GB RAM",
      recommended: "Windows 10/11, 8GB RAM",
    },
    hardwareRequirements: game.hardwareRequirements || null,
    controls: game.controls || null,
    launcherInstall: game.launcherInstall || null,
    communityLinks: game.communityLinks || null,
  });

  const [newScreenshot, setNewScreenshot] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const togglePlatform = (plat: string) => {
    setForm((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(plat)
        ? prev.platforms.filter((p) => p !== plat)
        : [...prev.platforms, plat],
    }));
  };

  const toggleGenre = (genre: (typeof GENRES)[number]) => {
    setForm((prev) => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter((g) => g !== genre)
        : [...prev.genres, genre],
    }));
  };

  const toggleFeature = (feature: string) => {
    setForm((prev) => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter((f) => f !== feature)
        : [...prev.features, feature],
    }));
  };

  const toggleLaunchMethod = (method: (typeof LAUNCH_METHODS)[number]) => {
    setForm((prev) => ({
      ...prev,
      launchMethods: prev.launchMethods.includes(method)
        ? prev.launchMethods.length > 1
          ? prev.launchMethods.filter((m) => m !== method)
          : prev.launchMethods
        : [...prev.launchMethods, method],
    }));
  };

  const addScreenshot = () => {
    const url = newScreenshot.trim();
    if (!url) return;
    if (!form.screenshots.includes(url)) {
      setForm((prev) => ({ ...prev, screenshots: [...prev.screenshots, url] }));
    }
    setNewScreenshot("");
  };

  const removeScreenshot = (index: number) => {
    setForm((prev) => ({
      ...prev,
      screenshots: prev.screenshots.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/developer/games/${game.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ type: "error", text: data.error || "Failed to save changes" });
        return;
      }

      setStatusMessage({ type: "success", text: "Changes saved and published to your page successfully!" });
      router.refresh();
    } catch {
      setStatusMessage({ type: "error", text: "Network error occurred. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Editorial boundary notice */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">PlayBound Editorial &amp; Review Separation</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              You have full ownership of your game&apos;s copy, assets, platforms, and installation recipes. PlayBound&apos;s
              Quality Bar assessment, reviews, and editorial badges are managed independently by our staff to ensure
              unbiased recommendations.
            </p>
          </div>
        </div>
      </div>

      {/* Read-Only PlayBound Editorial Review Card */}
      <div className="rounded-xl border border-border bg-card/60 p-5 backdrop-blur-xs">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            PlayBound Staff Review &amp; Quality Bar (Read-Only)
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            Status: {game.status || "Published"}
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="text-xs font-bold text-muted-foreground">Editorial Verdict</h4>
            <p className="mt-1 text-sm font-medium text-foreground">
              {game.qualityBar?.verdict || "No staff verdict written yet."}
            </p>
            {game.qualityBar?.lastVerified && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Last verified: {game.qualityBar.lastVerified}
              </p>
            )}
          </div>
          <div>
            <h4 className="text-xs font-bold text-muted-foreground">Why We Picked It</h4>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {game.whyWePickedIt || "Pending editorial evaluation."}
            </p>
          </div>
        </div>

        {(game.bestFor?.length || game.notFor?.length) ? (
          <div className="mt-4 grid gap-4 border-t border-border/50 pt-3 text-xs sm:grid-cols-2">
            {game.bestFor?.length ? (
              <div>
                <span className="font-semibold text-emerald-400">Best for: </span>
                <span className="text-muted-foreground">{game.bestFor.join(", ")}</span>
              </div>
            ) : null}
            {game.notFor?.length ? (
              <div>
                <span className="font-semibold text-rose-400">Not for: </span>
                <span className="text-muted-foreground">{game.notFor.join(", ")}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Status Alert */}
      {statusMessage && (
        <div
          className={`flex items-center gap-2.5 rounded-lg p-3 text-xs font-medium ${
            statusMessage.type === "success"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          {statusMessage.text}
        </div>
      )}

      {/* 1. Basic Info & Presentation */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Layers className="size-4 text-primary" />
          <h2 className="text-sm font-bold tracking-tight">Presentation &amp; Store Links</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground">Tagline</label>
            <input
              type="text"
              required
              maxLength={200}
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              placeholder="Brief, punchy one-line hook"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground">Full Description</label>
            <textarea
              required
              rows={5}
              maxLength={8000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              placeholder="Gameplay overview, story, features, and player experience..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Official Website</label>
              <input
                type="url"
                required
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                placeholder="https://yourgame.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">GitHub Repo (optional)</label>
              <input
                type="text"
                value={form.githubRepo || ""}
                onChange={(e) => setForm({ ...form, githubRepo: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                placeholder="owner/repo (e.g. OpenRA/OpenRA)"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Steam App ID (optional)</label>
              <input
                type="text"
                value={form.steamAppId || ""}
                onChange={(e) => setForm({ ...form, steamAppId: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                placeholder="e.g. 107410"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Android Store URL</label>
              <input
                type="url"
                value={form.androidStoreUrl || ""}
                onChange={(e) => setForm({ ...form, androidStoreUrl: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                placeholder="https://play.google.com/store/..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">iOS Store URL</label>
              <input
                type="url"
                value={form.iosStoreUrl || ""}
                onChange={(e) => setForm({ ...form, iosStoreUrl: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                placeholder="https://apps.apple.com/..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Visuals & Media */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <ImageIcon className="size-4 text-primary" />
          <h2 className="text-sm font-bold tracking-tight">Screenshots &amp; Cover Art</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground">Cover Image URL</label>
            <div className="mt-1 flex gap-3">
              <input
                type="url"
                value={form.coverImage || ""}
                onChange={(e) => setForm({ ...form, coverImage: e.target.value || null })}
                className="flex-1 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                placeholder="https://.../cover.jpg"
              />
            </div>
            {form.coverImage && (
              <div className="relative mt-2 h-28 w-48 overflow-hidden rounded-lg border border-border">
                <Image src={form.coverImage} alt="Cover preview" fill className="object-cover" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground">Screenshots</label>
            <div className="mt-1 flex gap-2">
              <input
                type="url"
                value={newScreenshot}
                onChange={(e) => setNewScreenshot(e.target.value)}
                placeholder="Paste screenshot image URL and press Add"
                className="flex-1 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={addScreenshot}
                className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-foreground hover:bg-secondary/80"
              >
                <Plus className="size-3.5" />
                Add
              </button>
            </div>

            {form.screenshots.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {form.screenshots.map((url, i) => (
                  <div key={i} className="group relative aspect-video overflow-hidden rounded-lg border border-border bg-secondary">
                    <Image src={url} alt={`Screenshot ${i + 1}`} fill className="object-cover" />
                    <button
                      type="button"
                      onClick={() => removeScreenshot(i)}
                      className="absolute top-1 right-1 rounded-md bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-rose-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Technical Specs & Platforms */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <HardDrive className="size-4 text-primary" />
          <h2 className="text-sm font-bold tracking-tight">Platforms, Launch &amp; Requirements</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Supported Platforms</label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((plat) => {
                const on = form.platforms.includes(plat);
                return (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => togglePlatform(plat)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      on ? "bg-primary text-primary-foreground" : "border border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {plat}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Launch Methods</label>
            <div className="flex flex-wrap gap-1.5">
              {LAUNCH_METHODS.map((method) => {
                const on = form.launchMethods.includes(method);
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => toggleLaunchMethod(method)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                      on ? "bg-primary text-primary-foreground" : "border border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {method}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Release Year</label>
              <input
                type="number"
                min={1970}
                max={2100}
                value={form.releaseYear}
                onChange={(e) => setForm({ ...form, releaseYear: Number(e.target.value) || 2024 })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Download Size (MB)</label>
              <input
                type="number"
                min={0}
                value={form.sizeMB}
                onChange={(e) => setForm({ ...form, sizeMB: Number(e.target.value) || 0 })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Max Players (lobby/server cap)</label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 16 (leave blank if solo)"
                value={form.maxPlayers || ""}
                onChange={(e) => setForm({ ...form, maxPlayers: e.target.value ? Number(e.target.value) : null })}
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Minimum System Requirements</label>
              <textarea
                rows={2}
                value={form.systemRequirements.min}
                onChange={(e) =>
                  setForm({
                    ...form,
                    systemRequirements: { ...form.systemRequirements, min: e.target.value },
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Recommended System Requirements</label>
              <textarea
                rows={2}
                value={form.systemRequirements.recommended}
                onChange={(e) =>
                  setForm({
                    ...form,
                    systemRequirements: { ...form.systemRequirements, recommended: e.target.value },
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Launcher & Community Links */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Download className="size-4 text-primary" />
          <h2 className="text-sm font-bold tracking-tight">Launcher &amp; Community Links</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground">Official Discord Invite URL</label>
            <input
              type="url"
              value={form.communityLinks?.officialDiscord?.inviteUrl || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  communityLinks: {
                    ...form.communityLinks,
                    officialDiscord: {
                      inviteUrl: e.target.value || null,
                      serverName: form.communityLinks?.officialDiscord?.serverName ?? null,
                    },
                  },
                })
              }
              className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              placeholder="https://discord.gg/yourserver"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground">Discord Server Name</label>
            <input
              type="text"
              value={form.communityLinks?.officialDiscord?.serverName || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  communityLinks: {
                    ...form.communityLinks,
                    officialDiscord: {
                      inviteUrl: form.communityLinks?.officialDiscord?.inviteUrl ?? null,
                      serverName: e.target.value || null,
                    },
                  },
                })
              }
              className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              placeholder="Official Studio Discord"
            />
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-4 z-20 flex items-center justify-between rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur-md">
        <Link
          href="/developer"
          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; Cancel and return to Dashboard
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Save className="size-4" />
          {saving ? "Publishing Changes..." : "Save & Update Page"}
        </button>
      </div>
    </form>
  );
}
