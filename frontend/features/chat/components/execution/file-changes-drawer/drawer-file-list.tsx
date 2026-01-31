"use client";

import * as React from "react";
import { Plus, Minus, FileEdit, GitCompare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { FileChange } from "@/features/chat/types";

interface DrawerFileListProps {
  fileChanges: FileChange[];
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
  isMobile?: boolean;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "added":
      return <Plus className="size-3.5 text-success shrink-0" />;
    case "deleted":
      return <Minus className="size-3.5 text-destructive shrink-0" />;
    case "modified":
      return <FileEdit className="size-3.5 text-info shrink-0" />;
    case "renamed":
      return <GitCompare className="size-3.5 text-warning shrink-0" />;
    default:
      return <FileEdit className="size-3.5 text-muted-foreground shrink-0" />;
  }
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function DrawerFileList({
  fileChanges,
  selectedPath,
  onSelectPath,
  isMobile = false,
}: DrawerFileListProps) {
  return (
    <div
      className={cn(
        isMobile ? "border-b shrink-0 max-h-32" : "border-r h-full",
      )}
    >
      <ScrollArea className="h-full">
        <div className="flex flex-col py-1">
          {fileChanges.map((file) => {
            const isSelected = file.path === selectedPath;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => onSelectPath(file.path)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors",
                  isSelected
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted text-foreground/80",
                )}
                title={file.path}
              >
                {getStatusIcon(file.status)}
                <span className="truncate">{getFileName(file.path)}</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
