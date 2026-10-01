import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";

/** Markdown is rendered as safe elements; raw HTML is never enabled. */
export function BlogMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn(
      "space-y-5 text-base leading-8 text-foreground/90",
      "[&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:leading-tight",
      "[&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-bold",
      "[&_a]:font-semibold [&_a]:text-primary [&_a]:underline",
      "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
      "[&_li]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:pl-4 [&_blockquote]:italic",
      "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-secondary [&_pre]:p-4",
      "[&_code]:rounded [&_code]:bg-secondary [&_code]:px-1",
      "[&_img]:max-w-full [&_img]:rounded-xl [&_table]:block [&_table]:overflow-x-auto",
      className
    )}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) => {
            const external = /^https?:\/\//i.test(href || "");
            return <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>;
          },
        }}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
