"use client";

import * as React from "react";
import { Plus, Minus, FileEdit, GitCompare, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FileChange } from "@/features/chat/types";
import { useT } from "@/lib/i18n/client";

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
  const { t } = useT();
  const [query, setQuery] = React.useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredFiles = React.useMemo(() => {
    if (!normalizedQuery) return fileChanges;
    return fileChanges.filter((file) => {
      const target = `${file.path} ${getFileName(file.path)}`.toLowerCase();
      return target.includes(normalizedQuery);
    });
  }, [fileChanges, normalizedQuery]);

  return (
    <div
      className={cn(
        "flex flex-col min-h-0",
        isMobile ? "border-b shrink-0 max-h-48" : "border-r h-full",
      )}
    >
      <div className="shrink-0 border-b px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("fileChangesDrawer.searchPlaceholder")}
            className="h-9 pl-8"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col py-1">
          {filteredFiles.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              {t("fileChangesDrawer.noMatches")}
            </div>
          ) : (
            filteredFiles.map((file) => {
              const isSelected = file.path === selectedPath;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => onSelectPath(file.path)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isSelected
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted text-foreground/80",
                  )}
                  title={file.path}
                >
                  <div className="flex items-center gap-2 w-full">
                    {getStatusIcon(file.status)}
                    <span className="truncate text-sm font-medium">
                      {getFileName(file.path)}
                    </span>
                  </div>
                  <span className="pl-5 w-full truncate text-xs text-muted-foreground/90">
                    {file.path}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
