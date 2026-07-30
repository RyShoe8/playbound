"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, Badge } from "@/components/ui/bits";
import { MarkdownBody } from "@/components/discussion/MarkdownBody";
import {
  AcceptSolutionButton,
  HelpfulButton,
  ReplyComposer,
  ReportButton,
} from "@/components/discussion/TopicActions";
import { CATEGORY_META, categorySupportsSolved, type DiscussionCategory } from "@/lib/discussion/categories";
import { formatRelative } from "@/lib/discussion/formatRelative";
import { cn } from "@/lib/utils";

function hueFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * 17) % 360;
  return h;
}

export type TopicView = {
  _id: string;
  gameSlug: string;
  slug: string;
  title: string;
  body: string;
  category: DiscussionCategory;
  tags: string[];
  hasSpoilers?: boolean;
  status: string;
  isPinned: boolean;
  isSolved: boolean;
  acceptedReplyId?: string | null;
  authorId: string;
  authorUsername: string;
  createdAt: string | Date;
  replyCount: number;
  viewCount: number;
};

export type ReplyView = {
  _id: string;
  body: string;
  authorId: string;
  authorUsername: string;
  createdAt: string | Date;
  status: string;
  isAcceptedSolution: boolean;
  quotedReplyId?: string | null;
  replyToUsername?: string | null;
};

export function TopicThread({
  gameTitle,
  topic,
  replies,
  accepted,
  isSignedIn,
  isAdmin,
  canAccept,
}: {
  gameTitle: string;
  topic: TopicView;
  replies: ReplyView[];
  accepted: ReplyView | null;
  isSignedIn: boolean;
  isAdmin: boolean;
  canAccept: boolean;
}) {
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const cat = CATEGORY_META[topic.category];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link href={`/games/${topic.gameSlug}`} className="hover:text-foreground">
          {gameTitle}
        </Link>
        {" › "}
        <Link href={`/games/${topic.gameSlug}?tab=discussion`} className="hover:text-foreground">
          Discussion
        </Link>
        {" › "}
        <span className="text-foreground">{cat?.label ?? topic.category}</span>
      </nav>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          {topic.isSolved && (
            <Badge tone="brand" className="!bg-emerald-600 !text-white">
              Solved
            </Badge>
          )}
          {topic.isPinned && <Badge tone="outline">Pinned</Badge>}
          {topic.status === "locked" && <Badge tone="outline">Locked</Badge>}
          <Badge tone="neutral">{cat?.shortLabel}</Badge>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{topic.title}</h1>
        {topic.tags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topic.tags.map((t) => (
              <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <PostCard
        username={topic.authorUsername}
        date={topic.createdAt}
        body={topic.body}
        spoilers={topic.hasSpoilers}
        footer={
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              onClick={() => {
                const el = document.getElementById("reply-composer");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Reply
            </button>
            <HelpfulButton targetType="topic" targetId={String(topic._id)} />
            {isSignedIn && <ReportButton targetType="topic" targetId={String(topic._id)} />}
            {isAdmin && (
              <AdminModerate topicId={String(topic._id)} isPinned={topic.isPinned} status={topic.status} />
            )}
          </div>
        }
      />

      {accepted && (
        <section className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
          <p className="mb-3 text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
            Accepted solution
          </p>
          <PostCard
            username={accepted.authorUsername}
            date={accepted.createdAt}
            body={accepted.body}
            highlight
          />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-bold">
          Replies{" "}
          <span className="text-sm font-normal text-muted-foreground">({topic.replyCount})</span>
        </h2>
        {replies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No replies yet.</p>
        ) : (
          replies.map((r) => (
            <PostCard
              key={String(r._id)}
              username={r.authorUsername}
              date={r.createdAt}
              body={r.body}
              edited={r.status === "edited"}
              quoteLabel={r.replyToUsername ? `Replying to @${r.replyToUsername}` : undefined}
              footer={
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                    onClick={() => setQuoteId(String(r._id))}
                  >
                    Quote
                  </button>
                  <HelpfulButton targetType="reply" targetId={String(r._id)} />
                  {canAccept &&
                    categorySupportsSolved(topic.category) &&
                    !r.isAcceptedSolution && (
                      <AcceptSolutionButton replyId={String(r._id)} />
                    )}
                  {r.isAcceptedSolution && (
                    <span className="text-xs font-semibold text-emerald-600">Solution</span>
                  )}
                  {isSignedIn && <ReportButton targetType="reply" targetId={String(r._id)} />}
                </div>
              }
            />
          ))
        )}
      </section>

      <div id="reply-composer">
        <ReplyComposer
          topicId={String(topic._id)}
          gameSlug={topic.gameSlug}
          isSignedIn={isSignedIn}
          locked={topic.status === "locked"}
          quotedReplyId={quoteId}
          onClearQuote={() => setQuoteId(null)}
        />
      </div>
    </div>
  );
}

function PostCard({
  username,
  date,
  body,
  spoilers,
  footer,
  highlight,
  edited,
  quoteLabel,
}: {
  username: string;
  date: string | Date;
  body: string;
  spoilers?: boolean;
  footer?: React.ReactNode;
  highlight?: boolean;
  edited?: boolean;
  quoteLabel?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        highlight && "border-emerald-500/30"
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar name={username} hue={hueFromName(username)} size="sm" />
        <div>
          <p className="text-sm font-bold">{username}</p>
          <p className="text-xs text-muted-foreground">
            {formatRelative(date)}
            {edited ? " · edited" : ""}
          </p>
        </div>
      </div>
      {quoteLabel && (
        <p className="mt-2 text-xs font-medium text-muted-foreground">{quoteLabel}</p>
      )}
      <div className="mt-3">
        <MarkdownBody content={body} spoilers={spoilers} />
      </div>
      {footer && <div className="mt-3 border-t border-border pt-3">{footer}</div>}
    </article>
  );
}

function AdminModerate({
  topicId,
  isPinned,
  status,
}: {
  topicId: string;
  isPinned: boolean;
  status: string;
}) {
  const [msg, setMsg] = useState("");

  async function act(action: string) {
    setMsg("");
    const res = await fetch(`/api/admin/community/topics/${topicId}/moderate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => null);
    setMsg(res.ok ? `Done: ${action}` : data?.error ?? "Failed");
    if (res.ok) window.location.reload();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="text-xs font-semibold text-primary" onClick={() => act(isPinned ? "unpin" : "pin")}>
        {isPinned ? "Unpin" : "Pin"}
      </button>
      <button
        type="button"
        className="text-xs font-semibold text-primary"
        onClick={() => act(status === "locked" ? "unlock" : "lock")}
      >
        {status === "locked" ? "Unlock" : "Lock"}
      </button>
      <button type="button" className="text-xs font-semibold text-destructive" onClick={() => act("remove")}>
        Remove
      </button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </span>
  );
}
