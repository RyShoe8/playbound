"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ModClassificationFlat, ModClassificationNode } from "@/lib/modClassifications";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  classificationToEdit?: ModClassificationFlat | null;
  initialParentId?: string | null;
  flatList: ModClassificationFlat[];
}

export function ModClassificationModal({
  open,
  onClose,
  onSaved,
  classificationToEdit,
  initialParentId,
  flatList,
}: Props) {
  const isEditing = Boolean(classificationToEdit);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [parentId, setParentId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (classificationToEdit) {
      setName(classificationToEdit.name);
      setSlug(classificationToEdit.slug);
      setSlugManual(true);
      setParentId(classificationToEdit.parentId || "");
      setDescription(classificationToEdit.description || "");
      setIcon(classificationToEdit.icon || "");
      setSortOrder(classificationToEdit.sortOrder ?? 0);
      setIsActive(classificationToEdit.isActive !== false);
    } else {
      setName("");
      setSlug("");
      setSlugManual(false);
      setParentId(initialParentId || "");
      setDescription("");
      setIcon("");
      setSortOrder(0);
      setIsActive(true);
    }
    setError(null);
  }, [classificationToEdit, initialParentId, open]);

  function autoSlug(val: string) {
    return val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function handleNameChange(val: string) {
    setName(val);
    if (!slugManual && !isEditing) {
      setSlug(autoSlug(val));
    }
  }

  if (!open) return null;

  // Prevent selecting self or descendant as parent
  const disabledParentIds = new Set<string>();
  if (isEditing && classificationToEdit) {
    disabledParentIds.add(classificationToEdit.id);

    // Collect all descendants from flatList
    const childrenMap = new Map<string, string[]>();
    for (const item of flatList) {
      if (item.parentId) {
        if (!childrenMap.has(item.parentId)) childrenMap.set(item.parentId, []);
        childrenMap.get(item.parentId)!.push(item.id);
      }
    }

    const queue = [classificationToEdit.id];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      disabledParentIds.add(curr);
      const ch = childrenMap.get(curr) || [];
      for (const c of ch) queue.push(c);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      slug: (slug.trim() || autoSlug(name)).toLowerCase(),
      parentId: parentId ? parentId : null,
      description: description.trim() || null,
      icon: icon.trim() || null,
      sortOrder: Number(sortOrder) || 0,
      isActive,
    };

    try {
      const url = isEditing
        ? `/api/admin/mod-classifications/${classificationToEdit!.id}`
        : "/api/admin/mod-classifications";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to save classification");
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="text-lg font-bold text-foreground">
            {isEditing ? "Edit Classification" : "Add Mod Classification"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Fighter, Gameplay Overhaul, Aircraft"
              className="w-full rounded-xl border border-border bg-secondary px-3.5 py-2 text-sm font-semibold outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Slug <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugManual(true);
              }}
              placeholder="e.g. fighter, gameplay-overhaul"
              className="w-full rounded-xl border border-border bg-secondary px-3.5 py-2 text-sm font-semibold outline-none focus:border-primary font-mono text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Parent Classification
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary px-3.5 py-2 text-sm font-semibold outline-none focus:border-primary"
            >
              <option value="">[ None — Top-Level Classification ]</option>
              {flatList.map((item) => {
                const disabled = disabledParentIds.has(item.id);
                const indent = "— ".repeat(item.depth);
                return (
                  <option key={item.id} value={item.id} disabled={disabled}>
                    {indent} {item.name} {disabled ? "(cannot be parent)" : ""}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Description (optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of what belongs in this category..."
              className="w-full rounded-xl border border-border bg-secondary px-3.5 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Sort Order
              </label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-border bg-secondary px-3.5 py-2 text-sm font-semibold outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Icon (optional)
              </label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="e.g. plane, shield"
                className="w-full rounded-xl border border-border bg-secondary px-3.5 py-2 text-sm font-semibold outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="active-check"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 rounded accent-primary"
            />
            <label htmlFor="active-check" className="text-sm font-semibold text-foreground cursor-pointer">
              Active (visible to users and editor)
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Classification"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
