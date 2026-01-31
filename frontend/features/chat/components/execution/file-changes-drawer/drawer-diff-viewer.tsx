"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { FileChange } from "@/features/chat/types";

interface DrawerDiffViewerProps {
  change: FileChange | null;
}

function parseDiffLine(line: string): {
  className: string;
  isAddition: boolean;
  isDeletion: boolean;
} {
  // Lines starting with + (but not +++) are additions
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return {
      className: "bg-success/10 text-success",
      isAddition: true,
      isDeletion: false,
    };
  }
  // Lines starting with - (but not ---) are deletions
  if (line.startsWith("-") && !line.startsWith("---")) {
    return {
      className: "bg-destructive/10 text-destructive",
      isAddition: false,
      isDeletion: true,
    };
  }
  // Header lines and context lines
  return { className: "", isAddition: false, isDeletion: false };
}

export function DrawerDiffViewer({ change }: DrawerDiffViewerProps) {
  const { t } = useT();

  // No file selected
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

  // No diff available
  if (!change.diff) {
    return (
      <div className="flex-1 flex flex-col">
        {Header}
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <span>{t("fileChangesDrawer.noDiff")}</span>
        </div>
      </div>
    );
  }

  // Parse and render diff
  const lines = change.diff.split("\n");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {Header}
      <ScrollArea className="flex-1">
        <pre className="text-xs font-mono p-2">
          {lines.map((line, index) => {
            const { className } = parseDiffLine(line);
            return (
              <div
                key={index}
                className={cn("px-2 py-0.5 whitespace-pre", className)}
              >
                {line || " "}
              </div>
            );
          })}
        </pre>
      </ScrollArea>
    </div>
  );
}
