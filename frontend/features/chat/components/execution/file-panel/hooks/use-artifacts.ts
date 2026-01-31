import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { FileNode } from "@/features/chat/types";
import { useSessionRealtime } from "@/features/chat/contexts/session-realtime-context";

export type ViewMode = "artifacts" | "document";

const normalizePath = (value: string) => value.replace(/^\/+/, "");

const PRESIGNED_URL_REFRESH_BUFFER_MS = 30_000;

const ensureUrl = (value?: string | null) => {
  if (!value) return null;
  try {
    return new URL(
      value,
      typeof window !== "undefined" ? window.location.origin : undefined,
    );
  } catch {
    return null;
  }
};

const parseAmzDate = (value: string): number | null => {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
};

const getPresignedUrlExpiresAt = (rawUrl?: string | null): number | null => {
  const url = ensureUrl(rawUrl);
  if (!url) return null;
  const params = url.searchParams;

  const amzDate =
    params.get("X-Amz-Date") ?? params.get("x-amz-date") ?? undefined;
  const amzExpires =
    params.get("X-Amz-Expires") ?? params.get("x-amz-expires") ?? undefined;

  if (amzDate && amzExpires) {
    const baseMs = parseAmzDate(amzDate);
    const expiresSec = Number(amzExpires);
    if (baseMs && Number.isFinite(expiresSec) && expiresSec >= 0) {
      return baseMs + expiresSec * 1000;
    }
  }

  const legacyExpires =
    params.get("Expires") ?? params.get("expires") ?? undefined;
  if (legacyExpires) {
    const epochSec = Number(legacyExpires);
    if (Number.isFinite(epochSec) && epochSec > 0) return epochSec * 1000;
  }

  return null;
};

const isActiveStatus = (status?: UseArtifactsOptions["sessionStatus"]) =>
  status === "running" || status === "accepted";

const isFinishedStatus = (status?: UseArtifactsOptions["sessionStatus"]) =>
  status === "completed" ||
  status === "failed" ||
  status === "canceled" ||
  status === "stopped";

const findFileByPath = (
  nodes: FileNode[],
  targetPath: string,
): FileNode | undefined => {
  const normalizedTarget = normalizePath(targetPath);
  for (const node of nodes) {
    if (node.type === "file" && normalizePath(node.path) === normalizedTarget) {
      return node;
    }
    if (node.children && node.children.length) {
      const found = findFileByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return undefined;
};

interface UseArtifactsOptions {
  sessionId?: string;
  sessionStatus?:
    | "running"
    | "accepted"
    | "completed"
    | "failed"
    | "canceled"
    | "stopped";
}

interface UseArtifactsReturn {
  files: FileNode[];
  selectedFile: FileNode | undefined;
  viewMode: ViewMode;
  isRefreshing: boolean;
  selectFile: (file: FileNode) => void;
  closeViewer: () => void;
  refreshFiles: () => Promise<void>;
  ensureFreshFile: (file: FileNode) => Promise<FileNode | undefined>;
}

/**
 * Manages artifacts panel state and file list fetching
 *
 * Responsibilities:
 * - Request workspace file list via WebSocket
 * - Manage view mode (artifacts list vs document preview)
 * - Manage sidebar open/close state
 * - Handle file selection
 * - Force open sidebar for file preview
 */
export function useArtifacts({
  sessionId,
}: UseArtifactsOptions): UseArtifactsReturn {
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>("artifacts");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { workspaceFiles, requestWorkspaceFiles, requestWorkspaceFileUrl } =
    useSessionRealtime();
  const files = workspaceFiles;

  // Manual refresh method
  const refreshFiles = useCallback(async () => {
    if (!sessionId) return;
    setIsRefreshing(true);
    try {
      requestWorkspaceFiles();
    } finally {
      setIsRefreshing(false);
    }
  }, [sessionId, requestWorkspaceFiles]);

  const ensureFreshFile = useCallback(
    async (file: FileNode): Promise<FileNode | undefined> => {
      if (!sessionId) return file;

      const maybeRefresh = (() => {
        if (!file.url) return true;
        const expiresAt = getPresignedUrlExpiresAt(file.url);
        if (!expiresAt) return false;
        return expiresAt - Date.now() <= PRESIGNED_URL_REFRESH_BUFFER_MS;
      })();

      if (!maybeRefresh) return file;

      const refreshedUrl = await requestWorkspaceFileUrl(file.path);
      if (refreshedUrl) {
        return { ...file, url: refreshedUrl };
      }
      return findFileByPath(files, file.path) ?? file;
    },
    [sessionId, requestWorkspaceFileUrl, files],
  );

  // Initial fetch when sessionId becomes available.
  useEffect(() => {
    setViewMode("artifacts");
    setSelectedPath(undefined);
    if (sessionId) {
      requestWorkspaceFiles();
    }
  }, [sessionId, requestWorkspaceFiles]);

  // Select a file and switch to document view
  const selectFile = useCallback((file: FileNode) => {
    setSelectedPath(normalizePath(file.path));
    setViewMode("document");
  }, []);

  const closeViewer = useCallback(() => {
    setViewMode("artifacts");
    setSelectedPath(undefined);
  }, []);

  const selectedFile = useMemo((): FileNode | undefined => {
    if (!selectedPath) return undefined;
    return (
      findFileByPath(files, selectedPath) ?? {
        id: selectedPath,
        name: selectedPath.split("/").pop() || selectedPath,
        path: selectedPath,
        type: "file",
      }
    );
  }, [files, selectedPath]);

  // If the selected file URL is expired/expiring, request a fresh URL once.
  const lastExpiryRefreshAtRef = useRef(0);
  useEffect(() => {
    if (!sessionId) return;
    if (viewMode !== "document") return;
    if (!selectedFile) return;
    if (!selectedFile.url) return;

    const expiresAt = getPresignedUrlExpiresAt(selectedFile.url);
    if (!expiresAt) return;
    if (expiresAt - Date.now() > PRESIGNED_URL_REFRESH_BUFFER_MS) return;

    const now = Date.now();
    if (now - lastExpiryRefreshAtRef.current < 2000) return;
    lastExpiryRefreshAtRef.current = now;

    void requestWorkspaceFileUrl(selectedFile.path);
  }, [sessionId, viewMode, selectedFile, requestWorkspaceFileUrl]);

  // If the user opens a file before its preview URL is ready, request a fresh URL once.
  useEffect(() => {
    if (!sessionId) return;
    if (viewMode !== "document") return;
    if (!selectedFile) return;
    if (selectedFile.url) return;
    void requestWorkspaceFileUrl(selectedFile.path);
  }, [sessionId, viewMode, selectedFile, requestWorkspaceFileUrl]);

  // Listen for close-document-viewer event
  useEffect(() => {
    const handleCloseViewer = () => {
      closeViewer();
    };

    window.addEventListener("close-document-viewer", handleCloseViewer);
    return () => {
      window.removeEventListener("close-document-viewer", handleCloseViewer);
    };
  }, [closeViewer]);

  return {
    files,
    selectedFile,
    viewMode,
    isRefreshing,
    selectFile,
    closeViewer,
    refreshFiles,
    ensureFreshFile,
  };
}
