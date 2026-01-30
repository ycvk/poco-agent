// frontend/features/chat/hooks/use-session-websocket.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConnectionState,
  SessionStatusData,
  TodoUpdateData,
  WSEvent,
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
  onMessage?: (message: Record<string, unknown>) => void;
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
  enabled = true,
}: UseSessionWebSocketOptions): UseSessionWebSocketReturn {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      console.log(`[WS] Connected to session ${sessionId}`);
      setConnectionState("connected");
      setReconnectAttempts(0);

      // Start heartbeat
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, HEARTBEAT_INTERVAL);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSEvent;

        if (data.type === ("pong" as WSEvent["type"])) return;

        setLastEvent(data);

        switch (data.type) {
          case "session.status":
            onStatusChange?.(data.data as unknown as SessionStatusData);
            break;
          case "todo.update":
            onTodoUpdate?.(
              (data.data as unknown as TodoUpdateData).todos as TodoItem[],
            );
            break;
          case "message.new":
            onMessage?.(data.data as Record<string, unknown>);
            break;
        }
      } catch (err) {
        console.error("[WS] Failed to parse message:", err);
      }
    };

    ws.onerror = (error) => {
      console.error("[WS] Error:", error);
      setConnectionState("error");
    };

    ws.onclose = () => {
      console.log(`[WS] Disconnected from session ${sessionId}`);
      setConnectionState("disconnected");

      // Attempt reconnection
      if (enabled && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts((prev) => prev + 1);
          connect();
        }, RECONNECT_DELAY);
      }
    };
  }, [
    sessionId,
    enabled,
    cleanup,
    reconnectAttempts,
    onStatusChange,
    onTodoUpdate,
    onMessage,
  ]);

  useEffect(() => {
    if (sessionId && enabled) {
      connect();
    }
    return cleanup;
  }, [sessionId, enabled, connect, cleanup]);

  return {
    connectionState,
    reconnectAttempts,
    lastEvent,
  };
}
