"use client";

import * as React from "react";
import { Bot, Copy, ThumbsUp, Check } from "lucide-react";
import { MessageContent } from "./message-content";
import { TypingIndicator } from "./typing-indicator";
import type {
  ChatMessage,
  MessageBlock,
  UsageResponse,
} from "@/features/chat/types";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

interface AssistantMessageProps {
  message: ChatMessage;
  runUsage?: UsageResponse | null;
  /** Whether to animate the message entrance. Defaults to true. */
  animate?: boolean;
}

function pickNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatCostUsd(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `$${value.toFixed(6)}`;
}

function formatDurationMs(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const seconds = value / 1000;
  // Keep it compact and consistent across locales.
  return seconds >= 60 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
}

const AssistantMessageComponent = ({
  message,
  runUsage,
  animate = true,
}: AssistantMessageProps) => {
  const { t } = useT("translation");
  const [isCopied, setIsCopied] = React.useState(false);
  const [isLiked, setIsLiked] = React.useState(false);

  // Helper function to extract text content from message
  const getTextContent = (content: string | MessageBlock[]): string => {
    if (typeof content === "string") {
      return content;
    }

    // If it's an array of blocks, extract text from TextBlock
    if (Array.isArray(content)) {
      const textBlocks = content.filter(
        (block: MessageBlock) => block._type === "TextBlock",
      );
      return textBlocks
        .map((block: MessageBlock) =>
          block._type === "TextBlock" ? block.text : "",
        )
        .join("\n\n");
    }

    return String(content);
  };

  const onCopy = async () => {
    try {
      const textContent = getTextContent(message.content);
      await navigator.clipboard.writeText(textContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy message", err);
    }
  };

  const onLike = () => {
    setIsLiked(!isLiked);
    // TODO: Send feedback to API
  };

  const usageJson = runUsage?.usage_json as
    | Record<string, unknown>
    | null
    | undefined;
  const inputTokens = pickNumber(usageJson?.input_tokens);
  const outputTokens = pickNumber(usageJson?.output_tokens);
  const tokenSegments: string[] = [];
  if (inputTokens !== null) {
    tokenSegments.push(
      `${t("chat.tokenInput")} ${inputTokens.toLocaleString()}`,
    );
  }
  if (outputTokens !== null) {
    tokenSegments.push(
      `${t("chat.tokenOutput")} ${outputTokens.toLocaleString()}`,
    );
  }
  const tokensLabel =
    tokenSegments.length > 0 ? tokenSegments.join(" · ") : null;
  const costLabel = formatCostUsd(runUsage?.total_cost_usd);
  const durationLabel = formatDurationMs(runUsage?.total_duration_ms);
  const showUsage =
    !!runUsage &&
    message.status !== "streaming" &&
    (costLabel !== null || tokensLabel !== null || durationLabel !== null);

  return (
    <div
      className={cn(
        "flex w-full gap-4 group min-w-0",
        animate && "animate-in fade-in slide-in-from-left-4 duration-300",
      )}
    >
      {/* Avatar Section */}
      <div className="flex-shrink-0 mt-1">
        <div className="size-8 rounded-full bg-muted border border-border flex items-center justify-center">
          <Bot className="size-4 text-muted-foreground" />
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 min-w-0 space-y-2 w-full">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-foreground/50 tracking-wide uppercase shrink-0">
            Poco
          </span>
          <span className="text-[10px] text-muted-foreground/40 shrink-0">
            {message.timestamp && !isNaN(new Date(message.timestamp).getTime())
              ? new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : null}
          </span>
        </div>

        <div className="text-foreground text-base break-words w-full min-w-0">
          <MessageContent content={message.content} />
          {message.status === "streaming" && <TypingIndicator />}
        </div>

        {/* Action Buttons - Visible on hover */}
        <div className="flex items-center justify-between gap-2 pt-2 min-w-0">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={onCopy}
              title={t("chat.copyMessage")}
            >
              {isCopied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`size-7 hover:text-foreground ${
                isLiked
                  ? "text-primary hover:text-primary/90"
                  : "text-muted-foreground"
              }`}
              onClick={onLike}
              title={t("chat.likeResponse")}
            >
              <ThumbsUp
                className={`size-3.5 ${isLiked ? "fill-current" : ""}`}
              />
            </Button>
          </div>

          {showUsage ? (
            <div className="text-xs text-muted-foreground font-mono tabular-nums truncate min-w-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {costLabel ? `${t("chat.cost")}: ${costLabel}` : null}
              {tokensLabel
                ? `${costLabel ? " · " : ""}${t("chat.tokens")}: ${tokensLabel}`
                : null}
              {durationLabel
                ? `${costLabel || tokensLabel ? " · " : ""}${t("chat.duration")}: ${durationLabel}`
                : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const AssistantMessage = React.memo(
  AssistantMessageComponent,
  (prev, next) => {
    // Custom comparison: only re-render when key properties change
    return (
      prev.message.id === next.message.id &&
      prev.message.content === next.message.content &&
      prev.message.status === next.message.status &&
      prev.runUsage === next.runUsage &&
      prev.animate === next.animate
    );
  },
);
