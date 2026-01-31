import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { sendMessageAction } from "@/features/chat/actions/session-actions";
import {
  getMessagesAction,
  getMessagesSinceAction,
  getRunsBySessionAction,
} from "@/features/chat/actions/query-actions";
import type {
  ChatMessage,
  ExecutionSession,
  InputFile,
  UsageResponse,
} from "@/features/chat/types";
import type { WSMessageData } from "@/features/chat/types/websocket";

interface UseChatMessagesOptions {
  session: ExecutionSession | null;
}

interface UseChatMessagesReturn {
  messages: ChatMessage[];
  displayMessages: ChatMessage[];
  isLoadingHistory: boolean;
  isTyping: boolean;
  showTypingIndicator: boolean;
  sendMessage: (content: string, attachments?: InputFile[]) => Promise<void>;
  internalContextsByUserMessageId: Record<string, string[]>;
  runUsageByUserMessageId: Record<string, UsageResponse | null>;
  /** Handle new message from WebSocket */
  handleNewMessage: (message: WSMessageData) => void;
  /** Handle reconnection - fetches messages since last known ID */
  handleReconnect: () => Promise<void>;
}

/**
 * Manages chat message loading and WebSocket-based real-time updates
 *
 * Responsibilities:
 * - Load message history when session changes
 * - Handle new messages from WebSocket (via handleNewMessage)
 * - Fetch missed messages on reconnection (via handleReconnect)
 * - Merge local optimistic messages with server messages
 * - Calculate display messages with streaming status
 * - Handle typing indicator state
 */
export function useChatMessages({
  session,
}: UseChatMessagesOptions): UseChatMessagesReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [internalContextsByUserMessageId, setInternalContextsByUserMessageId] =
    useState<Record<string, string[]>>({});
  const [runUsageByUserMessageId, setRunUsageByUserMessageId] = useState<
    Record<string, UsageResponse | null>
  >({});

  const lastLoadedSessionIdRef = useRef<string | null>(null);
  const realUserMessageIdsRef = useRef<number[] | null>(null);
  const lastMessageIdRef = useRef<number>(0);

  const refreshRealUserMessageIds = useCallback(async () => {
    if (!session?.session_id) return;
    try {
      const runs = await getRunsBySessionAction({
        sessionId: session.session_id,
      });
      const ids = runs
        .map((r) => r.user_message_id)
        .filter((id): id is number => typeof id === "number" && id > 0);

      realUserMessageIdsRef.current = ids;
      const usageByMessageId: Record<string, UsageResponse | null> = {};
      runs.forEach((r) => {
        const key = String(r.user_message_id);
        usageByMessageId[key] = r.usage ?? null;
      });
      setRunUsageByUserMessageId(usageByMessageId);
    } catch (error) {
      console.error("[Chat] Failed to load runs:", error);
      // Keep as null so message rendering falls back to showing all user messages.
      realUserMessageIdsRef.current = null;
      setRunUsageByUserMessageId({});
    }
  }, [session?.session_id]);

  const fetchMessagesWithFilter = useCallback(
    async (sessionId: string) => {
      // Ensure we have a whitelist of real user input message ids (per run).
      if (realUserMessageIdsRef.current === null) {
        await refreshRealUserMessageIds();
      }

      const realUserMessageIds = realUserMessageIdsRef.current ?? undefined;
      return getMessagesAction({
        sessionId,
        realUserMessageIds,
      });
    },
    [refreshRealUserMessageIds],
  );

  // Helper to merge new server messages with local optimistic messages
  const mergeMessages = useCallback(
    (currentMessages: ChatMessage[], serverMessages: ChatMessage[]) => {
      const finalMessages = [...serverMessages];

      // Append local optimistic messages that haven't been synced yet
      currentMessages.forEach((localMsg) => {
        // Only care about optimistic messages (id starts with "msg-")
        if (!localMsg.id.startsWith("msg-")) return;

        // Check if this optimistic message is already present in server messages
        const isSynced = serverMessages.some((serverMsg) => {
          if (
            serverMsg.role !== localMsg.role ||
            serverMsg.content !== localMsg.content
          ) {
            return false;
          }

          // Timestamp check - allow 10s skew/lag
          const localTime = localMsg.timestamp
            ? new Date(localMsg.timestamp).getTime()
            : Date.now();
          const serverTime = serverMsg.timestamp
            ? new Date(serverMsg.timestamp).getTime()
            : 0;

          return serverTime >= localTime - 10000;
        });

        if (!isSynced) {
          finalMessages.push(localMsg);
        }
      });

      // Sort by timestamp
      return finalMessages.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeA - timeB;
      });
    },
    [],
  );

  // Send message and immediately fetch updated messages
  const sendMessage = useCallback(
    async (content: string, attachments?: InputFile[]) => {
      if (!session?.session_id) return;

      const normalizedContent = content.trim();
      const hasAttachments = (attachments?.length ?? 0) > 0;
      if (!normalizedContent && !hasAttachments) return;

      const sessionId = session.session_id;
      console.log(
        `[Chat] Sending message to session ${sessionId}:`,
        normalizedContent,
      );
      setIsTyping(true);

      // Create a new user message for instant UI update
      const newMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: normalizedContent,
        status: "sent",
        timestamp: new Date().toISOString(),
        attachments,
      };

      setMessages((prev) => [...prev, newMessage]);

      try {
        await sendMessageAction({
          sessionId,
          content: normalizedContent,
          attachments,
        });
        console.log("[Chat] Message sent successfully");

        // Refresh runs so multi-turn conversations only show real user inputs.
        await refreshRealUserMessageIds();

        // Fetch latest messages immediately to confirm sync
        const server = await fetchMessagesWithFilter(sessionId);
        setInternalContextsByUserMessageId(
          server.internalContextsByUserMessageId,
        );
        setMessages((prev) => mergeMessages(prev, server.messages));
      } catch (error) {
        console.error("[Chat] Failed to send message or get reply:", error);
        setIsTyping(false);
      }
    },
    [
      session,
      mergeMessages,
      refreshRealUserMessageIds,
      fetchMessagesWithFilter,
    ],
  );

  // Track session ID for detecting session changes
  const sessionIdRef = useRef<string | null>(null);

  // Load initial messages when session changes (no polling - updates come from WebSocket)
  useEffect(() => {
    if (!session?.session_id) return;

    // Only run when session ID actually changes
    if (sessionIdRef.current === session.session_id) return;
    sessionIdRef.current = session.session_id;

    // Reset state for new session
    setIsLoadingHistory(true);
    setMessages([]);
    setIsTyping(false);
    setInternalContextsByUserMessageId({});
    realUserMessageIdsRef.current = null;
    setRunUsageByUserMessageId({});
    lastMessageIdRef.current = 0;
    lastLoadedSessionIdRef.current = session.session_id;

    const fetchMessages = async () => {
      try {
        const history = await fetchMessagesWithFilter(session.session_id);
        setInternalContextsByUserMessageId(
          history.internalContextsByUserMessageId,
        );

        setMessages((prev) => {
          const merged = mergeMessages(prev, history.messages);
          // Update lastMessageIdRef with the highest server message ID
          const maxId = merged.reduce((max, msg) => {
            const numId = parseInt(msg.id, 10);
            return !isNaN(numId) && numId > max ? numId : max;
          }, 0);
          if (maxId > lastMessageIdRef.current) {
            lastMessageIdRef.current = maxId;
          }
          return merged;
        });
      } catch (error) {
        console.error("[Chat] Failed to load messages:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    // Initial fetch
    fetchMessages();
  }, [session?.session_id, mergeMessages, fetchMessagesWithFilter]);

  // Separate effect: Refresh run usage when session becomes terminal
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session?.session_id) return;

    const currentStatus = session.status;
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = currentStatus;

    // Only refresh when transitioning TO a terminal state
    const isTerminal = ["completed", "failed", "stopped", "canceled"].includes(
      currentStatus,
    );
    const wasTerminal = prevStatus
      ? ["completed", "failed", "stopped", "canceled"].includes(prevStatus)
      : false;

    if (isTerminal && !wasTerminal) {
      void refreshRealUserMessageIds();
    }
  }, [session?.session_id, session?.status, refreshRealUserMessageIds]);

  // Manage isTyping state based on messages
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant" || lastMsg.role === "system") {
        setIsTyping(false);
      }
    }
  }, [messages]);

  // Determine if session is running/active
  const isSessionActive =
    session?.status === "running" || session?.status === "accepted";

  // Calculate messages for display
  const displayMessages = useMemo(() => {
    if (!isSessionActive || messages.length === 0) return messages;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "assistant") {
      // Show streaming status if assistant is last message and session is running
      return [
        ...messages.slice(0, -1),
        { ...lastMsg, status: "streaming" as const },
      ];
    }
    return messages;
  }, [messages, isSessionActive]);

  // Determine if we should show the typing indicator
  const showTypingIndicator =
    isTyping ||
    (isSessionActive &&
      (messages.length === 0 || messages[messages.length - 1].role === "user"));

  /**
   * Handle new message from WebSocket.
   * Appends the message to the list if not already present.
   */
  const handleNewMessage = useCallback((message: WSMessageData) => {
    // Skip if we already have this message
    if (message.id <= lastMessageIdRef.current) {
      return;
    }

    lastMessageIdRef.current = message.id;

    // Convert WSMessageData to a simplified ChatMessage
    // Note: The full message processing happens in getMessages, this is a preview
    const textPreview = message.text_preview || "";
    const newMessage: ChatMessage = {
      id: message.id.toString(),
      role: message.role as "user" | "assistant" | "system",
      content: textPreview,
      status: "completed",
      timestamp: message.timestamp ?? undefined,
    };

    setMessages((prev) => {
      // Check if already exists
      if (prev.some((m) => m.id === newMessage.id)) {
        return prev;
      }
      return [...prev, newMessage];
    });

    // Reset typing indicator when we receive an assistant message
    if (message.role === "assistant") {
      setIsTyping(false);
    }
  }, []);

  /**
   * Handle WebSocket reconnection.
   * Fetches messages since the last known ID to catch up on missed messages.
   */
  const handleReconnect = useCallback(async () => {
    if (!session?.session_id) return;

    const afterId = lastMessageIdRef.current;
    if (afterId <= 0) {
      // No messages yet, do a full fetch instead
      const history = await fetchMessagesWithFilter(session.session_id);
      setInternalContextsByUserMessageId(
        history.internalContextsByUserMessageId,
      );
      setMessages((prev) => {
        const merged = mergeMessages(prev, history.messages);
        const maxId = merged.reduce((max, msg) => {
          const numId = parseInt(msg.id, 10);
          return !isNaN(numId) && numId > max ? numId : max;
        }, 0);
        if (maxId > lastMessageIdRef.current) {
          lastMessageIdRef.current = maxId;
        }
        return merged;
      });
      return;
    }

    try {
      console.log(
        `[Chat] Fetching messages since ID ${afterId} after reconnection`,
      );
      const missedMessages = await getMessagesSinceAction({
        sessionId: session.session_id,
        afterId,
      });

      if (missedMessages.length > 0) {
        console.log(
          `[Chat] Found ${missedMessages.length} missed messages after reconnection`,
        );
        // Process each missed message
        missedMessages.forEach((msg) => {
          handleNewMessage(msg);
        });
      }
    } catch (error) {
      console.error(
        "[Chat] Failed to fetch messages after reconnection:",
        error,
      );
      // Fall back to full fetch on error
      const history = await fetchMessagesWithFilter(session.session_id);
      setInternalContextsByUserMessageId(
        history.internalContextsByUserMessageId,
      );
      setMessages((prev) => mergeMessages(prev, history.messages));
    }
  }, [
    session?.session_id,
    fetchMessagesWithFilter,
    mergeMessages,
    handleNewMessage,
  ]);

  return {
    messages,
    displayMessages,
    isLoadingHistory,
    isTyping,
    showTypingIndicator,
    sendMessage,
    internalContextsByUserMessageId,
    runUsageByUserMessageId,
    handleNewMessage,
    handleReconnect,
  };
}
