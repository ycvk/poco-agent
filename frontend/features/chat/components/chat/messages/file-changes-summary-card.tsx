"use client";

import * as React from "react";
import { FolderGit2, ChevronRight, Plus, Minus, FileEdit } from "lucide-react";
import type { FileChange } from "@/features/chat/types";
import { useFileChangesDrawer } from "@/features/chat/contexts/file-changes-drawer-context";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

interface FileChangesSummaryCardProps {
  fileChanges: FileChange[];
}

const MAX_VISIBLE_FILES = 3;

function getStatusIcon(status: string) {
  switch (status) {
    case "added":
      return <Plus className="size-3.5 text-success shrink-0" />;
    case "deleted":
      return <Minus className="size-3.5 text-destructive shrink-0" />;
    case "modified":
    case "renamed":
    default:
      return <FileEdit className="size-3.5 text-info shrink-0" />;
  }
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function FileChangesSummaryCard({
  fileChanges,
}: FileChangesSummaryCardProps) {
  const { t } = useT();
  const { openDrawer } = useFileChangesDrawer();

  if (!fileChanges || fileChanges.length === 0) {
    return null;
  }

  const visibleFiles = fileChanges.slice(0, MAX_VISIBLE_FILES);
  const remainingCount = fileChanges.length - MAX_VISIBLE_FILES;

  const handleClick = () => {
    openDrawer(fileChanges);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDrawer(fileChanges);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "w-full my-2 rounded-md border border-border/60 bg-muted/20",
        "hover:bg-muted/40 hover:border-border transition-colors cursor-pointer",
      )}
    >
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderGit2 className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {t("fileChanges.title")}
          </span>
          <span className="text-xs text-muted-foreground">
            ({fileChanges.length})
          </span>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>

      {/* File List */}
      <div className="px-3 pb-2 space-y-1">
        {visibleFiles.map((file) => (
          <div
            key={file.path}
            className="flex items-center gap-2 text-sm text-muted-foreground"
            title={file.path}
          >
            {getStatusIcon(file.status)}
            <span className="truncate">{getFileName(file.path)}</span>
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="text-xs text-muted-foreground/70 pl-5">
            +{remainingCount} {t("fileChanges.moreFiles")}
          </div>
        )}
      </div>
    </div>
  );
}
