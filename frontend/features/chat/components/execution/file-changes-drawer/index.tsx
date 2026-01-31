"use client";

import * as React from "react";
import { useMemo, useRef, useEffect, useCallback } from "react";
import { X, Download } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useFileChangesDrawer } from "@/features/chat/contexts/file-changes-drawer-context";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { DrawerFileList } from "./drawer-file-list";
import { DrawerDiffViewer } from "./drawer-diff-viewer";

export function FileChangesDrawer() {
  const { t } = useT();
  const isMobile = useIsMobile();
  const {
    isOpen,
    closeDrawer,
    fileChanges,
    selectedPath,
    setSelectedPath,
    drawerWidth,
    setDrawerWidth,
  } = useFileChangesDrawer();

  const isResizingRef = useRef(false);

  // Compute selected change
  const selectedChange = useMemo(
    () => fileChanges.find((c) => c.path === selectedPath) ?? null,
    [fileChanges, selectedPath],
  );

  // Handle resize for desktop
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      e.preventDefault();
      isResizingRef.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [isMobile],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setDrawerWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [setDrawerWidth]);

  // Handle download all diffs
  const handleDownload = useCallback(() => {
    const content = fileChanges
      .map((file) => {
        const header = `=== ${file.path} (${file.status}) ===`;
        const diff = file.diff ?? "(no diff available)";
        return `${header}\n${diff}`;
      })
      .join("\n\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "file-changes.diff";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [fileChanges]);

  // Return null if no file changes
  if (fileChanges.length === 0) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeDrawer()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "p-0 flex flex-col",
          isMobile
            ? "h-[85vh] w-full max-w-full rounded-t-lg"
            : "h-full max-w-none",
        )}
        style={isMobile ? undefined : { width: drawerWidth }}
      >
        {/* Resize handle - desktop only */}
        {!isMobile && (
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={handleMouseDown}
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors z-10"
          />
        )}

        {/* Header */}
        <SheetHeader className="shrink-0 px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-base">
            {t("fileChangesDrawer.title")}
          </SheetTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="size-8"
              title={t("fileChangesDrawer.download")}
            >
              <Download className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={closeDrawer}
              className="size-8"
            >
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Content */}
        <div
          className={cn(
            "flex-1 min-h-0",
            isMobile ? "flex flex-col" : "grid grid-cols-[180px_1fr]",
          )}
        >
          <DrawerFileList
            fileChanges={fileChanges}
            selectedPath={selectedPath}
            onSelectPath={setSelectedPath}
            isMobile={isMobile}
          />
          <DrawerDiffViewer change={selectedChange} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
