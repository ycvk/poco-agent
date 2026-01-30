// frontend/features/chat/hooks/use-hybrid-session.ts
import { useCallback, useEffect, useState } from "react";
import { useSessionWebSocket } from "./use-session-websocket";
import { useExecutionSession } from "./use-execution-session";
import type { ExecutionSession, TodoItem, SessionStatusData } from "../types";

interface UseHybridSessionOptions {
  sessionId: string;
  /**
   * Whether to prefer WebSocket over polling
   * @default true
   */
  preferWebSocket?: boolean;
  /**
   * Fallback polling interval when WebSocket is disconnected
   * @default 6000
   */
  fallbackPollingInterval?: number;
  /**
   * Callback when session completes
   */
  onPollingStop?: () => void;
}

interface UseHybridSessionReturn {
  session: ExecutionSession | null;
  isLoading: boolean;
  error: Error | null;
  connectionMode: "websocket" | "polling";
  refetch: () => Promise<void>;
  updateSession: (updates: Partial<ExecutionSession>) => void;
}

export function useHybridSession({
  sessionId,
  preferWebSocket = true,
  fallbackPollingInterval = 6000,
  onPollingStop,
}: UseHybridSessionOptions): UseHybridSessionReturn {
  const [connectionMode, setConnectionMode] = useState<"websocket" | "polling">(
    preferWebSocket ? "websocket" : "polling",
  );

  // Polling hook (always ready as fallback)
  const { session, isLoading, error, refetch, updateSession } =
    useExecutionSession({
      sessionId,
      pollingInterval: fallbackPollingInterval,
      enableBackoff: true,
      onPollingStop,
    });

  // WebSocket status handler
  const handleStatusChange = useCallback(
    (data: SessionStatusData) => {
      updateSession({
        status: data.status as ExecutionSession["status"],
        progress: data.progress,
      });
    },
    [updateSession],
  );

  // WebSocket todo handler
  const handleTodoUpdate = useCallback(
    (todos: TodoItem[]) => {
      updateSession({
        state_patch: {
          ...session?.state_patch,
          todos,
        },
      } as Partial<ExecutionSession>);
    },
    [session?.state_patch, updateSession],
  );

  // WebSocket hook
  const { connectionState } = useSessionWebSocket({
    sessionId,
    enabled: preferWebSocket && !!sessionId,
    onStatusChange: handleStatusChange,
    onTodoUpdate: handleTodoUpdate,
  });

  // Update connection mode based on WebSocket state
  useEffect(() => {
    if (preferWebSocket) {
      if (connectionState === "connected") {
        setConnectionMode("websocket");
      } else if (
        connectionState === "error" ||
        connectionState === "disconnected"
      ) {
        setConnectionMode("polling");
      }
    }
  }, [connectionState, preferWebSocket]);

  return {
    session,
    isLoading,
    error,
    connectionMode,
    refetch,
    updateSession,
  };
}
