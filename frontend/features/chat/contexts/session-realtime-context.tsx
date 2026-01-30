"use client";

import * as React from "react";
import { useSessionWebSocket } from "@/features/chat/hooks/use-session-websocket";
import type {
  ConnectionState,
  ExecutionSession,
  FileNode,
  SessionPatchData,
  SessionSnapshotData,
  SessionStatusData,
  TodoItem,
  UserInputRequest,
  UserInputUpdateData,
  WorkspaceFileUrlData,
  WorkspaceFilesData,
  WSMessageData,
} from "@/features/chat/types";
import { userInputService } from "@/features/chat/services/user-input-service";
import { useT } from "@/lib/i18n/client";

type RealtimeContextValue = {
  session: ExecutionSession | null;
  isLoading: boolean;
  error: Error | null;
  connectionState: ConnectionState;
  reconnectAttempts: number;
  updateSession: (updates: Partial<ExecutionSession>) => void;

  userInputRequests: UserInputRequest[];
  submitUserInputAnswer: (
    requestId: string,
    answers: Record<string, string>,
  ) => Promise<void>;

  workspaceFiles: FileNode[];
  requestWorkspaceFiles: () => void;
  requestWorkspaceFileUrl: (path: string) => Promise<string | null>;
  requestSessionSnapshot: () => void;
};

const SessionRealtimeContext = React.createContext<RealtimeContextValue | null>(
  null,
);

function normalizeExecutionStatus(
  status: string | undefined,
): ExecutionSession["status"] {
  switch (status) {
    case "accepted":
      return "accepted";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "stopped":
      return "failed";
    case "cancelled":
      return "failed";
    default:
      return "accepted";
  }
}

function parseConfigSnapshot(
  value: SessionSnapshotData["config_snapshot"],
): ExecutionSession["config_snapshot"] {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const mcp_server_ids = Array.isArray(raw.mcp_server_ids)
    ? (raw.mcp_server_ids as unknown[]).filter(
        (id): id is number => typeof id === "number",
      )
    : undefined;
  const skill_ids = Array.isArray(raw.skill_ids)
    ? (raw.skill_ids as unknown[]).filter(
        (id): id is number => typeof id === "number",
      )
    : undefined;

  return { mcp_server_ids, skill_ids };
}

function updateFileTreeUrl(
  nodes: FileNode[],
  targetPath: string,
  url: string | null,
): FileNode[] {
  return nodes.map((node) => {
    if (node.type === "file" && node.path === targetPath) {
      return { ...node, url };
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: updateFileTreeUrl(node.children, targetPath, url) };
    }
    return node;
  });
}

function pruneExpiredRequests(requests: UserInputRequest[]): UserInputRequest[] {
  const now = Date.now();
  return requests.filter((req) => {
    if (!req.expires_at) return true;
    const expiresAt = new Date(req.expires_at).getTime();
    return Number.isFinite(expiresAt) ? expiresAt > now : true;
  });
}

export function useSessionRealtime(): RealtimeContextValue {
  const ctx = React.useContext(SessionRealtimeContext);
  if (!ctx) {
    throw new Error("useSessionRealtime must be used within SessionRealtimeProvider");
  }
  return ctx;
}

export function SessionRealtimeProvider({
  sessionId,
  children,
  onNewMessage,
  onReconnect,
  onTerminal,
}: {
  sessionId: string;
  children: React.ReactNode;
  onNewMessage?: (message: WSMessageData) => void;
  onReconnect?: () => void;
  onTerminal?: () => void;
}) {
  const { t } = useT("translation");
  const [session, setSession] = React.useState<ExecutionSession | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const [userInputRequests, setUserInputRequests] = React.useState<
    UserInputRequest[]
  >([]);

  const [workspaceFiles, setWorkspaceFiles] = React.useState<FileNode[]>([]);

  const onTerminalCalledRef = React.useRef(false);
  const fileUrlWaitersRef = React.useRef<
    Map<
      string,
      Array<{ resolve: (url: string | null) => void; timeoutId: number }>
    >
  >(new Map());

  const updateSession = React.useCallback((updates: Partial<ExecutionSession>) => {
    setSession((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const handleSnapshot = React.useCallback(
    (data: SessionSnapshotData) => {
      setSession({
        session_id: sessionId,
        time: data.updated_at ?? new Date().toISOString(),
        status: normalizeExecutionStatus(data.status),
        progress: typeof data.progress === "number" ? data.progress : 0,
        state_patch: (data.state_patch as ExecutionSession["state_patch"]) ?? {},
        config_snapshot: parseConfigSnapshot(data.config_snapshot ?? null),
        task_name: data.title ?? undefined,
        user_prompt: undefined,
      });
      setIsLoading(false);
      setError(null);
    },
    [sessionId],
  );

  const handleStatusChange = React.useCallback(
    (data: SessionStatusData) => {
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: normalizeExecutionStatus(data.status),
          progress: data.progress,
          state_patch: {
            ...(prev.state_patch ?? {}),
            current_step: data.current_step ?? undefined,
          } as ExecutionSession["state_patch"],
        };
      });
    },
    [],
  );

  const handleTodoUpdate = React.useCallback(
    (todos: TodoItem[]) => {
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          state_patch: {
            ...(prev.state_patch ?? {}),
            todos,
          } as ExecutionSession["state_patch"],
        };
      });
    },
    [],
  );

  const handleStatePatch = React.useCallback(
    (data: SessionPatchData) => {
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          state_patch: {
            ...(prev.state_patch ?? {}),
            ...(data.state_patch as Record<string, unknown>),
          } as ExecutionSession["state_patch"],
        };
      });
    },
    [],
  );

  const handleUserInputUpdate = React.useCallback((data: UserInputUpdateData) => {
    const next = pruneExpiredRequests(
      (data.requests as unknown as UserInputRequest[]) ?? [],
    );
    setUserInputRequests(next);
  }, []);

  const handleWorkspaceFiles = React.useCallback((data: WorkspaceFilesData) => {
    setWorkspaceFiles((data.files as unknown as FileNode[]) ?? []);
  }, []);

  const handleWorkspaceFileUrl = React.useCallback((data: WorkspaceFileUrlData) => {
    const waiters = fileUrlWaitersRef.current.get(data.path);
    if (waiters && waiters.length > 0) {
      waiters.forEach((waiter) => {
        window.clearTimeout(waiter.timeoutId);
        waiter.resolve(data.url);
      });
      fileUrlWaitersRef.current.delete(data.path);
    }
    setWorkspaceFiles((prev) => updateFileTreeUrl(prev, data.path, data.url));
  }, []);

  const {
    connectionState,
    reconnectAttempts,
    sendJson,
  } = useSessionWebSocket({
    sessionId,
    enabled: !!sessionId,
    onSnapshot: handleSnapshot,
    onStatusChange: handleStatusChange,
    onTodoUpdate: handleTodoUpdate,
    onStatePatch: handleStatePatch,
    onUserInputUpdate: handleUserInputUpdate,
    onWorkspaceFiles: handleWorkspaceFiles,
    onWorkspaceFileUrl: handleWorkspaceFileUrl,
    onNewMessage,
    onReconnect,
  });

  const requestWorkspaceFiles = React.useCallback(() => {
    sendJson({ type: "workspace.files.request" });
  }, [sendJson]);

  const requestWorkspaceFileUrl = React.useCallback(
    (path: string) => {
      const normalized = path.startsWith("/") ? path : `/${path}`;
      sendJson({ type: "workspace.file.url.request", path: normalized });
      return new Promise<string | null>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          const pending = fileUrlWaitersRef.current.get(normalized) ?? [];
          const remaining = pending.filter((w) => w.resolve !== resolve);
          if (remaining.length > 0) {
            fileUrlWaitersRef.current.set(normalized, remaining);
          } else {
            fileUrlWaitersRef.current.delete(normalized);
          }
          resolve(null);
        }, 5000);

        const pending = fileUrlWaitersRef.current.get(normalized) ?? [];
        pending.push({ resolve, timeoutId });
        fileUrlWaitersRef.current.set(normalized, pending);
      });
    },
    [sendJson],
  );

  const requestSessionSnapshot = React.useCallback(() => {
    sendJson({ type: "session.snapshot.request" });
  }, [sendJson]);

  React.useEffect(() => {
    if (!userInputRequests.length) return;

    const timers = userInputRequests
      .filter((req) => req.status === "pending")
      .map((req) => {
        const expiresAt = new Date(req.expires_at).getTime();
        if (!Number.isFinite(expiresAt)) return null;
        const delay = Math.max(0, expiresAt - Date.now());
        return window.setTimeout(() => {
          setUserInputRequests((prev) =>
            pruneExpiredRequests(prev).filter((r) => r.id !== req.id),
          );
        }, delay);
      })
      .filter((timer): timer is number => typeof timer === "number");

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [userInputRequests]);

  const submitUserInputAnswer = React.useCallback(
    async (requestId: string, answers: Record<string, string>) => {
      await userInputService.answer(requestId, { answers });
      setUserInputRequests((prev) => prev.filter((req) => req.id !== requestId));
    },
    [],
  );

  React.useEffect(() => {
    const status = session?.status;
    if (!status) return;
    const isTerminal = ["completed", "failed", "stopped", "cancelled"].includes(
      status,
    );
    if (!isTerminal) {
      onTerminalCalledRef.current = false;
      return;
    }
    if (onTerminalCalledRef.current) return;
    onTerminalCalledRef.current = true;
    onTerminal?.();
  }, [session?.status, onTerminal]);

  React.useEffect(() => {
    if (connectionState === "connected") return;
    if (reconnectAttempts < 5) return;
    setError(new Error(t("chat.wsConnectionFailed")));
    setIsLoading(false);
  }, [connectionState, reconnectAttempts, t]);

  const value: RealtimeContextValue = React.useMemo(
    () => ({
      session,
      isLoading,
      error,
      connectionState,
      reconnectAttempts,
      updateSession,
      userInputRequests,
      submitUserInputAnswer,
      workspaceFiles,
      requestWorkspaceFiles,
      requestWorkspaceFileUrl,
      requestSessionSnapshot,
    }),
    [
      session,
      isLoading,
      error,
      connectionState,
      reconnectAttempts,
      updateSession,
      userInputRequests,
      submitUserInputAnswer,
      workspaceFiles,
      requestWorkspaceFiles,
      requestWorkspaceFileUrl,
      requestSessionSnapshot,
    ],
  );

  return (
    <SessionRealtimeContext.Provider value={value}>
      {children}
    </SessionRealtimeContext.Provider>
  );
}
