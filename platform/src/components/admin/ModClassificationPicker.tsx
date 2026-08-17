"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Tag, X } from "lucide-react";
import type { ModClassificationFlat, ModClassificationNode } from "@/lib/modClassifications";

interface Props {
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
}

export function ModClassificationPicker({ selectedIds, onChange }: Props) {
  const [tree, setTree] = useState<ModClassificationNode[]>([]);
  const [flat, setFlat] = useState<ModClassificationFlat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    async function loadTaxonomy() {
      try {
        const res = await fetch("/api/admin/mod-classifications");
        if (res.ok) {
          const json = await res.json();
          if (active) {
            setTree(json.tree || []);
            setFlat(json.flat || []);
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    }
    loadTaxonomy();
    return () => {
      active = false;
    };
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, ModClassificationFlat>();
    for (const item of flat) {
      map.set(item.id, item);
    }
    return map;
  }, [flat]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleId(id: string) {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  function removeId(id: string) {
    const next = new Set(selectedSet);
    next.delete(id);
    onChange(Array.from(next));
  }

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Filter tree by search query
  const filteredTree = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tree;

    function filterNodes(nodes: ModClassificationNode[]): ModClassificationNode[] {
      const result: ModClassificationNode[] = [];
      for (const n of nodes) {
        const matchesSelf =
          n.name.toLowerCase().includes(q) ||
          n.slug.toLowerCase().includes(q) ||
          (n.description && n.description.toLowerCase().includes(q));

        const filteredChildren = n.children ? filterNodes(n.children) : [];

        if (matchesSelf || filteredChildren.length > 0) {
          result.push({
            ...n,
            children: filteredChildren,
          });
        }
      }
      return result;
    }

    return filterNodes(tree);
  }, [tree, search]);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Tag className="size-3.5" /> Mod Classifications / Tags
          </label>
          <p className="text-[11px] text-muted-foreground">
            Select one or more classifications. Multi-level tags support arbitrary depth and show on cards & filters.
          </p>
        </div>

        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground underline"
          >
            Clear all ({selectedIds.length})
          </button>
        )}
      </div>

      {/* Selected tags chips */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selectedIds.map((id) => {
            const item = byId.get(id);
            const label = item ? item.path : id;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
              >
                <span>{label}</span>
                <button
                  type="button"
                  onClick={() => removeId(id)}
                  className="rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Search box inside taxonomy picker */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter taxonomy tags…"
          className="h-8 w-full rounded-lg border border-border bg-secondary/80 pl-8 pr-3 text-xs outline-none focus:border-primary"
        />
      </div>

      {/* Tree list */}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60 bg-secondary/30 p-2 text-sm">
        {loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Loading taxonomy…</div>
        ) : filteredTree.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {tree.length === 0
              ? "No classifications created yet. Visit Admin → Games → Mod Classifications to seed."
              : `No tags match "${search}".`}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredTree.map((node) => (
              <PickerTreeNode
                key={node.id}
                node={node}
                selectedSet={selectedSet}
                collapsedIds={collapsedIds}
                onToggleSelect={toggleId}
                onToggleCollapse={toggleCollapse}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PickerTreeNode({
  node,
  selectedSet,
  collapsedIds,
  onToggleSelect,
  onToggleCollapse,
}: {
  node: ModClassificationNode;
  selectedSet: Set<string>;
  collapsedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.id);
  const isChecked = selectedSet.has(node.id);

  return (
    <div>
      <div
        className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-secondary/70 transition-colors"
        style={{ marginLeft: `${node.depth * 18}px` }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggleCollapse(node.id)}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-background"
            >
              {isCollapsed ? (
                <ChevronRight className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
          ) : (
            <div className="size-5 flex items-center justify-center text-muted-foreground/30 text-xs">•</div>
          )}

          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground select-none">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggleSelect(node.id)}
              className="size-3.5 rounded accent-primary cursor-pointer"
            />
            <span>{node.name}</span>
          </label>
        </div>

        {node.description && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[180px] hidden sm:inline">
            {node.description}
          </span>
        )}
      </div>

      {hasChildren && !isCollapsed && (
        <div className="space-y-0.5 border-l border-border/30 ml-2 pl-0">
          {node.children.map((child) => (
            <PickerTreeNode
              key={child.id}
              node={child}
              selectedSet={selectedSet}
              collapsedIds={collapsedIds}
              onToggleSelect={onToggleSelect}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </div>
      )}
    </div>
  );
}
