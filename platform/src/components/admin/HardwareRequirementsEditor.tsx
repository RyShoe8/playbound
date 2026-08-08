"use client";

import { PERFORMANCE_TIERS, REQUIREMENT_SOURCES, GRAPHICS_APIS } from "@/lib/hardware/types";
import type { HardwareRequirementsBlock, RequirementSpec } from "@/lib/hardware/types";

const field =
  "mt-1 h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring";
const label = "text-xs font-semibold text-muted-foreground";

function SpecEditor({
  title,
  value,
  onChange,
}: {
  title: string;
  value?: RequirementSpec;
  onChange: (next: RequirementSpec | undefined) => void;
}) {
  const v = value || {};
  function patch(p: Partial<RequirementSpec>) {
    const next = { ...v, ...p };
    const empty =
      !next.cpuTier &&
      !next.gpuTier &&
      !next.ramMB &&
      !next.vramMB &&
      !next.storageMB &&
      !next.cpuText &&
      !next.gpuText &&
      !(next.os && next.os.length) &&
      !(next.apis && next.apis.length) &&
      !next.notes;
    onChange(empty ? undefined : next);
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
      <p className="text-sm font-bold">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={label}>CPU tier</label>
          <select
            className={field}
            value={v.cpuTier || ""}
            onChange={(e) =>
              patch({ cpuTier: (e.target.value || undefined) as RequirementSpec["cpuTier"] })
            }
          >
            <option value="">—</option>
            {PERFORMANCE_TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>CPU text</label>
          <input
            className={field}
            value={v.cpuText || ""}
            onChange={(e) => patch({ cpuText: e.target.value || undefined })}
            placeholder="e.g. Intel Core i5-6600"
          />
        </div>
        <div>
          <label className={label}>GPU tier</label>
          <select
            className={field}
            value={v.gpuTier || ""}
            onChange={(e) =>
              patch({ gpuTier: (e.target.value || undefined) as RequirementSpec["gpuTier"] })
            }
          >
            <option value="">—</option>
            {PERFORMANCE_TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>GPU text</label>
          <input
            className={field}
            value={v.gpuText || ""}
            onChange={(e) => patch({ gpuText: e.target.value || undefined })}
            placeholder="e.g. GTX 1060"
          />
        </div>
        <div>
          <label className={label}>RAM (MB)</label>
          <input
            type="number"
            className={field}
            value={v.ramMB ?? ""}
            onChange={(e) =>
              patch({ ramMB: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </div>
        <div>
          <label className={label}>VRAM (MB)</label>
          <input
            type="number"
            className={field}
            value={v.vramMB ?? ""}
            onChange={(e) =>
              patch({ vramMB: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </div>
        <div>
          <label className={label}>Storage (MB)</label>
          <input
            type="number"
            className={field}
            value={v.storageMB ?? ""}
            onChange={(e) =>
              patch({ storageMB: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </div>
        <div>
          <label className={label}>APIs (comma-separated)</label>
          <input
            className={field}
            value={(v.apis || []).join(",")}
            onChange={(e) => {
              const apis = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter((s): s is (typeof GRAPHICS_APIS)[number] =>
                  (GRAPHICS_APIS as readonly string[]).includes(s)
                );
              patch({ apis: apis.length ? apis : undefined });
            }}
            placeholder="dx11, vulkan"
          />
        </div>
      </div>
      <div>
        <label className={label}>OS (comma: windows,macos,linux)</label>
        <input
          className={field}
          value={(v.os || []).join(",")}
          onChange={(e) => {
            const os = e.target.value
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter((s): s is "windows" | "macos" | "linux" =>
                ["windows", "macos", "linux"].includes(s)
              );
            patch({ os: os.length ? os : undefined });
          }}
        />
      </div>
    </div>
  );
}

export function HardwareRequirementsEditor({
  value,
  onChange,
}: {
  value?: HardwareRequirementsBlock | null;
  onChange: (next: HardwareRequirementsBlock | null) => void;
}) {
  const block = value || {};

  function setBlock(next: HardwareRequirementsBlock) {
    const empty =
      !next.min &&
      !next.recommended &&
      !next.target?.resolution &&
      !next.target?.fps &&
      !next.target?.preset &&
      !next.provenance;
    onChange(empty ? null : next);
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
      <div>
        <p className="text-sm font-bold">Structured hardware requirements</p>
        <p className="text-[11px] text-muted-foreground">
          Optional. Powers PlayBound compatibility — leave blank rather than guessing.
        </p>
      </div>
      <SpecEditor
        title="Minimum"
        value={block.min}
        onChange={(min) => setBlock({ ...block, min })}
      />
      <SpecEditor
        title="Recommended"
        value={block.recommended}
        onChange={(recommended) => setBlock({ ...block, recommended })}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className={label}>Target resolution</label>
          <input
            className={field}
            value={block.target?.resolution || ""}
            onChange={(e) =>
              setBlock({
                ...block,
                target: { ...block.target, resolution: e.target.value || undefined },
              })
            }
            placeholder="1080p"
          />
        </div>
        <div>
          <label className={label}>Target FPS</label>
          <input
            type="number"
            className={field}
            value={block.target?.fps ?? ""}
            onChange={(e) =>
              setBlock({
                ...block,
                target: {
                  ...block.target,
                  fps: e.target.value ? Number(e.target.value) : undefined,
                },
              })
            }
          />
        </div>
        <div>
          <label className={label}>Graphics preset</label>
          <input
            className={field}
            value={block.target?.preset || ""}
            onChange={(e) =>
              setBlock({
                ...block,
                target: { ...block.target, preset: e.target.value || undefined },
              })
            }
            placeholder="Medium"
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={label}>Source</label>
          <select
            className={field}
            value={block.provenance?.source || "unverified"}
            onChange={(e) =>
              setBlock({
                ...block,
                provenance: {
                  ...block.provenance,
                  source: e.target.value as (typeof REQUIREMENT_SOURCES)[number],
                },
              })
            }
          >
            {REQUIREMENT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Source URL</label>
          <input
            className={field}
            value={block.provenance?.sourceUrl || ""}
            onChange={(e) =>
              setBlock({
                ...block,
                provenance: {
                  source: block.provenance?.source || "unverified",
                  ...block.provenance,
                  sourceUrl: e.target.value || null,
                },
              })
            }
            placeholder="https://…"
          />
        </div>
        <div>
          <label className={label}>Verified date (ISO)</label>
          <input
            className={field}
            value={block.provenance?.verifiedAt || ""}
            onChange={(e) =>
              setBlock({
                ...block,
                provenance: {
                  source: block.provenance?.source || "unverified",
                  ...block.provenance,
                  verifiedAt: e.target.value || null,
                },
              })
            }
            placeholder="2026-08-08"
          />
        </div>
      </div>
    </div>
  );
}

export function ModHardwareRequirementsEditor({
  value,
  onChange,
}: {
  value?: { additional?: RequirementSpec; provenance?: HardwareRequirementsBlock["provenance"] } | null;
  onChange: (
    next: { additional?: RequirementSpec; provenance?: HardwareRequirementsBlock["provenance"] } | null
  ) => void;
}) {
  const block = value || {};
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
      <div>
        <p className="text-sm font-bold">Additive hardware requirements</p>
        <p className="text-[11px] text-muted-foreground">
          Raises effective floors when this mod is selected (storage, GPU tier, etc.).
        </p>
      </div>
      <SpecEditor
        title="Additional"
        value={block.additional}
        onChange={(additional) => {
          const next = { ...block, additional };
          onChange(additional || block.provenance ? next : null);
        }}
      />
    </div>
  );
}
