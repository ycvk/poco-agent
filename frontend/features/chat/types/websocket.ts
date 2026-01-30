// frontend/features/chat/types/websocket.ts

export type WSEventType =
  | "session.snapshot"
  | "session.status"
  | "session.progress"
  | "session.patch"
  | "todo.update"
  | "user_input.update"
  | "message.new"
  | "message.chunk"
  | "tool.call"
  | "workspace.export"
  | "workspace.files"
  | "workspace.file.url"
  | "skill_import.job";

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

export interface SessionSnapshotData {
  status: string;
  progress: number;
  state_patch?: Record<string, unknown>;
  config_snapshot?: Record<string, unknown> | null;
  workspace_export_status?: string | null;
  workspace_manifest_key?: string | null;
  workspace_files_prefix?: string | null;
  title?: string | null;
  updated_at?: string | null;
}

export interface SessionPatchData {
  state_patch: Record<string, unknown>;
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

export interface UserInputUpdateData {
  requests: Array<Record<string, unknown>>;
}

export interface WorkspaceExportData {
  export_status: string | null;
  workspace_manifest_key?: string | null;
  workspace_files_prefix?: string | null;
  workspace_archive_key?: string | null;
}

export interface WorkspaceFilesData {
  export_status: string | null;
  files: Array<Record<string, unknown>>;
  error?: string | null;
}

export interface WorkspaceFileUrlData {
  path: string;
  url: string | null;
}

export interface WSMessageData {
  id: number;
  role: string;
  content: Record<string, unknown>;
  timestamp: string | null;
  text_preview: string | null;
}

export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";
