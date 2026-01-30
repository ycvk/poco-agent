// frontend/features/chat/hooks/use-session-websocket.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConnectionState,
  SessionStatusData,
  TodoUpdateData,
  WSEvent,
  WSMessageData,
} from "../types/websocket";
import type { TodoItem } from "../types";

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
    : "ws://localhost:8000");

const HEARTBEAT_INTERVAL = 30000;
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

interface UseSessionWebSocketOptions {
  sessionId: string | null;
  onStatusChange?: (data: SessionStatusData) => void;
  onTodoUpdate?: (todos: TodoItem[]) => void;
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
  lastEvent: WSEvent | null;
}

export function useSessionWebSocket({
  sessionId,
  onStatusChange,
  onTodoUpdate,
  onMessage,
  onNewMessage,
  onReconnect,
  enabled = true,
}: UseSessionWebSocketOptions): UseSessionWebSocketReturn {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hadPreviousConnectionRef = useRef(false);

  // Store callbacks in refs to avoid recreating connect function
  const onStatusChangeRef = useRef(onStatusChange);
  const onTodoUpdateRef = useRef(onTodoUpdate);
  const onMessageRef = useRef(onMessage);
  const onNewMessageRef = useRef(onNewMessage);
  const onReconnectRef = useRef(onReconnect);

  // Update refs when callbacks change
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onTodoUpdateRef.current = onTodoUpdate;
  }, [onTodoUpdate]);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  const cleanup = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!sessionId || !enabled) return;

    cleanup();
    setConnectionState("connecting");

    const url = `${WS_BASE_URL}/api/v1/ws/sessions/${sessionId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;

      console.log(`[WS] Connected to session ${sessionId}`);
      setConnectionState("connected");

      // Call onReconnect if this is a reconnection (not first connection)
      if (hadPreviousConnectionRef.current) {
        console.log(
          `[WS] Reconnected to session ${sessionId}, fetching missed messages`,
        );
        onReconnectRef.current?.();
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

        setLastEvent(data);

        switch (data.type) {
          case "session.status":
            onStatusChangeRef.current?.(
              data.data as unknown as SessionStatusData,
            );
            break;
          case "todo.update":
            onTodoUpdateRef.current?.(
              (data.data as unknown as TodoUpdateData).todos as TodoItem[],
            );
            break;
          case "message.new": {
            const messageData = data.data as unknown as WSMessageData;
            onNewMessageRef.current?.(messageData);
            // Also call deprecated onMessage for backward compatibility
            onMessageRef.current?.(data.data as Record<string, unknown>);
            break;
          }
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
              connect();
            }
            return prev + 1;
          });
        }, RECONNECT_DELAY);
      }
    };
  }, [sessionId, enabled, cleanup]);

  useEffect(() => {
    if (sessionId && enabled) {
      connect();
    }
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, enabled]);

  return {
    connectionState,
    reconnectAttempts,
    lastEvent,
  };
}
