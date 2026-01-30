// frontend/features/chat/hooks/use-hybrid-session.ts
import { useCallback } from "react";
import { useSessionWebSocket } from "./use-session-websocket";
import { useExecutionSession } from "./use-execution-session";
import type {
  ExecutionSession,
  TodoItem,
  SessionStatusData,
  WSMessageData,
} from "../types";

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
  /**
   * Callback when a new message is received via WebSocket
   */
  onNewMessage?: (message: WSMessageData) => void;
  /**
   * Callback when WebSocket reconnects after disconnection
   */
  onReconnect?: () => void;
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
  onNewMessage,
  onReconnect,
}: UseHybridSessionOptions): UseHybridSessionReturn {
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
    onNewMessage,
    onReconnect,
  });

  const connectionMode: "websocket" | "polling" =
    preferWebSocket && connectionState === "connected" ? "websocket" : "polling";

  return {
    session,
    isLoading,
    error,
    connectionMode,
    refetch,
    updateSession,
  };
}
