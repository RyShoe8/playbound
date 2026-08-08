"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useEffect, useMemo, useState, useRef } from "react";
import { upload } from "@vercel/blob/client";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import {
  buildNewsletterHtml,
  emptyEpicGame,
  emptyMiniGame,
  emptyNewsletterDraft,
  normalizeNewsletterDraft,
  prefillFeaturedFromGame,
  prefillMiniFromGame,
  type CatalogGamePrefill,
  type NewsletterEmailDraft,
  type NewsletterEpicGame,
  type NewsletterMiniGame,
} from "@/lib/newsletterEmail";

const field =
  "mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
const area =
  "mt-1 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
const label = "text-xs font-semibold text-muted-foreground";
const btnGhost =
  "rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-secondary/80 disabled:opacity-50";
const btnPrimary =
  "rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50";

export function WeeklyNewsletterBuilder({
  draft,
  onChange,
  games,
  featuredSlug,
  publishedAt,
}: {
  draft: NewsletterEmailDraft;
  onChange: (next: NewsletterEmailDraft) => void;
  games: CatalogGamePrefill[];
  featuredSlug: string;
  publishedAt: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");
  const [lastAutoPrefillSlug, setLastAutoPrefillSlug] = useState("");

  const gamesBySlug = useMemo(() => {
    const map = new Map<string, CatalogGamePrefill>();
    for (const g of games) map.set(g.slug, g);
    return map;
  }, [games]);

  const html = useMemo(
    () =>
      buildNewsletterHtml(draft, {
        title: `Playbound Club — Week of ${publishedAt || "newsletter"}`,
      }),
    [draft, publishedAt]
  );

  // Prefill featured when empty, or when the issue's featured game switches after
  // an earlier auto-prefill. Never overwrite a saved/manual draft on first mount.
  useEffect(() => {
    if (!featuredSlug) return;
    const game = gamesBySlug.get(featuredSlug);
    if (!game) return;

    const featuredEmpty =
      !draft.featured.title.trim() && !draft.featured.description.trim() && !draft.featured.imageUrl.trim();
    const gameChangedAfterPrefill = lastAutoPrefillSlug !== "" && lastAutoPrefillSlug !== featuredSlug;

    if (featuredEmpty || gameChangedAfterPrefill) {
      onChange(prefillFeaturedFromGame(draft, game));
      setLastAutoPrefillSlug(featuredSlug);
      return;
    }

    if (lastAutoPrefillSlug === "") {
      setLastAutoPrefillSlug(featuredSlug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: react to featuredSlug + catalog only
  }, [featuredSlug, gamesBySlug]);

  function update(patch: Partial<NewsletterEmailDraft>) {
    onChange({ ...draft, ...patch });
  }

  function updateFeatured(patch: Partial<NewsletterEmailDraft["featured"]>) {
    update({ featured: { ...draft.featured, ...patch } });
  }

  function updateFooter(patch: Partial<NewsletterEmailDraft["footer"]>) {
    update({ footer: { ...draft.footer, ...patch } });
  }

  function updateEpicMeta(patch: Partial<Pick<NewsletterEmailDraft["epic"], "eyebrow" | "title">>) {
    update({ epic: { ...draft.epic, ...patch } });
  }

  function setNewGame(index: number, next: NewsletterMiniGame) {
    const newGames = draft.newGames.map((g, i) => (i === index ? next : g));
    update({ newGames });
  }

  function setEpicGame(index: number, next: NewsletterEpicGame) {
    const gamesList = draft.epic.games.map((g, i) => (i === index ? next : g));
    update({ epic: { ...draft.epic, games: gamesList } });
  }

  function refillFeatured() {
    const game = gamesBySlug.get(featuredSlug);
    if (!game) return;
    onChange(prefillFeaturedFromGame(draft, game));
    setLastAutoPrefillSlug(featuredSlug);
  }

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(html);
      setCopyState("ok");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("err");
      setTimeout(() => setCopyState("idle"), 2500);
    }
  }

  function downloadHtml() {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `playbound-weekly-${publishedAt || "draft"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpload(file: File | null | undefined, callback: (url: string) => void) {
    if (!file) return;
    try {
      const slug = featuredSlug || "newsletter";
      const pathname = `games/${slug}/newsletter-${Date.now()}.${file.name.split('.').pop()}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/admin/games/upload/client",
      });
      callback(blob.url);
    } catch (err) {
      console.error(err);
      alert("Image upload failed");
    }
  }

  return (
    <AdminCollapsibleSection title="Newsletter email" defaultOpen badge={<span className="ml-2 text-xs font-normal text-muted-foreground">HTML builder</span>}>
      <p className="text-sm text-muted-foreground">
        Fill the sections below — HTML updates live. Save the issue to keep this draft. Copy or download when you&apos;re ready to send.
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} onClick={() => void copyHtml()}>
          {copyState === "ok" ? "Copied!" : copyState === "err" ? "Copy failed" : "Copy HTML"}
        </button>
        <button type="button" className={btnGhost} onClick={downloadHtml}>
          Download .html
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={!featuredSlug}
          onClick={refillFeatured}
          title="Overwrite featured fields from the issue's catalog game"
        >
          Refill featured from game
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border border-border/80 p-3">
            <h3 className="text-sm font-bold">Featured pick</h3>
            <div>
              <label className={label}>Badge</label>
              <input className={field} value={draft.featured.badge} onChange={(e) => updateFeatured({ badge: e.target.value })} />
            </div>
            <div>
              <label className={label}>Title</label>
              <input className={field} value={draft.featured.title} onChange={(e) => updateFeatured({ title: e.target.value })} />
            </div>
            <div>
              <label className={label}>Blurb</label>
              <textarea className={area} rows={4} value={draft.featured.description} onChange={(e) => updateFeatured({ description: e.target.value })} />
            </div>
            <div>
              <label className={label}>Hero image URL</label>
              <div className="mt-1 flex gap-2">
                <input className={field + " mt-0"} value={draft.featured.imageUrl} onChange={(e) => updateFeatured({ imageUrl: e.target.value })} />
                <label className="flex cursor-pointer items-center justify-center rounded-lg border border-border bg-secondary px-3 text-xs font-semibold hover:bg-secondary/80">
                  Upload
                  <input type="file" className="hidden" accept="image/*" onChange={(e) => handleUpload(e.target.files?.[0], (url) => updateFeatured({ imageUrl: url }))} />
                </label>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">New on Playbound</h3>
              <button
                type="button"
                className={btnGhost}
                disabled={draft.newGames.length >= 8}
                onClick={() => update({ newGames: [...draft.newGames, emptyMiniGame()] })}
              >
                Add game
              </button>
            </div>
            <div>
              <label className={label}>Section title</label>
              <input className={field} value={draft.newSectionTitle} onChange={(e) => update({ newSectionTitle: e.target.value })} />
            </div>
            {draft.newGames.map((game, index) => (
              <MiniGameFields
                key={index}
                index={index}
                game={game}
                catalog={games}
                onChange={(next) => setNewGame(index, next)}
                onUpload={(file) => handleUpload(file, (url) => setNewGame(index, { ...game, imageUrl: url }))}
                onRemove={() =>
                  update({
                    newGames:
                      draft.newGames.length <= 2
                        ? draft.newGames.map((g, i) => (i === index ? emptyMiniGame() : g))
                        : draft.newGames.filter((_, i) => i !== index),
                  })
                }
              />
            ))}
          </section>

          <section className="space-y-3 rounded-xl border border-border/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Epic free this week</h3>
              <button
                type="button"
                className={btnGhost}
                disabled={draft.epic.games.length >= 12}
                onClick={() =>
                  update({ epic: { ...draft.epic, games: [...draft.epic.games, emptyEpicGame()] } })
                }
              >
                Add free game
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Eyebrow</label>
                <input className={field} value={draft.epic.eyebrow} onChange={(e) => updateEpicMeta({ eyebrow: e.target.value })} />
              </div>
              <div>
                <label className={label}>Heading</label>
                <input className={field} value={draft.epic.title} onChange={(e) => updateEpicMeta({ title: e.target.value })} />
              </div>
            </div>
            {draft.epic.games.map((game, index) => (
              <EpicGameFields
                key={index}
                index={index}
                game={game}
                onChange={(next) => setEpicGame(index, next)}
                onUpload={(file) => handleUpload(file, (url) => setEpicGame(index, { ...game, imageUrl: url }))}
                onScrape={async (url) => {
                  try {
                    const res = await fetch("/api/admin/epic-scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
                    const data = await res.json();
                    if (res.ok) setEpicGame(index, { ...game, title: data.title || game.title, description: data.description || game.description, imageUrl: data.imageUrl || game.imageUrl });
                    else alert("Scrape failed: " + data.error);
                  } catch (e) { alert("Scrape failed"); }
                }}
                onRemove={() =>
                  update({
                    epic: {
                      ...draft.epic,
                      games:
                        draft.epic.games.length <= 1
                          ? [emptyEpicGame()]
                          : draft.epic.games.filter((_, i) => i !== index),
                    },
                  })
                }
              />
            ))}
          </section>

          <section className="space-y-3 rounded-xl border border-border/80 p-3">
            <h3 className="text-sm font-bold">Footer</h3>
            <div>
              <label className={label}>Community label</label>
              <input className={field} value={draft.footer.communityLabel} onChange={(e) => updateFooter({ communityLabel: e.target.value })} />
            </div>
            <div>
              <label className={label}>Facebook URL</label>
              <input className={field} value={draft.footer.facebookUrl} onChange={(e) => updateFooter({ facebookUrl: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Bluesky URL</label>
                <input className={field} value={draft.footer.blueskyUrl} onChange={(e) => updateFooter({ blueskyUrl: e.target.value })} />
              </div>
              <div>
                <label className={label}>Reddit URL</label>
                <input className={field} value={draft.footer.redditUrl} onChange={(e) => updateFooter({ redditUrl: e.target.value })} />
              </div>
              <div>
                <label className={label}>Discord URL</label>
                <input className={field} value={draft.footer.discordUrl} onChange={(e) => updateFooter({ discordUrl: e.target.value })} />
              </div>
              <div>
                <label className={label}>Unsubscribe URL</label>
                <input className={field} value={draft.footer.unsubscribeUrl} onChange={(e) => updateFooter({ unsubscribeUrl: e.target.value })} />
              </div>
            </div>
            <div>
              <label className={label}>Copyright year</label>
              <input
                type="number"
                className={field}
                value={draft.footer.copyrightYear}
                onChange={(e) => updateFooter({ copyrightYear: Number(e.target.value) || draft.footer.copyrightYear })}
              />
            </div>
          </section>
        </div>

        <div className="space-y-2 xl:sticky xl:top-4 xl:self-start">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Live preview</h3>
            <span className="text-[11px] text-muted-foreground">600px email frame</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-[#0B0F19]">
            <iframe
              title="Newsletter preview"
              srcDoc={html}
              sandbox=""
              className="h-[720px] w-full bg-[#0B0F19]"
            />
          </div>
        </div>
      </div>
    </AdminCollapsibleSection>
  );
}

function MiniGameFields({
  index,
  game,
  catalog,
  onChange,
  onUpload,
  onRemove,
}: {
  index: number;
  game: NewsletterMiniGame;
  catalog: CatalogGamePrefill[];
  onChange: (next: NewsletterMiniGame) => void;
  onUpload: (file: File | null) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-muted-foreground">Mini game {index + 1}</p>
        <button type="button" className={btnGhost} onClick={onRemove}>
          Clear
        </button>
      </div>
      <div>
        <label className={label}>Prefill from catalog</label>
        <PremiumSelect
          className={field}
          defaultValue=""
          onChange={(e) => {
            const slug = e.target.value;
            e.target.value = "";
            const g = catalog.find((x) => x.slug === slug);
            if (g) onChange(prefillMiniFromGame(g));
          }}
        >
          <option value="">Pick a game…</option>
          {catalog.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.title}
            </option>
          ))}
        </PremiumSelect>
      </div>
      <div>
        <label className={label}>Title</label>
        <input className={field} value={game.title} onChange={(e) => onChange({ ...game, title: e.target.value })} />
      </div>
      <div>
        <label className={label}>Description</label>
        <textarea className={area} rows={2} value={game.description} onChange={(e) => onChange({ ...game, description: e.target.value })} />
      </div>
      <div>
        <label className={label}>Image URL</label>
        <div className="mt-1 flex gap-2">
          <input className={field + " mt-0"} value={game.imageUrl} onChange={(e) => onChange({ ...game, imageUrl: e.target.value })} />
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-border bg-secondary px-3 text-xs font-semibold hover:bg-secondary/80">
            Upload
            <input type="file" className="hidden" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0] || null)} />
          </label>
        </div>
      </div>
      <div>
        <label className={label}>Link URL</label>
        <input className={field} value={game.url} onChange={(e) => onChange({ ...game, url: e.target.value })} />
      </div>
    </div>
  );
}

function EpicGameFields({
  index,
  game,
  onChange,
  onUpload,
  onScrape,
  onRemove,
}: {
  index: number;
  game: NewsletterEpicGame;
  onChange: (next: NewsletterEpicGame) => void;
  onUpload: (file: File | null) => void;
  onScrape: (url: string) => void;
  onRemove: () => void;
}) {
  const [scrapeUrl, setScrapeUrl] = useState("");
  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-muted-foreground">Epic game {index + 1}</p>
        <button type="button" className={btnGhost} onClick={onRemove}>
          Remove
        </button>
      </div>
      <div>
        <label className={label}>Scrape from Epic URL</label>
        <div className="mt-1 flex gap-2">
          <input className={field + " mt-0"} placeholder="https://store.epicgames.com/..." value={scrapeUrl} onChange={(e) => setScrapeUrl(e.target.value)} />
          <button type="button" className="rounded-lg border border-border bg-secondary px-3 text-xs font-semibold hover:bg-secondary/80" onClick={() => { if (scrapeUrl) onScrape(scrapeUrl); setScrapeUrl(""); }}>Scrape</button>
        </div>
      </div>
      <div>
        <label className={label}>Title</label>
        <input className={field} value={game.title} onChange={(e) => onChange({ ...game, title: e.target.value })} />
      </div>
      <div>
        <label className={label}>Description</label>
        <textarea className={area} rows={2} value={game.description} onChange={(e) => onChange({ ...game, description: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Thumbnail URL</label>
          <div className="mt-1 flex gap-2">
            <input className={field + " mt-0"} value={game.imageUrl} onChange={(e) => onChange({ ...game, imageUrl: e.target.value })} />
            <label className="flex cursor-pointer items-center justify-center rounded-lg border border-border bg-secondary px-3 text-xs font-semibold hover:bg-secondary/80">
              Upload
              <input type="file" className="hidden" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>
        <div>
          <label className={label}>Badge</label>
          <input className={field} value={game.badge} onChange={(e) => onChange({ ...game, badge: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

/** Build initial client draft from saved JSON + publication year. */
export function initialNewsletterDraft(saved: unknown, publishedAt: string): NewsletterEmailDraft {
  const year = Number((publishedAt || "").slice(0, 4)) || new Date().getUTCFullYear();
  if (saved) return normalizeNewsletterDraft(saved, { year });
  return emptyNewsletterDraft({ year });
}
