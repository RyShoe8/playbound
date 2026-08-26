"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export default function AdminDiscordExclusionsPage() {
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [newSlug, setNewSlug] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/discord-exclusions")
      .then((res) => res.json())
      .then((data) => {
        setExclusions(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlug.trim()) return;
    
    try {
      const res = await fetch("/api/admin/discord-exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", slug: newSlug.trim() }),
      });
      if (res.ok) {
        setExclusions(await res.json());
        setNewSlug("");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleRemove = async (slug: string) => {
    try {
      const res = await fetch("/api/admin/discord-exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", slug }),
      });
      if (res.ok) {
        setExclusions(await res.json());
      }
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Discord Exclusions</h1>
        <p className="mt-1 text-muted-foreground">
          Editions listed here will not have a Discord channel provisioned for them. The game will still remain a franchise category if it has other public editions.
        </p>
      </div>

      <div className="bg-card rounded-lg border border-border shadow-sm p-6">
        <form onSubmit={handleAdd} className="flex gap-4 items-end mb-8">
          <div className="flex-1">
            <label htmlFor="slug" className="block text-sm font-medium mb-1">
              Edition Slug to Exclude
            </label>
            <input
              id="slug"
              type="text"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="e.g. ysoccer-tournament"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={!newSlug.trim()}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            <Plus className="size-4" /> Add Exclusion
          </button>
        </form>

        <div className="space-y-2">
          {exclusions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No exclusions found.</p>
          ) : (
            exclusions.map((slug) => (
              <div key={slug} className="flex items-center justify-between p-3 border border-border rounded-md bg-secondary/20">
                <span className="font-mono text-sm font-medium">{slug}</span>
                <button
                  onClick={() => handleRemove(slug)}
                  className="text-red-500 hover:text-red-600 transition-colors p-1"
                  title="Remove exclusion"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
