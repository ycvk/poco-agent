// frontend/features/chat/types/websocket.ts

export type WSEventType =
  | "session.status"
  | "session.progress"
  | "todo.update"
  | "message.new"
  | "message.chunk"
  | "tool.call";

export interface WSEvent<T = Record<string, unknown>> {
  type: WSEventType;
  session_id: string;
  data: T;
  timestamp: string;
}

export interface SessionStatusData {
  status: string;
  progress: number;
  current_step?: string | null;
}

export interface TodoUpdateData {
  todos: Array<{
    content: string;
    status: string;
    active_form?: string;
  }>;
}

export interface MessageNewData {
  message: Record<string, unknown>;
}

export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";
