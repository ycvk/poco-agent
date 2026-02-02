"use client";

import * as React from "react";
import { FileText, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { FileChange, FileNode } from "@/features/chat/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useSessionRealtime } from "@/features/chat/contexts/session-realtime-context";
import { DocumentViewer } from "../file-panel/document-viewer";
import { stripDiffHeaderLines } from "./diff-utils";

interface DrawerDiffViewerProps {
  change: FileChange | null;
  onPreviewActiveChange?: (active: boolean) => void;
}

const normalizePath = (value: string) => value.replace(/^\/+/, "");

const ensureAbsolutePath = (value: string) =>
  value.startsWith("/") ? value : `/${value}`;

const findFileByPath = (
  nodes: FileNode[],
  targetPath: string,
): FileNode | undefined => {
  const normalizedTarget = normalizePath(targetPath);
  for (const node of nodes) {
    if (node.type === "file" && normalizePath(node.path) === normalizedTarget) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findFileByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return undefined;
};

const buildFallbackFileNode = (path: string): FileNode => ({
  id: path,
  name: path.split("/").pop() || path,
  path,
  type: "file",
});

function parseDiffLine(line: string): {
  className: string;
  isAddition: boolean;
  isDeletion: boolean;
} {
  // Lines starting with + (but not +++ <path>) are additions
  if (line.startsWith("+") && !line.startsWith("+++ ")) {
    return {
      className: "bg-success/10 text-success",
      isAddition: true,
      isDeletion: false,
    };
  }
  // Lines starting with - (but not --- <path>) are deletions
  if (line.startsWith("-") && !line.startsWith("--- ")) {
    return {
      className: "bg-destructive/10 text-destructive",
      isAddition: false,
      isDeletion: true,
    };
  }
  // Header lines and context lines
  return { className: "", isAddition: false, isDeletion: false };
}

export function DrawerDiffViewer({
  change,
  onPreviewActiveChange,
}: DrawerDiffViewerProps) {
  const { t } = useT();
  const { workspaceFiles, requestWorkspaceFiles, requestWorkspaceFileUrl } =
    useSessionRealtime();
  const [activeTab, setActiveTab] = React.useState<
    "diff" | "source" | "preview"
  >("diff");
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewUrlStatus, setPreviewUrlStatus] = React.useState<
    "idle" | "loading" | "unavailable"
  >("idle");
  const [generatedDiff, setGeneratedDiff] = React.useState<string | null>(null);
  const [generatedDiffStatus, setGeneratedDiffStatus] = React.useState<
    "idle" | "loading" | "success" | "unavailable" | "error"
  >("idle");
  const [generatedDiffTruncated, setGeneratedDiffTruncated] =
    React.useState(false);
  const [generatedDiffRefreshKey, setGeneratedDiffRefreshKey] =
    React.useState(0);
  const lastRequestedPreviewPathRef = React.useRef<string | null>(null);
  const lastRequestedGeneratedDiffPathRef = React.useRef<string | null>(null);
  const onPreviewActiveChangeRef = React.useRef(onPreviewActiveChange);

  React.useEffect(() => {
    onPreviewActiveChangeRef.current = onPreviewActiveChange;
  }, [onPreviewActiveChange]);

  const isAddedFile = React.useMemo(
    () => String(change?.status ?? "").toLowerCase() === "added",
    [change?.status],
  );
  const hasDiff = React.useMemo(() => {
    if (!change?.diff) return false;
    return change.diff.trim().length > 0;
  }, [change?.diff]);
  const shouldGenerateDiffFromSource = isAddedFile && !hasDiff;

  const resolvedFile = React.useMemo(() => {
    if (!change) return undefined;
    return findFileByPath(workspaceFiles, change.path);
  }, [workspaceFiles, change]);

  const previewFile = React.useMemo(() => {
    if (!change) return undefined;
    return resolvedFile ?? buildFallbackFileNode(change.path);
  }, [change, resolvedFile]);

  const effectivePreviewUrl = resolvedFile?.url ?? previewUrl;
  const previewFileWithUrl =
    previewFile && effectivePreviewUrl && !resolvedFile?.url
      ? { ...previewFile, url: effectivePreviewUrl }
      : previewFile;

  React.useEffect(() => {
    onPreviewActiveChangeRef.current?.(activeTab !== "diff");
  }, [activeTab]);

  // Set a sensible default tab based on available data (per file).
  React.useEffect(() => {
    if (!change) return;
    setActiveTab(hasDiff || shouldGenerateDiffFromSource ? "diff" : "preview");
    setPreviewUrl(null);
    setPreviewUrlStatus("idle");
    setGeneratedDiff(null);
    setGeneratedDiffStatus("idle");
    setGeneratedDiffTruncated(false);
    lastRequestedPreviewPathRef.current = null;
    lastRequestedGeneratedDiffPathRef.current = null;
  }, [change?.path, hasDiff, shouldGenerateDiffFromSource, change]);

  // Lazily request workspace file list so preview can resolve URLs.
  React.useEffect(() => {
    if (!change) return;
    if (workspaceFiles.length > 0) return;
    requestWorkspaceFiles();
  }, [workspaceFiles.length, requestWorkspaceFiles, change]);

  // When a newly added file has no server-provided diff, generate one from current file content.
  React.useEffect(() => {
    if (!change) return;
    if (!shouldGenerateDiffFromSource) return;

    const targetPath = ensureAbsolutePath(change.path);
    const requestKey = `${targetPath}:${generatedDiffRefreshKey}`;
    if (lastRequestedGeneratedDiffPathRef.current === requestKey) return;
    lastRequestedGeneratedDiffPathRef.current = requestKey;

    setGeneratedDiff(null);
    setGeneratedDiffStatus("loading");
    setGeneratedDiffTruncated(false);

    let cancelled = false;

    const buildAddedFileDiff = (path: string, content: string) => {
      const normalizedPath = normalizePath(path);
      const normalizedContent = content.replace(/\r\n/g, "\n");
      const lines = normalizedContent.split("\n");

      const maxLines = 20000;
      const truncated = lines.length > maxLines;
      const visibleLines = truncated ? lines.slice(0, maxLines) : lines;

      const hunkLineCount = Math.max(visibleLines.length, 1);
      const header = [
        `diff --git a/${normalizedPath} b/${normalizedPath}`,
        `--- /dev/null`,
        `+++ b/${normalizedPath}`,
        `@@ -0,0 +1,${hunkLineCount} @@`,
      ].join("\n");

      const body = visibleLines.map((line) => `+${line}`).join("\n");
      return { diff: `${header}\n${body}`, truncated };
    };

    const load = async () => {
      try {
        const urlFromTree = resolvedFile?.url ?? previewUrl;
        const url =
          urlFromTree ?? (await requestWorkspaceFileUrl(targetPath));
        if (cancelled) return;

        if (!url) {
          setGeneratedDiffStatus("unavailable");
          return;
        }

        if (!resolvedFile?.url) {
          setPreviewUrl(url);
        }

        const isSameOrigin =
          typeof window !== "undefined" &&
          new URL(url, window.location.origin).origin ===
            window.location.origin;

        const response = await fetch(url, {
          credentials: isSameOrigin ? "include" : "omit",
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();

        if (cancelled) return;
        const { diff, truncated } = buildAddedFileDiff(change.path, text ?? "");
        setGeneratedDiff(diff);
        setGeneratedDiffTruncated(truncated);
        setGeneratedDiffStatus("success");
      } catch (error) {
        if (cancelled) return;
        console.error("[FileChangesDrawer] Failed to generate diff", error);
        setGeneratedDiffStatus("error");
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    change,
    generatedDiffRefreshKey,
    previewUrl,
    requestWorkspaceFileUrl,
    resolvedFile?.url,
    shouldGenerateDiffFromSource,
  ]);

  // When preview is active, request a presigned URL for the selected file (if missing).
  React.useEffect(() => {
    if (!change) return;
    if (activeTab !== "preview" && activeTab !== "source") return;
    if (resolvedFile?.url) return;
    if (!previewFile) return;
    const targetPath = ensureAbsolutePath(
      resolvedFile?.path ?? previewFile.path,
    );
    if (lastRequestedPreviewPathRef.current === targetPath) return;
    lastRequestedPreviewPathRef.current = targetPath;
    setPreviewUrlStatus("loading");
    let cancelled = false;
    void requestWorkspaceFileUrl(targetPath).then((url) => {
      if (cancelled) return;
      setPreviewUrl(url);
      setPreviewUrlStatus(url ? "idle" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    change,
    resolvedFile?.url,
    resolvedFile?.path,
    previewFile?.path,
    requestWorkspaceFileUrl,
    previewFile,
  ]);

  const ensureFreshFile = React.useCallback(
    async (file: FileNode): Promise<FileNode | undefined> => {
      const targetPath = ensureAbsolutePath(file.path);
      const refreshedUrl = await requestWorkspaceFileUrl(targetPath);
      if (refreshedUrl) return { ...file, url: refreshedUrl };
      return resolvedFile ?? file;
    },
    [requestWorkspaceFileUrl, resolvedFile],
  );

  // No file selected (render after hooks to satisfy rules-of-hooks).
  if (!change) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <span>{t("fileChangesDrawer.selectFile")}</span>
      </div>
    );
  }

  // File path header
  const Header = (
    <div className="shrink-0 px-4 py-2 border-b bg-muted/30">
      <div className="flex items-center justify-between gap-4">
        <code className="text-sm font-mono text-foreground truncate">
          {change.path}
        </code>
        {(change.added_lines !== undefined ||
          change.deleted_lines !== undefined) && (
          <div className="flex items-center gap-2 text-xs shrink-0">
            {change.added_lines !== undefined && change.added_lines > 0 && (
              <span className="text-success">+{change.added_lines}</span>
            )}
            {change.deleted_lines !== undefined && change.deleted_lines > 0 && (
              <span className="text-destructive">-{change.deleted_lines}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const noDiffMessage = (() => {
    if (change.status === "added") return t("fileChangesDrawer.noDiffAdded");
    if (change.status === "deleted") return t("fileChangesDrawer.noDiffDeleted");
    if (change.status === "renamed") return t("fileChangesDrawer.noDiffRenamed");
    return t("fileChangesDrawer.noDiff");
  })();

  const effectiveDiff = hasDiff ? change.diff : generatedDiff;
  const diffLines = effectiveDiff
    ? stripDiffHeaderLines(effectiveDiff)
    : [];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {Header}

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(
            value === "preview"
              ? "preview"
              : value === "source"
                ? "source"
                : "diff",
          )
        }
        className="flex-1 min-h-0"
      >
        <div className="shrink-0 px-4 py-2 border-b bg-background">
          <TabsList>
            <TabsTrigger value="diff">{t("fileChangesDrawer.tabDiff")}</TabsTrigger>
            <TabsTrigger value="source">
              {t("fileChangesDrawer.tabSource")}
            </TabsTrigger>
            <TabsTrigger value="preview">
              {t("fileChangesDrawer.tabPreview")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="diff" className="flex-1 min-h-0">
          {!effectiveDiff ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground px-6 text-center">
              <FileText className="size-8 mb-3 opacity-40" />
              {shouldGenerateDiffFromSource ? (
                <>
                  <div className="text-sm font-medium text-foreground/90">
                    {generatedDiffStatus === "loading"
                      ? t("fileChangesDrawer.generatingDiff")
                      : generatedDiffStatus === "unavailable"
                        ? t("fileChangesDrawer.generateDiffUnavailable")
                        : t("fileChangesDrawer.generateDiffFailed")}
                  </div>
                  <div className="mt-1 text-xs">
                    {generatedDiffStatus === "loading"
                      ? t("fileChangesDrawer.generatingDiffDesc")
                      : t("fileChangesDrawer.generateDiffHint")}
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    {generatedDiffStatus !== "loading" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setGeneratedDiffRefreshKey((k) => k + 1)}
                      >
                        {t("fileChangesDrawer.retryGenerateDiff")}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab("preview")}
                    >
                      {t("fileChangesDrawer.openPreview")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab("source")}
                    >
                      {t("fileChangesDrawer.openSource")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm font-medium text-foreground/90">
                    {noDiffMessage}
                  </div>
                  <div className="mt-1 text-xs">
                    {t("fileChangesDrawer.noDiffHint")}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setActiveTab("preview")}
                  >
                    {t("fileChangesDrawer.openPreview")}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="h-full min-h-0 flex flex-col">
              {generatedDiffTruncated && (
                <div className="shrink-0 px-4 py-2 border-b bg-muted/30 text-xs text-muted-foreground">
                  {t("fileChangesDrawer.generatedDiffTruncated")}
                </div>
              )}
              <ScrollArea className="h-full">
                <div className="p-2">
                  {diffLines.map((line, index) => {
                    const { className } = parseDiffLine(line);
                    return (
                      <div
                        key={index}
                        className={cn(
                          "grid grid-cols-[3.5rem_1fr] gap-2 rounded-sm px-2 py-0.5",
                          "text-xs font-mono leading-relaxed",
                          className,
                        )}
                      >
                        <span className="select-none text-muted-foreground/60 text-right">
                          {index + 1}
                        </span>
                        <span className="whitespace-pre break-all">
                          {line || " "}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </TabsContent>

        <TabsContent value="source" className="flex-1 min-h-0">
          {previewUrlStatus === "unavailable" ? (
            <div className="h-full flex flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <div className="text-sm font-medium text-foreground/90">
                {t("fileChangesDrawer.sourceUnavailable")}
              </div>
              <div className="mt-1 text-xs">
                {t("fileChangesDrawer.sourceUnavailableDesc")}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 gap-2"
                onClick={() => {
                  if (!previewFile) return;
                  const targetPath = ensureAbsolutePath(previewFile.path);
                  setPreviewUrl(null);
                  setPreviewUrlStatus("loading");
                  requestWorkspaceFiles();
                  void requestWorkspaceFileUrl(targetPath).then((url) => {
                    setPreviewUrl(url);
                    setPreviewUrlStatus(url ? "idle" : "unavailable");
                  });
                }}
              >
                <RefreshCw className="size-4" />
                {t("fileChangesDrawer.refreshFiles")}
              </Button>
            </div>
          ) : workspaceFiles.length === 0 && !resolvedFile ? (
            <div className="h-full flex flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <div className="text-sm font-medium text-foreground/90">
                {t("fileChangesDrawer.sourceNotReady")}
              </div>
              <div className="mt-1 text-xs">
                {t("fileChangesDrawer.sourceNotReadyDesc")}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 gap-2"
                onClick={() => requestWorkspaceFiles()}
              >
                <RefreshCw className="size-4" />
                {t("fileChangesDrawer.refreshFiles")}
              </Button>
            </div>
          ) : (
            <div className="h-full min-h-0 overflow-hidden">
              <DocumentViewer
                file={previewFileWithUrl}
                ensureFreshFile={ensureFreshFile}
                showBackButton={false}
                mode="source"
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="preview" className="flex-1 min-h-0">
          {previewUrlStatus === "unavailable" ? (
            <div className="h-full flex flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <div className="text-sm font-medium text-foreground/90">
                {t("fileChangesDrawer.previewUnavailable")}
              </div>
              <div className="mt-1 text-xs">
                {t("fileChangesDrawer.previewUnavailableDesc")}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 gap-2"
                onClick={() => {
                  if (!previewFile) return;
                  const targetPath = ensureAbsolutePath(previewFile.path);
                  setPreviewUrl(null);
                  setPreviewUrlStatus("loading");
                  requestWorkspaceFiles();
                  void requestWorkspaceFileUrl(targetPath).then((url) => {
                    setPreviewUrl(url);
                    setPreviewUrlStatus(url ? "idle" : "unavailable");
                  });
                }}
              >
                <RefreshCw className="size-4" />
                {t("fileChangesDrawer.refreshFiles")}
              </Button>
            </div>
          ) : workspaceFiles.length === 0 && !resolvedFile ? (
            <div className="h-full flex flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <div className="text-sm font-medium text-foreground/90">
                {t("fileChangesDrawer.previewNotReady")}
              </div>
              <div className="mt-1 text-xs">
                {t("fileChangesDrawer.previewNotReadyDesc")}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 gap-2"
                onClick={() => requestWorkspaceFiles()}
              >
                <RefreshCw className="size-4" />
                {t("fileChangesDrawer.refreshFiles")}
              </Button>
            </div>
          ) : (
            <div className="h-full min-h-0 overflow-hidden">
              <DocumentViewer
                file={previewFileWithUrl}
                ensureFreshFile={ensureFreshFile}
                showBackButton={false}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
