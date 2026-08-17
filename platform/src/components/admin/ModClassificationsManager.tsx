"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import type { ModClassificationFlat, ModClassificationNode } from "@/lib/modClassifications";
import { ModClassificationModal } from "./ModClassificationModal";

interface Props {
  initialTree: ModClassificationNode[];
  initialFlat: ModClassificationFlat[];
}

export function ModClassificationsManager({ initialTree, initialFlat }: Props) {
  const [tree, setTree] = useState<ModClassificationNode[]>(initialTree);
  const [flat, setFlat] = useState<ModClassificationFlat[]>(initialFlat);
  const [search, setSearch] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClassification, setEditingClassification] = useState<ModClassificationFlat | null>(null);
  const [addingChildParentId, setAddingChildParentId] = useState<string | null>(null);

  const [seeding, setSeeding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function refreshData() {
    try {
      const res = await fetch("/api/admin/mod-classifications");
      if (res.ok) {
        const json = await res.json();
        setTree(json.tree || []);
        setFlat(json.flat || []);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleSeed() {
    if (!confirm("Seed initial taxonomy classifications? Existing classifications will be preserved.")) {
      return;
    }
    setSeeding(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/mod-classifications/seed", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to seed taxonomy");
      await refreshData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to seed taxonomy");
    } finally {
      setSeeding(false);
    }
  }

  async function handleDelete(node: ModClassificationNode) {
    if (node.children && node.children.length > 0) {
      alert(`Cannot delete "${node.name}" because it has ${node.children.length} sub-classification(s). Please delete or reassign them first.`);
      return;
    }

    const warning =
      node.modCount > 0
        ? `"${node.name}" is assigned to ${node.modCount} mod(s). Deleting it will automatically remove this classification from all of them.\n\nAre you sure you want to delete "${node.name}"?`
        : `Are you sure you want to delete "${node.name}"?`;

    if (!confirm(warning)) return;

    setDeletingId(node.id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/mod-classifications/${node.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete classification");
      await refreshData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete classification");
    } finally {
      setDeletingId(null);
    }
  }

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setCollapsedIds(new Set());
  }

  function collapseAll() {
    const allParentIds = new Set<string>();
    function collect(nodes: ModClassificationNode[]) {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          allParentIds.add(n.id);
          collect(n.children);
        }
      }
    }
    collect(tree);
    setCollapsedIds(allParentIds);
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

  const totalCount = flat.length;

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
          {errorMsg}
        </div>
      )}

      {/* Top action / search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search classifications…"
            className="h-10 w-full rounded-full border border-border bg-secondary/60 pl-10 pr-4 text-sm font-semibold outline-none focus:border-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {totalCount > 0 && (
            <>
              <button
                type="button"
                onClick={expandAll}
                className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Collapse all
              </button>
            </>
          )}

          {totalCount === 0 && (
            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              <Sparkles className="size-4" />
              {seeding ? "Seeding…" : "Seed Initial Taxonomy"}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingClassification(null);
              setAddingChildParentId(null);
              setModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
          >
            <Plus className="size-4" /> Add Classification
          </button>
        </div>
      </div>

      {/* Tree container */}
      <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 backdrop-blur-sm">
        {totalCount === 0 ? (
          <div className="py-12 text-center">
            <Tag className="mx-auto size-10 text-muted-foreground/40" />
            <h3 className="mt-3 text-base font-bold text-foreground">No mod classifications yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              Start building your multi-level taxonomy or seed our curated starting taxonomy.
            </p>
            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-110"
            >
              <Sparkles className="size-4" />
              {seeding ? "Seeding Taxonomy…" : "Seed Initial Taxonomy"}
            </button>
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No classifications match &ldquo;{search}&rdquo;.
          </div>
        ) : (
          <div className="space-y-1">
            {filteredTree.map((node) => (
              <TreeNodeItem
                key={node.id}
                node={node}
                collapsedIds={collapsedIds}
                onToggleCollapse={toggleCollapse}
                onAddChild={(parentId) => {
                  setEditingClassification(null);
                  setAddingChildParentId(parentId);
                  setModalOpen(true);
                }}
                onEdit={(n) => {
                  const flatMatch = flat.find((f) => f.id === n.id) || null;
                  setEditingClassification(flatMatch);
                  setAddingChildParentId(null);
                  setModalOpen(true);
                }}
                onDelete={handleDelete}
                deletingId={deletingId}
              />
            ))}
          </div>
        )}
      </div>

      <ModClassificationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={refreshData}
        classificationToEdit={editingClassification}
        initialParentId={addingChildParentId}
        flatList={flat}
      />
    </div>
  );
}

function TreeNodeItem({
  node,
  collapsedIds,
  onToggleCollapse,
  onAddChild,
  onEdit,
  onDelete,
  deletingId,
}: {
  node: ModClassificationNode;
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (node: ModClassificationNode) => void;
  onDelete: (node: ModClassificationNode) => void;
  deletingId: string | null;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.id);
  const isDeleting = deletingId === node.id;

  return (
    <div className="select-none">
      <div
        className={`group flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-secondary/70 ${
          node.depth === 0 ? "bg-secondary/30" : ""
        }`}
        style={{ marginLeft: `${node.depth * 24}px` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggleCollapse(node.id)}
              className="flex size-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground"
            >
              {isCollapsed ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </button>
          ) : (
            <div className="size-6 flex items-center justify-center text-muted-foreground/30">•</div>
          )}

          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${node.isActive ? "text-foreground" : "text-muted-foreground line-through"}`}>
              {node.name}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/80 bg-secondary/80 px-1.5 py-0.5 rounded">
              {node.slug}
            </span>
            {node.description && (
              <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-xs">
                — {node.description}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
              node.modCount > 0
                ? "bg-primary/10 text-primary font-bold"
                : "bg-secondary text-muted-foreground text-[11px]"
            }`}
          >
            {node.modCount} mod{node.modCount === 1 ? "" : "s"}
          </span>

          {!node.isActive && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
              Inactive
            </span>
          )}

          <div className="flex items-center gap-1 opacity-90 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => onAddChild(node.id)}
              title="Add child classification"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-primary transition-colors"
            >
              <FolderPlus className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(node)}
              title="Edit classification"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(node)}
              disabled={isDeleting}
              title="Delete classification"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {hasChildren && !isCollapsed && (
        <div className="mt-0.5 space-y-0.5 border-l border-border/40 ml-3 pl-0">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              collapsedIds={collapsedIds}
              onToggleCollapse={onToggleCollapse}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              deletingId={deletingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
