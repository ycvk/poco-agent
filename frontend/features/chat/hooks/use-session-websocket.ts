// frontend/features/chat/hooks/use-session-websocket.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConnectionState,
  SessionPatchData,
  SessionSnapshotData,
  SessionStatusData,
  TodoUpdateData,
  UserInputUpdateData,
  WSEvent,
  WorkspaceExportData,
  WorkspaceFileUrlData,
  WorkspaceFilesData,
  WSMessageData,
} from "../types/websocket";
import type { TodoItem } from "../types";

function getDefaultWsBaseUrl(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:8000";
  }

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  // Heuristic for local dev: frontend on 3000, backend on 8000.
  // For production behind a reverse proxy, keep same-origin.
  if (window.location.port === "3000") {
    return `${wsProtocol}//${window.location.hostname}:8000`;
  }

  return `${wsProtocol}//${window.location.host}`;
}

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || getDefaultWsBaseUrl();

const HEARTBEAT_INTERVAL = 30000;
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const CONNECT_DEBOUNCE_MS = 150;

interface UseSessionWebSocketOptions {
  sessionId: string | null;
  onSnapshot?: (data: SessionSnapshotData) => void;
  onStatusChange?: (data: SessionStatusData) => void;
  onTodoUpdate?: (todos: TodoItem[]) => void;
  onStatePatch?: (data: SessionPatchData) => void;
  onUserInputUpdate?: (data: UserInputUpdateData) => void;
  onWorkspaceExport?: (data: WorkspaceExportData) => void;
  onWorkspaceFiles?: (data: WorkspaceFilesData) => void;
  onWorkspaceFileUrl?: (data: WorkspaceFileUrlData) => void;
  /** @deprecated Use onNewMessage for typed message handling */
  onMessage?: (message: Record<string, unknown>) => void;
  /** Called when a new message is received via WebSocket */
  onNewMessage?: (message: WSMessageData) => void;
  /** Called after successful reconnection - use to fetch missed messages */
  onReconnect?: () => void;
  enabled?: boolean;
}

interface UseSessionWebSocketReturn {
  connectionState: ConnectionState;
  reconnectAttempts: number;
  /** Returns the last event. Use this in event handlers or effects, not during render. */
  getLastEvent: () => WSEvent | null;
  sendJson: (payload: Record<string, unknown>) => void;
}

// Type for consolidated callbacks ref
interface CallbacksRef {
  onSnapshot?: (data: SessionSnapshotData) => void;
  onStatusChange?: (data: SessionStatusData) => void;
  onTodoUpdate?: (todos: TodoItem[]) => void;
  onStatePatch?: (data: SessionPatchData) => void;
  onUserInputUpdate?: (data: UserInputUpdateData) => void;
  onWorkspaceExport?: (data: WorkspaceExportData) => void;
  onWorkspaceFiles?: (data: WorkspaceFilesData) => void;
  onWorkspaceFileUrl?: (data: WorkspaceFileUrlData) => void;
  onMessage?: (message: Record<string, unknown>) => void;
  onNewMessage?: (message: WSMessageData) => void;
  onReconnect?: () => void;
}

export function useSessionWebSocket({
  sessionId,
  onSnapshot,
  onStatusChange,
  onTodoUpdate,
  onStatePatch,
  onUserInputUpdate,
  onWorkspaceExport,
  onWorkspaceFiles,
  onWorkspaceFileUrl,
  onMessage,
  onNewMessage,
  onReconnect,
  enabled = true,
}: UseSessionWebSocketOptions): UseSessionWebSocketReturn {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // [Optimization 3] Use ref instead of state to avoid re-renders on every message
  const lastEventRef = useRef<WSEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const hadPreviousConnectionRef = useRef(false);

  // [Optimization 4] Consolidated callbacks ref - single object instead of 11 separate refs
  const callbacksRef = useRef<CallbacksRef>({
    onSnapshot,
    onStatusChange,
    onTodoUpdate,
    onStatePatch,
    onUserInputUpdate,
    onWorkspaceExport,
    onWorkspaceFiles,
    onWorkspaceFileUrl,
    onMessage,
    onNewMessage,
    onReconnect,
  });

  // [Optimization 4] Single effect to update all callbacks
  useEffect(() => {
    callbacksRef.current = {
      onSnapshot,
      onStatusChange,
      onTodoUpdate,
      onStatePatch,
      onUserInputUpdate,
      onWorkspaceExport,
      onWorkspaceFiles,
      onWorkspaceFileUrl,
      onMessage,
      onNewMessage,
      onReconnect,
    };
  });

  // [Optimization 1] Reset hadPreviousConnectionRef when sessionId changes
  // This fixes the bug where switching sessions would incorrectly trigger onReconnect
  useEffect(() => {
    hadPreviousConnectionRef.current = false;
  }, [sessionId]);

  const sendJson = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }, []);

  const connectRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (connectDebounceRef.current) {
      clearTimeout(connectDebounceRef.current);
      connectDebounceRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!sessionId || !enabled) return;

    // Clear any pending debounce or reconnect timers
    if (connectDebounceRef.current) {
      clearTimeout(connectDebounceRef.current);
      connectDebounceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    setConnectionState("connecting");

    const url = `${WS_BASE_URL}/api/v1/ws/sessions/${sessionId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;

      console.log(`[WS] Connected to session ${sessionId}`);
      setConnectionState("connected");

      // Call onReconnect only if this is a reconnection (not first connection for this session)
      if (hadPreviousConnectionRef.current) {
        console.log(
          `[WS] Reconnected to session ${sessionId}, fetching missed messages`,
        );
        callbacksRef.current.onReconnect?.();
      }
      hadPreviousConnectionRef.current = true;

      setReconnectAttempts(0);

      // Start heartbeat
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, HEARTBEAT_INTERVAL);
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;

      try {
        const data = JSON.parse(event.data) as WSEvent;

        if (data.type === ("pong" as WSEvent["type"])) return;

        // [Optimization 3] Update ref instead of setState
        lastEventRef.current = data;

        switch (data.type) {
          case "session.snapshot":
            callbacksRef.current.onSnapshot?.(
              data.data as unknown as SessionSnapshotData,
            );
            break;
          case "session.status":
            callbacksRef.current.onStatusChange?.(
              data.data as unknown as SessionStatusData,
            );
            break;
          case "session.patch":
            callbacksRef.current.onStatePatch?.(
              data.data as unknown as SessionPatchData,
            );
            break;
          case "todo.update":
            callbacksRef.current.onTodoUpdate?.(
              (data.data as unknown as TodoUpdateData).todos as TodoItem[],
            );
            break;
          case "user_input.update":
            callbacksRef.current.onUserInputUpdate?.(
              data.data as unknown as UserInputUpdateData,
            );
            break;
          case "message.new": {
            const messageData = data.data as unknown as WSMessageData;
            callbacksRef.current.onNewMessage?.(messageData);
            // Also call deprecated onMessage for backward compatibility
            callbacksRef.current.onMessage?.(
              data.data as Record<string, unknown>,
            );
            break;
          }
          case "workspace.export":
            callbacksRef.current.onWorkspaceExport?.(
              data.data as unknown as WorkspaceExportData,
            );
            break;
          case "workspace.files":
            callbacksRef.current.onWorkspaceFiles?.(
              data.data as unknown as WorkspaceFilesData,
            );
            break;
          case "workspace.file.url":
            callbacksRef.current.onWorkspaceFileUrl?.(
              data.data as unknown as WorkspaceFileUrlData,
            );
            break;
        }
      } catch (err) {
        console.error("[WS] Failed to parse message:", err);
      }
    };

    ws.onerror = (error) => {
      if (wsRef.current !== ws) return;

      console.warn("[WS] Error:", {
        sessionId,
        url,
        readyState: ws.readyState,
        eventType: error.type,
      });
      setConnectionState("error");
    };

    ws.onclose = (event) => {
      if (wsRef.current !== ws) return;

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      wsRef.current = null;

      console.log(`[WS] Disconnected from session ${sessionId}`, {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      setConnectionState("disconnected");

      // Attempt reconnection - use ref for current reconnect attempts
      if (enabled) {
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts((prev) => {
            if (prev < MAX_RECONNECT_ATTEMPTS) {
              connectRef.current?.();
            }
            return prev + 1;
          });
        }, RECONNECT_DELAY);
      }
    };
  }, [sessionId, enabled]);

  // Keep connectRef in sync with connect function
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // [Optimization 2] Main connection effect with debounce
  useEffect(() => {
    if (!sessionId || !enabled) {
      cleanup();
      return;
    }

    // Debounce connection to avoid rapid connect/disconnect on fast session switching
    connectDebounceRef.current = setTimeout(() => {
      connect();
    }, CONNECT_DEBOUNCE_MS);

    return cleanup;
  }, [sessionId, enabled, connect, cleanup]);

  // Getter function for lastEvent to avoid accessing ref during render
  const getLastEvent = useCallback(() => lastEventRef.current, []);

  return {
    connectionState,
    reconnectAttempts,
    getLastEvent,
    sendJson,
  };
}
