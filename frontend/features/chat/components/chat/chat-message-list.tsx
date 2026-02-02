"use client";

import * as React from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AssistantMessage } from "./messages/assistant-message";
import { UserMessage } from "./messages/user-message";
import type {
  ChatMessage,
  UsageResponse,
  FileChange,
} from "@/features/chat/types";
import { useT } from "@/lib/i18n/client";

export interface ChatMessageListProps {
  messages: ChatMessage[];
  isTyping?: boolean;
  internalContextsByUserMessageId?: Record<string, string[]>;
  runUsageByUserMessageId?: Record<string, UsageResponse | null>;
  /** Whether this is the initial load of history messages. Used to disable animations. */
  isInitialLoad?: boolean;
  /** File changes to display on the last assistant message */
  fileChanges?: FileChange[];
}

export function ChatMessageList({
  messages,
  isTyping,
  internalContextsByUserMessageId,
  runUsageByUserMessageId,
  isInitialLoad = false,
  fileChanges,
}: ChatMessageListProps) {
  const { t } = useT("translation");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = React.useState(false);
  const [isUserScrolling, setIsUserScrolling] = React.useState(false);
  const lastMessageCountRef = React.useRef(messages.length);
  const hasInitializedRef = React.useRef(false);
  // Track whether initial load animation should be skipped
  // Use state instead of ref to avoid accessing ref during render
  const [shouldAnimate, setShouldAnimate] = React.useState(!isInitialLoad);
  const [expandedInternalContextIds, setExpandedInternalContextIds] =
    React.useState<Set<string>>(() => new Set());

  const toggleInternalContext = React.useCallback((messageId: string) => {
    setExpandedInternalContextIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const copyInternalContext = React.useCallback(async (texts: string[]) => {
    const joined = texts.filter(Boolean).join("\n\n");
    if (!joined) return;
    try {
      await navigator.clipboard.writeText(joined);
    } catch (err) {
      console.error("Failed to copy internal context", err);
    }
  }, []);

  // Check if user has scrolled up
  const checkScrollPosition = React.useCallback(() => {
    if (!scrollAreaRef.current) return;

    const viewport = scrollAreaRef.current.querySelector(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;

    const { scrollTop, scrollHeight, clientHeight } = viewport;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // If user is more than 100px from bottom, consider them as scrolling up
    const isNearBottom = distanceFromBottom < 100;
    setIsUserScrolling(!isNearBottom);

    // Show scroll button if not near bottom
    setShowScrollButton(!isNearBottom);
  }, []);

  // Handle scroll events
  React.useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const viewport = scrollArea.querySelector(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;

    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        checkScrollPosition();
      }, 100);
    };

    viewport.addEventListener("scroll", handleScroll);
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [checkScrollPosition]);

  const prevIsTypingRef = React.useRef(isTyping);

  // Initial scroll to bottom when component mounts with existing messages
  React.useEffect(() => {
    if (
      !hasInitializedRef.current &&
      messages.length > 0 &&
      scrollRef.current
    ) {
      scrollRef.current.scrollIntoView({ behavior: "auto" });
      hasInitializedRef.current = true;
      // Enable animations after initial load is complete
      requestAnimationFrame(() => {
        setShouldAnimate(true);
      });
    }
  }, [messages]);

  // Auto-scroll to bottom when new messages arrive (only if user is not scrolling)
  React.useEffect(() => {
    const hasNewMessages = messages.length > lastMessageCountRef.current;
    const isTypingStarted = isTyping && !prevIsTypingRef.current;

    lastMessageCountRef.current = messages.length;
    prevIsTypingRef.current = isTyping;

    if (
      scrollRef.current &&
      !isUserScrolling &&
      (hasNewMessages || isTypingStarted)
    ) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }

    // Show scroll button when new messages arrive while user is scrolling
    if (hasNewMessages && isUserScrolling) {
      setShowScrollButton(true);
    }
  }, [messages, isTyping, isUserScrolling]);

  // Scroll to bottom handler
  const scrollToBottom = React.useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
      setIsUserScrolling(false);
      setShowScrollButton(false);
    }
  }, []);

  const lastAssistantIndexToUserMessageId = React.useMemo(() => {
    const map = new Map<number, string>();
    let currentUserMessageId: string | null = null;
    let lastAssistantIndex: number | null = null;

    messages.forEach((msg, idx) => {
      if (msg.role === "user") {
        if (currentUserMessageId && lastAssistantIndex !== null) {
          map.set(lastAssistantIndex, currentUserMessageId);
        }
        currentUserMessageId = msg.id;
        lastAssistantIndex = null;
        return;
      }

      if (msg.role === "assistant" && currentUserMessageId) {
        lastAssistantIndex = idx;
      }
    });

    if (currentUserMessageId && lastAssistantIndex !== null) {
      map.set(lastAssistantIndex, currentUserMessageId);
    }

    return map;
  }, [messages]);

  // Find the index of the last assistant message
  const lastAssistantMessageIndex = React.useMemo(() => {
    return messages.findLastIndex((m) => m.role === "assistant");
  }, [messages]);

  if (messages.length === 0 && !isTyping) {
    return null;
  }

  return (
    <div className="h-full overflow-hidden relative">
      <ScrollArea ref={scrollAreaRef} className="h-full">
        <div className="px-6 py-6 space-y-4 w-full min-w-0 max-w-full">
          {messages.map((message, index) => {
            if (message.role === "user") {
              const internalTexts =
                internalContextsByUserMessageId?.[message.id] || [];
              const expanded = expandedInternalContextIds.has(message.id);
              const hasInternal = internalTexts.length > 0;

              if (!hasInternal) {
                return (
                  <UserMessage
                    key={message.id}
                    content={message.content}
                    attachments={message.attachments}
                  />
                );
              }

              return (
                <div key={message.id} className="space-y-2 w-full">
                  <UserMessage
                    content={message.content}
                    attachments={message.attachments}
                  />
                  <div className="flex justify-end w-full">
                    <div className="max-w-[85%] w-full rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground">
                            {t("chat.internalContextInjected")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t("chat.internalContextSubtitle")}
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => toggleInternalContext(message.id)}
                        >
                          {expanded
                            ? t("chat.internalContextHide")
                            : t("chat.internalContextView", {
                                count: internalTexts.length,
                              })}
                        </Button>
                      </div>

                      {expanded && (
                        <div className="mt-2 border-t border-border/50 pt-2 space-y-2">
                          <div className="text-xs whitespace-pre-wrap break-words break-all text-foreground/90">
                            {internalTexts.join("\n\n")}
                          </div>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => copyInternalContext(internalTexts)}
                            >
                              {t("chat.internalContextCopy")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            const userMessageIdForUsage =
              message.role === "assistant"
                ? lastAssistantIndexToUserMessageId.get(index)
                : undefined;
            const runUsage =
              userMessageIdForUsage && runUsageByUserMessageId
                ? (runUsageByUserMessageId[userMessageIdForUsage] ?? null)
                : undefined;

            return (
              <AssistantMessage
                key={message.id}
                message={message}
                runUsage={runUsage}
                animate={shouldAnimate}
                fileChanges={
                  index === lastAssistantMessageIndex ? fileChanges : undefined
                }
              />
            );
          })}
          {isTyping && (
            <AssistantMessage
              message={{
                id: "typing",
                role: "assistant",
                content: "",
                status: "streaming",
                timestamp: new Date().toISOString(),
              }}
            />
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="absolute bottom-6 right-6 z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Button
            variant="outline"
            size="icon"
            onClick={scrollToBottom}
            className="h-10 w-10 rounded-full shadow-lg hover:shadow-xl transition-shadow bg-background"
            title={t("chat.scrollToLatestMessage")}
          >
            <ArrowDown className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
