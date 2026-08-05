"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import {
  EDITION_STATUSES,
  EDITION_STATUS_LABELS,
  EDITION_TYPES,
  EDITION_TYPE_LABELS,
  EDITION_VISIBILITIES,
  INSTALL_METHODS,
  INSTALL_METHOD_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_LEVELS,
  type EditionInstallConfig,
  type InstallMethod,
} from "@/lib/editionTypes";

const label = "block text-xs font-semibold text-muted-foreground";
const field =
  "mt-1 h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
const area =
  "mt-1 w-full resize-y rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

export interface EditionDraft {
  id?: string;
  gameSlug: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  type: string;
  status: string;
  visibility: string;
  sortOrder: number;
  isDefault: boolean;
  branding: { logo: string; heroImage: string; screenshots: string[]; videos: string[] };
  links: { website: string; discord: string; wiki: string; github: string; forum: string };
  installMethod: InstallMethod;
  installConfig: EditionInstallConfig;
  requirements: { min: string; recommended: string; notes: string };
  features: string[];
  tags: string[];
  aliases: string[];
  serverName: string;
  languages: string[];
  version: string;
  verified: boolean;
  verificationLevel: string;
  verificationNote: string;
}

/** Comma/newline separated text ⇄ string[], for the simple list fields. */
function toList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function EditionEditorForm({
  mode,
  initial,
  games,
}: {
  mode: "create" | "edit";
  initial: EditionDraft;
  games: { slug: string; title: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<EditionDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function patch<K extends keyof EditionDraft>(key: K, value: EditionDraft[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Update one method's config block without disturbing the others. */
  function patchConfig<M extends keyof EditionInstallConfig>(
    method: M,
    value: Partial<NonNullable<EditionInstallConfig[M]>>
  ) {
    setForm((prev) => ({
      ...prev,
      installConfig: {
        ...prev.installConfig,
        [method]: { ...(prev.installConfig[method] ?? {}), ...value },
      },
    }));
  }

  const backHref = `/admin/games/${form.gameSlug}/editions`;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        mode === "create" ? "/api/editions" : `/api/editions/${initial.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Save failed");
        setBusy(false);
        return;
      }
      router.push(backHref);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete the "${form.name}" edition? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/editions/${initial.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Delete failed");
        setBusy(false);
        return;
      }
      router.push(backHref);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Identity ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Game</label>
          <select
            value={form.gameSlug}
            onChange={(e) => patch("gameSlug", e.target.value)}
            className={field}
          >
            <option value="">Select a game…</option>
            {games.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Edition name</label>
          <input
            required
            value={form.name}
            onChange={(e) => {
              const name = e.target.value;
              setForm((prev) => ({
                ...prev,
                name,
                slug:
                  mode === "create" && (!prev.slug || prev.slug === slugify(prev.name))
                    ? slugify(name)
                    : prev.slug,
              }));
            }}
            className={field}
            placeholder="Turtle WoW"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Slug</label>
          <input
            required
            value={form.slug}
            onChange={(e) =>
              patch("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
            }
            className={field}
            placeholder="turtle-wow"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            URL: /games/{form.gameSlug || "…"}/editions/{form.slug || "…"}
          </p>
        </div>
        <div>
          <label className={label}>Version</label>
          <input
            value={form.version}
            onChange={(e) => patch("version", e.target.value)}
            className={field}
            placeholder="1.17.2"
          />
        </div>
      </div>

      <div>
        <label className={label}>Short description</label>
        <input
          value={form.shortDescription}
          onChange={(e) => patch("shortDescription", e.target.value)}
          className={field}
          placeholder="Blizzlike 1.12 progression with a custom content team."
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          One line, shown on the edition card and in search results.
        </p>
      </div>

      <div>
        <label className={label}>Description</label>
        <textarea
          rows={5}
          value={form.description}
          onChange={(e) => patch("description", e.target.value)}
          className={area}
          placeholder="What this edition is, who runs it, and why someone would pick it. Blank line between paragraphs."
        />
      </div>

      {/* ── Classification ────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label}>Type</label>
          <select
            value={form.type}
            onChange={(e) => patch("type", e.target.value)}
            className={field}
          >
            {EDITION_TYPES.map((t) => (
              <option key={t} value={t}>
                {EDITION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Status</label>
          <select
            value={form.status}
            onChange={(e) => patch("status", e.target.value)}
            className={field}
          >
            {EDITION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EDITION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Visibility</label>
          <select
            value={form.visibility}
            onChange={(e) => patch("visibility", e.target.value)}
            className={field}
          >
            {EDITION_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            unlisted = reachable by URL, hidden from listings and search.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Sort order</label>
          <input
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(e) => patch("sortOrder", Number(e.target.value) || 0)}
            className={field}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(e) => patch("isDefault", e.target.checked)}
            className="size-4"
          />
          Default edition
        </label>
      </div>

      {/* ── Installation ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-bold">Installation</p>
        <div className="mt-3">
          <label className={label}>Install method</label>
          <select
            value={form.installMethod}
            onChange={(e) => patch("installMethod", e.target.value as InstallMethod)}
            className={field}
          >
            {INSTALL_METHODS.map((m) => (
              <option key={m} value={m}>
                {INSTALL_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        {/* Only the selected method's fields are shown; config for other
            methods is preserved in state so switching back does not lose it. */}
        <div className="mt-4 space-y-3">
          <InstallMethodFields
            method={form.installMethod}
            config={form.installConfig}
            patchConfig={patchConfig}
          />
        </div>
      </div>

      {/* ── Certification ─────────────────────────────────────── */}
      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-bold">Certification</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Verification level</label>
            <select
              value={form.verificationLevel}
              onChange={(e) => patch("verificationLevel", e.target.value)}
              className={field}
            >
              {VERIFICATION_LEVELS.map((v) => (
                <option key={v} value={v}>
                  {VERIFICATION_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.verified}
              onChange={(e) => patch("verified", e.target.checked)}
              className="size-4"
            />
            Verified
          </label>
        </div>
        <div className="mt-3">
          <label className={label}>Verification note</label>
          <input
            value={form.verificationNote}
            onChange={(e) => patch("verificationNote", e.target.value)}
            className={field}
            placeholder="Installed and played to level 10 on 2026-08-04."
          />
        </div>
      </div>

      {/* ── Links ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {(["website", "discord", "wiki", "github", "forum"] as const).map((key) => (
          <div key={key}>
            <label className={`${label} capitalize`}>{key}</label>
            <input
              type="url"
              value={form.links[key]}
              onChange={(e) => patch("links", { ...form.links, [key]: e.target.value })}
              className={field}
              placeholder="https://…"
            />
          </div>
        ))}
      </div>

      {/* ── Media ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Hero image URL</label>
          <input
            type="url"
            value={form.branding.heroImage}
            onChange={(e) =>
              patch("branding", { ...form.branding, heroImage: e.target.value })
            }
            className={field}
          />
        </div>
        <div>
          <label className={label}>Logo URL</label>
          <input
            type="url"
            value={form.branding.logo}
            onChange={(e) => patch("branding", { ...form.branding, logo: e.target.value })}
            className={field}
          />
        </div>
      </div>

      <div>
        <label className={label}>Screenshot URLs</label>
        <textarea
          rows={3}
          value={form.branding.screenshots.join("\n")}
          onChange={(e) =>
            patch("branding", { ...form.branding, screenshots: toList(e.target.value) })
          }
          className={area}
          placeholder="One URL per line"
        />
      </div>

      {/* ── Lists ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label}>Features</label>
          <textarea
            rows={4}
            value={form.features.join("\n")}
            onChange={(e) => patch("features", toList(e.target.value))}
            className={area}
            placeholder="One per line"
          />
        </div>
        <div>
          <label className={label}>Tags</label>
          <textarea
            rows={4}
            value={form.tags.join("\n")}
            onChange={(e) => patch("tags", toList(e.target.value))}
            className={area}
            placeholder="classic-mmo&#10;pve&#10;low-xp"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Searchable. One per line.</p>
        </div>
        <div>
          <label className={label}>Languages</label>
          <textarea
            rows={4}
            value={form.languages.join("\n")}
            onChange={(e) => patch("languages", toList(e.target.value))}
            className={area}
            placeholder="English&#10;German"
          />
        </div>
      </div>

      {/* ── Findability ───────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Search aliases</label>
          <textarea
            rows={3}
            value={form.aliases.join("\n")}
            onChange={(e) => patch("aliases", toList(e.target.value))}
            className={area}
            placeholder="Turtle&#10;TWoW"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Other names people search by. Never displayed — only matched. One per line.
          </p>
        </div>
        <div>
          <label className={label}>Server name</label>
          <input
            value={form.serverName}
            onChange={(e) => patch("serverName", e.target.value)}
            className={field}
            placeholder="Nordanaar"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            The in-game server name, if this edition is a server. Searchable.
          </p>
        </div>
      </div>

      {/* ── Requirements ──────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Minimum requirements</label>
          <input
            value={form.requirements.min}
            onChange={(e) =>
              patch("requirements", { ...form.requirements, min: e.target.value })
            }
            className={field}
          />
        </div>
        <div>
          <label className={label}>Recommended requirements</label>
          <input
            value={form.requirements.recommended}
            onChange={(e) =>
              patch("requirements", { ...form.requirements, recommended: e.target.value })
            }
            className={field}
          />
        </div>
      </div>
      <div>
        <label className={label}>Requirement notes</label>
        <input
          value={form.requirements.notes}
          onChange={(e) => patch("requirements", { ...form.requirements, notes: e.target.value })}
          className={field}
          placeholder="Requires a clean 1.12 client — patched clients will not connect."
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !form.gameSlug}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Saving…" : mode === "create" ? "Create edition" : "Save changes"}
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

/**
 * Fields for the selected install method only.
 *
 * Mirrors the resolver registry: one branch per method, each reading its own
 * config block. Adding a method means adding a case here and a resolver — no
 * other component changes.
 */
function InstallMethodFields({
  method,
  config,
  patchConfig,
}: {
  method: InstallMethod;
  config: EditionInstallConfig;
  patchConfig: <M extends keyof EditionInstallConfig>(
    method: M,
    value: Partial<NonNullable<EditionInstallConfig[M]>>
  ) => void;
}) {
  switch (method) {
    case "steam":
      return (
        <Field
          label="Steam app ID"
          value={config.steam?.appId ?? ""}
          onChange={(v) => patchConfig("steam", { appId: v })}
          placeholder="440"
        />
      );
    case "epic":
      return (
        <>
          <Field
            label="Epic product slug"
            value={config.epic?.productSlug ?? ""}
            onChange={(v) => patchConfig("epic", { productSlug: v })}
          />
          <Field
            label="Launch URL (optional)"
            value={config.epic?.launchUrl ?? ""}
            onChange={(v) => patchConfig("epic", { launchUrl: v })}
          />
        </>
      );
    case "gog":
      return (
        <Field
          label="GOG product URL"
          value={config.gog?.productUrl ?? ""}
          onChange={(v) => patchConfig("gog", { productUrl: v })}
        />
      );
    case "itch":
      return (
        <Field
          label="itch.io page URL"
          value={config.itch?.pageUrl ?? ""}
          onChange={(v) => patchConfig("itch", { pageUrl: v })}
        />
      );
    case "browser":
      return (
        <Field
          label="Play URL"
          value={config.browser?.playUrl ?? ""}
          onChange={(v) => patchConfig("browser", { playUrl: v })}
        />
      );
    case "official_download":
      return (
        <>
          <Field
            label="Download URL"
            value={config.official_download?.url ?? ""}
            onChange={(v) => patchConfig("official_download", { url: v })}
          />
          <Field
            label="Download size (MB)"
            type="number"
            value={String(config.official_download?.sizeMB ?? "")}
            onChange={(v) =>
              patchConfig("official_download", { sizeMB: Number(v) || undefined })
            }
          />
        </>
      );
    case "external_installer":
      return (
        <>
          <Field
            label="Installer URL"
            value={config.external_installer?.url ?? ""}
            onChange={(v) => patchConfig("external_installer", { url: v })}
          />
          <Field
            label="Instructions"
            value={config.external_installer?.instructions ?? ""}
            onChange={(v) => patchConfig("external_installer", { instructions: v })}
          />
        </>
      );
    case "mobile_store":
      return (
        <>
          <Field
            label="Google Play URL"
            value={config.mobile_store?.androidUrl ?? ""}
            onChange={(v) => patchConfig("mobile_store", { androidUrl: v })}
          />
          <Field
            label="App Store URL"
            value={config.mobile_store?.iosUrl ?? ""}
            onChange={(v) => patchConfig("mobile_store", { iosUrl: v })}
          />
        </>
      );
    case "playbound_installer":
      return (
        <>
          <Field
            label="Recipe kind"
            value={config.playbound_installer?.kind ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { kind: v })}
            placeholder="github-zip · direct-installer · direct-exe …"
          />
          <Field
            label="GitHub repo"
            value={config.playbound_installer?.repo ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { repo: v })}
            placeholder="owner/repo"
          />
          <Field
            label="Asset pattern"
            value={config.playbound_installer?.assetPattern ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { assetPattern: v })}
          />
          <Field
            label="Direct URL"
            value={config.playbound_installer?.url ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { url: v })}
          />
          <Field
            label="Executable hint"
            value={config.playbound_installer?.exeHint ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { exeHint: v })}
          />
        </>
      );
    case "manual":
      return (
        <ManualSteps
          steps={config.manual?.steps ?? []}
          onChange={(steps) => patchConfig("manual", { steps })}
        />
      );
    default:
      return null;
  }
}

function Field({
  label: text,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className={label}>{text}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={field}
        placeholder={placeholder}
      />
    </div>
  );
}

function ManualSteps({
  steps,
  onChange,
}: {
  steps: NonNullable<EditionInstallConfig["manual"]>["steps"];
  onChange: (steps: NonNullable<NonNullable<EditionInstallConfig["manual"]>["steps"]>) => void;
}) {
  const list = steps ?? [];
  return (
    <div>
      <label className={label}>Install steps</label>
      <div className="mt-2 space-y-2">
        {list.map((step, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-border p-2">
            <span className="mt-2 w-4 shrink-0 text-center text-xs font-bold text-muted-foreground">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <input
                value={step.text}
                onChange={(e) => {
                  const next = [...list];
                  next[i] = { ...step, text: e.target.value };
                  onChange(next);
                }}
                className={`${field} mt-0`}
                placeholder="What the reader should do"
              />
              <input
                value={step.command ?? ""}
                onChange={(e) => {
                  const next = [...list];
                  next[i] = { ...step, command: e.target.value || null };
                  onChange(next);
                }}
                className={`${field} mt-0 font-mono text-xs`}
                placeholder="Optional command"
              />
            </div>
            <select
              value={step.platform ?? "all"}
              onChange={(e) => {
                const next = [...list];
                next[i] = { ...step, platform: e.target.value };
                onChange(next);
              }}
              className={`${field} mt-0 !w-28 shrink-0`}
            >
              <option value="all">All</option>
              <option value="windows">Windows</option>
              <option value="macos">macOS</option>
              <option value="linux">Linux</option>
            </select>
            <button
              type="button"
              onClick={() => onChange(list.filter((_, x) => x !== i))}
              className="mt-1.5 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={`Remove step ${i + 1}`}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...list, { platform: "all", text: "", command: null }])}
        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
      >
        <Plus className="size-3" /> Add step
      </button>
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
