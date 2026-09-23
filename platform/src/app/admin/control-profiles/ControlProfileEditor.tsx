"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TEMPLATE = {
  gameSlug: "",
  editionSlug: null,
  name: "PlayBound Recommended",
  version: "1.0.0",
  platform: "windows",
  inputStrategy: "keyboard_mouse",
  status: "draft",
  antiCheatCompatibility: "unknown",
  testedControllers: [],
  actions: [
    { id: "forward", label: "Move forward", output: { type: "key", vk: "W" } },
    { id: "backward", label: "Move backward", output: { type: "key", vk: "S" } },
    { id: "left", label: "Move left", output: { type: "key", vk: "A" } },
    { id: "right", label: "Move right", output: { type: "key", vk: "D" } },
  ],
  bindings: [
    { physicalInput: "LEFT_UP", actionId: "forward" },
    { physicalInput: "LEFT_DOWN", actionId: "backward" },
    { physicalInput: "LEFT_LEFT", actionId: "left" },
    { physicalInput: "LEFT_RIGHT", actionId: "right" },
  ],
  contexts: [],
  stickMouseSettings: { deadzone: 0.15, curve: "exponential", sensitivity: 1.35, acceleration: 0.35, smoothing: 0.08, maxVelocity: 900, invertY: false, precisionMultiplier: 0.4 },
  notes: "",
};

export function ControlProfileEditor({ profiles }: { profiles: Array<Record<string, unknown>> }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>("");
  const [source, setSource] = useState(JSON.stringify(TEMPLATE, null, 2));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function pick(id: string) {
    setSelected(id);
    const profile = profiles.find((p) => String(p._id) === id);
    if (!profile) {
      setSource(JSON.stringify(TEMPLATE, null, 2));
    } else {
      const { _id, gameId, createdAt, updatedAt, __v, ...editable } = profile;
      void [_id, gameId, createdAt, updatedAt, __v];
      setSource(JSON.stringify(editable, null, 2));
    }
    setMessage("");
  }

  async function save() {
    let body: unknown;
    try { body = JSON.parse(source); } catch { setMessage("The profile JSON is invalid."); return; }
    setBusy(true);
    setMessage("");
    try {
      const endpoint = selected ? `/api/admin/control-profiles/${encodeURIComponent(selected)}` : "/api/admin/control-profiles";
      const res = await fetch(endpoint, {
        method: selected ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save profile");
      setMessage("Saved. Verified profiles activate on a subsequent launcher play (the launcher refreshes profiles within a minute).");
      if (!selected && data.id) setSelected(data.id);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save profile");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!selected || !window.confirm("Delete this control profile? Players using a verified profile will lose PlayBound Controls for this game.")) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/control-profiles/${encodeURIComponent(selected)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete profile");
      pick("");
      setMessage("Profile deleted.");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not delete profile");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium">Profile
        <select className="mt-1 block w-full rounded-md border border-border bg-background p-2" value={selected} onChange={(e) => pick(e.target.value)}>
          <option value="">New profile</option>
          {profiles.map((profile) => (
            <option key={String(profile._id)} value={String(profile._id)}>
              {String(profile.gameSlug)}{profile.editionSlug ? ` / ${String(profile.editionSlug)}` : ""} — {String(profile.name)} ({String(profile.status)})
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        Bind physical inputs such as LEFT_UP, A, RT or DPAD_UP to named actions. Actions output keys or mouse buttons; the right stick moves the mouse. Keep status draft while testing. Set antiCheatCompatibility to verified only after checking the game, then mark the profile verified.
      </p>
      <label className="block text-sm font-medium">Profile recipe
        <textarea className="mt-1 block min-h-[32rem] w-full rounded-md border border-border bg-background p-3 font-mono text-xs" spellCheck={false} value={source} onChange={(e) => setSource(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Saving…" : selected ? "Save profile" : "Create profile"}
        </button>
        {selected && <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-md border border-destructive/40 px-4 py-2 text-sm text-destructive disabled:opacity-50">Delete profile</button>}
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
  );
}
