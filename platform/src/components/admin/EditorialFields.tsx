"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useMemo } from "react";
import { Check, CircleAlert, Plus, X } from "lucide-react";
import type { GameFaq, InstallStep, QualityBar } from "@/lib/data/types";
import type { ReadinessField } from "@/lib/enrich";
import { QUALITY_BAR } from "@/lib/site";

const field =
  "mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
const area =
  "mt-1 w-full resize-y rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
const label = "text-xs font-semibold text-muted-foreground";

function wordCount(text?: string | null): number {
  return (text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Live readiness checklist.
 *
 * Mirrors the server-side gate in lib/enrich.ts so the editor sees what is
 * missing before hitting Save, rather than discovering it in a 422.
 */
export function ReadinessPanel({
  fields,
  ready,
  kind,
}: {
  fields: ReadinessField[];
  ready: boolean;
  kind: "game" | "mod";
}) {
  const done = fields.filter((f) => f.done).length;

  return (
    <section
      className={`rounded-xl border p-4 ${
        ready ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">
          {ready ? "Ready to publish" : "Not ready to publish"}
        </p>
        <span className="text-xs font-bold text-muted-foreground">
          {done} of {fields.length} complete
        </span>
      </div>

      {!ready && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Drafts save freely. Publishing needs the written fields below — a listing
          with no assessment undermines the claim that every {kind} on PlayBound
          was assessed by a person.
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {fields.map((f) => (
          <li key={f.key} className="flex gap-2.5">
            {f.done ? (
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            ) : (
              <CircleAlert
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            )}
            <div className="min-w-0">
              <p
                className={`text-xs font-semibold ${
                  f.done ? "text-muted-foreground line-through" : ""
                }`}
              >
                {f.label}
              </p>
              {!f.done && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {f.why}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Source material fetched at import — read-only, never auto-pasted anywhere. */
export function SourceMaterialPanel({
  text,
  onDismiss,
}: {
  text: string;
  onDismiss: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">Source material (README)</p>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full p-1 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss source material"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        For reading, not pasting. Copying this into the long description would be
        duplicate content and would not rank.
      </p>
      <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-secondary/50 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
        {text}
      </pre>
    </section>
  );
}

/** What the importer established, and on what evidence. */
export function EvidencePanel({ evidence }: { evidence: string[] }) {
  if (!evidence.length) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-bold">What the import could establish</p>
      <ul className="mt-2 space-y-1.5">
        {evidence.map((line) => (
          <li key={line} className="text-[11px] leading-relaxed text-muted-foreground">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Editable list of short strings, used for bestFor / notFor / comparableTo. */
export function StringListEditor({
  title,
  hint,
  values,
  suggestions = [],
  onChange,
}: {
  title: string;
  hint: string;
  values: string[];
  suggestions?: string[];
  onChange: (next: string[]) => void;
}) {
  const unused = useMemo(
    () => suggestions.filter((s) => !values.includes(s)),
    [suggestions, values]
  );

  return (
    <div>
      <label className={label}>{title}</label>
      <p className="text-[11px] text-muted-foreground">{hint}</p>

      <div className="mt-2 space-y-2">
        {/*
          Keyed by index, not by value. These rows are identified by position —
          add appends, remove filters by index, edits happen in place, and
          nothing reorders. Including the value in the key changed it on every
          keystroke, so React tore down the input and rebuilt it, dropping focus
          after a single character.
        */}
        {values.map((value, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={value}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                onChange(next);
              }}
              className={`${field} mt-0`}
            />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, x) => x !== i))}
              className="shrink-0 rounded-lg border border-border px-2.5 text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${value}`}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...values, ""])}
        className="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold"
      >
        <Plus className="size-3" /> Add
      </button>

      {unused.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-muted-foreground">
            Suggested from catalog facts — click to add, then edit into your own words:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {unused.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange([...values, s])}
                className="rounded-full border border-dashed border-border px-2.5 py-1 text-left text-[11px] hover:border-primary/50"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The five-criterion assessment. */
export function QualityBarEditor({
  value,
  onChange,
}: {
  value: QualityBar | null;
  onChange: (next: QualityBar) => void;
}) {
  const bar: QualityBar = value ?? {
    genuinelyFree: false,
    finished: false,
    activelyMaintained: false,
    standsAlone: false,
    highQuality: false,
    verdict: "",
    lastVerified: new Date().toISOString().slice(0, 10),
  };

  const met = QUALITY_BAR.filter((c) => bar[c.key]).length;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">The PlayBound Bar</p>
        <span className="text-xs font-bold text-muted-foreground">
          {met} of {QUALITY_BAR.length} met
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        A game that fails any criterion should not be listed. If you are ticking
        boxes to get past the gate, the answer is to leave the game out.
      </p>

      <div className="mt-3 space-y-2.5">
        {QUALITY_BAR.map((criterion) => (
          <label key={criterion.key} className="flex gap-2.5">
            <input
              type="checkbox"
              checked={bar[criterion.key]}
              onChange={(e) => onChange({ ...bar, [criterion.key]: e.target.checked })}
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold">{criterion.title}</span>
              <span className="block text-[11px] leading-relaxed text-muted-foreground">
                {criterion.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4">
        <label className={label}>
          Verdict — one self-contained sentence ({bar.verdict.length} chars, 40+ needed)
        </label>
        <p className="text-[11px] text-muted-foreground">
          This is the line that gets quoted. Write it so it stands alone with no
          surrounding context, e.g. &ldquo;X clears the PlayBound Bar: genuinely free,
          ready to play, curated, and high quality or showing strong potential.&rdquo;
        </p>
        <textarea
          rows={3}
          value={bar.verdict}
          onChange={(e) => onChange({ ...bar, verdict: e.target.value })}
          className={area}
        />
      </div>

      <div className="mt-3">
        <label className={label}>Last verified</label>
        <input
          type="date"
          value={bar.lastVerified?.slice(0, 10) ?? ""}
          onChange={(e) => onChange({ ...bar, lastVerified: e.target.value })}
          className={field}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Shown publicly. Maintenance status has a shelf life — re-check at least
          every six months or <code>npm run verify:maintenance</code> will fail.
        </p>
      </div>
    </section>
  );
}

/** Install steps and FAQ — auto-derived on save, editable here. */
export function DerivedContentEditor({
  installSteps,
  faq,
  onInstallStepsChange,
  onFaqChange,
}: {
  installSteps: InstallStep[];
  faq: GameFaq[];
  onInstallStepsChange: (next: InstallStep[]) => void;
  onFaqChange: (next: GameFaq[]) => void;
}) {
  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-bold">Install steps</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Generated from catalog facts when you save if left empty. Powers the
          install page and its HowTo structured data. Edit freely — your version
          always wins.
        </p>

        <div className="mt-3 space-y-2">
          {installSteps.map((step, i) => (
            <div key={i} className="rounded-lg border border-border p-2.5">
              <div className="flex gap-2">
                <PremiumSelect
                  value={step.platform}
                  onChange={(e) => {
                    const next = [...installSteps];
                    next[i] = {
                      ...step,
                      platform: e.target.value as InstallStep["platform"],
                    };
                    onInstallStepsChange(next);
                  }}
                  // !w-32 is load-bearing: `field` bakes in w-full, and Tailwind's
                  // stylesheet order let that win over a plain w-32 appended
                  // after it, stretching the select to fill the row and pushing
                  // the ml-auto remove button out past the card's right edge.
                  className={`${field} mt-0 !w-32 shrink-0`}
                >
                  <option value="all">All</option>
                  <option value="windows">Windows</option>
                  <option value="macos">macOS</option>
                  <option value="linux">Linux</option>
                </PremiumSelect>
                <button
                  type="button"
                  onClick={() => onInstallStepsChange(installSteps.filter((_, x) => x !== i))}
                  className="ml-auto shrink-0 rounded-lg border border-border px-2.5 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove step ${i + 1}`}
                >
                  <X className="size-4" />
                </button>
              </div>
              <textarea
                rows={2}
                value={step.text}
                onChange={(e) => {
                  const next = [...installSteps];
                  next[i] = { ...step, text: e.target.value };
                  onInstallStepsChange(next);
                }}
                className={area}
              />
              <input
                value={step.command ?? ""}
                placeholder="Optional command"
                onChange={(e) => {
                  const next = [...installSteps];
                  next[i] = { ...step, command: e.target.value || undefined };
                  onInstallStepsChange(next);
                }}
                className={`${field} font-mono text-xs`}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            onInstallStepsChange([...installSteps, { platform: "all", text: "" }])
          }
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold"
        >
          <Plus className="size-3" /> Add step
        </button>
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-sm font-bold">FAQ</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Generated from catalog facts when you save if left empty. Drives FAQPage
          structured data and matches question-shaped searches.
        </p>

        <div className="mt-3 space-y-2">
          {faq.map((item, i) => (
            <div key={i} className="rounded-lg border border-border p-2.5">
              <div className="flex gap-2">
                <input
                  value={item.q}
                  placeholder="Question"
                  onChange={(e) => {
                    const next = [...faq];
                    next[i] = { ...item, q: e.target.value };
                    onFaqChange(next);
                  }}
                  className={`${field} mt-0 flex-1 font-semibold`}
                />
                <button
                  type="button"
                  onClick={() => onFaqChange(faq.filter((_, x) => x !== i))}
                  className="shrink-0 rounded-lg border border-border px-2.5 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove question ${i + 1}`}
                >
                  <X className="size-4" />
                </button>
              </div>
              <textarea
                rows={2}
                value={item.a}
                placeholder="Answer"
                onChange={(e) => {
                  const next = [...faq];
                  next[i] = { ...item, a: e.target.value };
                  onFaqChange(next);
                }}
                className={area}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onFaqChange([...faq, { q: "", a: "" }])}
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold"
        >
          <Plus className="size-3" /> Add question
        </button>
      </div>
    </section>
  );
}

/** Long-form prose field with a live word count against a target. */
export function ProseField({
  title,
  hint,
  value,
  minWords,
  rows = 10,
  onChange,
}: {
  title: string;
  hint: string;
  value: string;
  minWords?: number;
  rows?: number;
  onChange: (next: string) => void;
}) {
  const words = wordCount(value);
  const short = minWords !== undefined && words < minWords;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className={label}>{title}</label>
        {minWords !== undefined && (
          <span
            className={`text-[11px] font-semibold ${
              short ? "text-muted-foreground" : "text-primary"
            }`}
          >
            {words} / {minWords} words
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={area}
      />
    </div>
  );
}
