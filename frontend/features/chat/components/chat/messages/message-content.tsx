"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MessageBlock } from "@/features/chat/types";
import type { ToolUseBlock, ToolResultBlock } from "@/features/chat/types";
import { Brain } from "lucide-react";
import { ToolChain } from "./tool-chain";
import remarkBreaks from "remark-breaks";
import { MarkdownCode, MarkdownPre } from "@/components/shared/markdown-code";
import { useT } from "@/lib/i18n/client";

type LinkProps = {
  children?: React.ReactNode;
  href?: string;
  ref?: React.Ref<HTMLAnchorElement>;
};

const ImgBlock = ({
  src,
  alt,
  ...props
}: React.DetailedHTMLProps<
  React.ImgHTMLAttributes<HTMLImageElement>,
  HTMLImageElement
>) => {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} {...props} />;
};

// Memoized link component
const MarkdownLink = ({ children, href, ...props }: LinkProps) => (
  <a
    className="text-foreground underline underline-offset-4 decoration-muted-foreground/30 hover:decoration-foreground transition-colors"
    target="_blank"
    rel="noopener noreferrer"
    href={href}
    {...props}
  >
    {children}
  </a>
);

// Extract markdown components configuration outside component to avoid recreation
const markdownComponents = {
  pre: MarkdownPre,
  code: MarkdownCode,
  a: MarkdownLink,
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-xl font-bold mb-4 mt-6 text-foreground">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-lg font-bold mb-3 mt-5 text-foreground">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-base font-bold mb-2 mt-4 text-foreground">
      {children}
    </h3>
  ),
  hr: () => <hr className="my-4 border-border" />,
  img: ImgBlock,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-4 rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-muted/50">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody className="divide-y divide-border">{children}</tbody>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border-b border-border px-4 py-3 text-left font-semibold text-foreground">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border-b border-border px-4 py-3 text-foreground">
      {children}
    </td>
  ),
};

// Remark plugins array - stable reference
const remarkPlugins = [remarkGfm, remarkBreaks];

// Prose class for markdown content
const proseClass =
  "prose prose-base dark:prose-invert max-w-none break-words break-all w-full min-w-0 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:break-words [&_p]:break-words [&_p]:break-all [&_*]:break-words [&_*]:break-all";

// Helper function to extract text content from message
const getTextContent = (content: string | MessageBlock[]): string => {
  const clean = (text: string) => text.replace(/\uFFFD/g, "");

  if (typeof content === "string") {
    return clean(content);
  }
  if (Array.isArray(content)) {
    const textBlocks = content.filter(
      (block: MessageBlock) => block._type === "TextBlock",
    );
    return textBlocks
      .map((block: MessageBlock) =>
        block._type === "TextBlock" ? clean(block.text) : "",
      )
      .join("\n\n");
  }
  return clean(String(content));
};

// Helper to group blocks by type
const groupBlocks = (
  content: MessageBlock[],
): { type: "text" | "tool" | "thinking"; blocks: MessageBlock[] }[] => {
  const groups: {
    type: "text" | "tool" | "thinking";
    blocks: MessageBlock[];
  }[] = [];
  let currentGroup: {
    type: "text" | "tool" | "thinking";
    blocks: MessageBlock[];
  } | null = null;

  for (const block of content) {
    const isTool =
      block._type === "ToolUseBlock" || block._type === "ToolResultBlock";
    const type = isTool
      ? "tool"
      : block._type === "ThinkingBlock"
        ? "thinking"
        : "text";

    if (!currentGroup || currentGroup.type !== type) {
      currentGroup = { type, blocks: [] };
      groups.push(currentGroup);
    }
    currentGroup.blocks.push(block);
  }

  return groups;
};

interface MessageContentProps {
  content: string | MessageBlock[];
}

const MessageContentComponent = ({ content }: MessageContentProps) => {
  const { t } = useT("translation");

  const textContent = getTextContent(content);

  // If content is string, render as before
  if (typeof content === "string") {
    return (
      <div className={proseClass}>
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          components={markdownComponents}
        >
          {textContent}
        </ReactMarkdown>
      </div>
    );
  }

  // Handle array of blocks (Tools + Text)
  const groups = groupBlocks(content);

  return (
    <div className="space-y-4 w-full min-w-0">
      {groups.map((group, index) => {
        if (group.type === "tool") {
          return (
            <ToolChain
              key={index}
              blocks={group.blocks as (ToolUseBlock | ToolResultBlock)[]}
            />
          );
        } else if (group.type === "thinking") {
          const thinking = group.blocks
            .map((b) => (b._type === "ThinkingBlock" ? b.thinking : ""))
            .join("\n\n")
            .trim();

          if (!thinking) return null;

          return (
            <details
              key={index}
              className="rounded-md border border-border/60 bg-muted/20 px-3 py-2"
            >
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-2 select-none">
                <div className="flex items-center gap-1.5">
                  <Brain className="size-3.5" />
                  <span>{t("chat.thinkingTitle")}</span>
                </div>
              </summary>
              <div className="mt-2 border-t border-border/50 pt-2 text-xs whitespace-pre-wrap break-words break-all font-mono text-foreground/90">
                {thinking}
              </div>
            </details>
          );
        } else {
          const text = group.blocks
            .map((b) => (b._type === "TextBlock" ? b.text : ""))
            .join("\n\n");
          if (!text.trim()) return null;

          return (
            <div key={index} className={proseClass}>
              <ReactMarkdown
                remarkPlugins={remarkPlugins}
                components={markdownComponents}
              >
                {text}
              </ReactMarkdown>
            </div>
          );
        }
      })}
    </div>
  );
};

export const MessageContent = React.memo(
  MessageContentComponent,
  (prev, next) => prev.content === next.content,
);
