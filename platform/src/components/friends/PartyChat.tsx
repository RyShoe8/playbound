"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { CADENCE } from "@/lib/realtime/cadence";
import { useVisiblePolling } from "@/hooks/useVisiblePolling";
import { DiscordLinkPrompt } from "@/components/friends/DiscordLinkPrompt";

type ChatMessage = {
  id: string;
  content: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
};

export function PartyChat({
  partyId,
  inviteUrl,
}: {
  partyId: string;
  inviteUrl?: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | undefined>(undefined);

  const load = useCallback(
    async (after?: string) => {
      try {
        const qs = after ? `?after=${encodeURIComponent(after)}` : "";
        const res = await fetch(`/api/parties/${partyId}/chat${qs}`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: ChatMessage[] };
        const next = Array.isArray(data.messages) ? data.messages : [];
        setMessages((prev) => {
          const merged = after
            ? [...prev, ...next.filter((m) => !prev.some((p) => p.id === m.id))]
            : next;
          lastIdRef.current = merged[merged.length - 1]?.id;
          return merged;
        });
      } catch {
        /* ignore poll errors */
      }
    },
    [partyId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Chat is the fastest poll on the page. A hidden tab does not need it, and a
  // returning one wants it now rather than up to a tick late.
  useVisiblePolling(() => load(lastIdRef.current), CADENCE.partyChatPollMs);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/parties/${partyId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await res.json()) as { message?: ChatMessage; error?: string };
      if (!res.ok) {
        setError(data.error || "Could not send");
        return;
      }
      setDraft("");
      if (data.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === data.message!.id) ? prev : [...prev, data.message!]
        );
      } else {
        void load();
      }
    } catch {
      setError("Could not send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h4 className="flex items-center gap-2 text-sm font-bold">
          <MessageCircle className="size-4" /> Party chat
        </h4>
      </div>

      <div ref={scroller} className="max-h-56 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet. Say something to the party.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="text-sm">
              <span className="font-semibold text-primary">{m.username}:</span>
              <span className="ml-2 text-foreground">{m.content}</span>
            </div>
          ))
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          placeholder="Message the party…"
          disabled={sending}
          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="size-4" />
        </button>
      </form>
      {error ? <p className="px-3 pb-2 text-xs text-destructive">{error}</p> : null}

      <DiscordLinkPrompt
        open={promptOpen}
        inviteUrl={inviteUrl}
        onClose={() => setPromptOpen(false)}
      />
    </div>
  );
}
