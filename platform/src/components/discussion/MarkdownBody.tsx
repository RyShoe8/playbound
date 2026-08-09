"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";
import { withOutboundUtm } from "@/lib/utm";

export function MarkdownBody({
  content,
  className,
  spoilers,
}: {
  content: string;
  className?: string;
  spoilers?: boolean;
}) {
  return (
    <div
      className={cn(
        "prose-discussion text-sm leading-relaxed text-foreground/90 [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-secondary [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        spoilers && "rounded-lg border border-amber-500/30 bg-amber-500/5 p-3",
        className
      )}
    >
      {spoilers ? (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-amber-600 dark:text-amber-400">
            Spoiler — click to reveal
          </summary>
          <div className="mt-2">
            <MarkdownInner content={content} />
          </div>
        </details>
      ) : (
        <MarkdownInner content={content} />
      )}
    </div>
  );
}

function MarkdownInner({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        a: ({ href, children }) => (
          <a
            href={href ? withOutboundUtm(href, { campaign: "discussion" }) : href}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
