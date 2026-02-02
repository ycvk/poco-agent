"use client";

import * as React from "react";
import { useMemo, useRef, useCallback } from "react";
import type {
  ImperativePanelGroupHandle,
  ImperativePanelHandle,
  PanelGroupStorage,
} from "react-resizable-panels";
import {
  Download,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  MAX_DRAWER_WIDTH_PERCENT,
  MIN_DRAWER_WIDTH,
  useFileChangesDrawer,
} from "@/features/chat/contexts/file-changes-drawer-context";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { DrawerFileList } from "./drawer-file-list";
import { DrawerDiffViewer } from "./drawer-diff-viewer";
import { createBufferedPanelGroupStorage } from "./panel-storage";

const clampPercent = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

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

  const lastNonMaxWidthRef = useRef(drawerWidth);
  const panelGroupRef = useRef<ImperativePanelGroupHandle | null>(null);
  const drawerPanelRef = useRef<ImperativePanelHandle | null>(null);
  const latestLayoutRef = useRef<number[] | null>(null);
  const desiredDrawerPercentRef = useRef<number | null>(null);
  const [isResizing, setIsResizing] = React.useState(false);
  const isResizingRef = useRef(false);
  const [isDrawerExpanded, setIsDrawerExpanded] = React.useState(false);
  const [isListCollapsed, setIsListCollapsed] = React.useState(false);
  const [isMaximized, setIsMaximized] = React.useState(false);
  const isInPreviewRef = useRef(false);
  const openAnimationRafRef = useRef<number | null>(null);
  const didAnimateOpenRef = useRef(false);
  const ensureExpandedIntervalRef = useRef<number | null>(null);
  const beforePreviewListCollapsedRef = useRef(false);

  const { storage: panelGroupStorage, controls: autoSaveControls } = useMemo(() => {
    const backend: PanelGroupStorage = {
      getItem: (name) => {
        if (typeof window === "undefined") return null;
        try {
          return window.localStorage.getItem(name);
        } catch {
          return null;
        }
      },
      setItem: (name, value) => {
        if (typeof window === "undefined") return;
        try {
          window.localStorage.setItem(name, value);
        } catch {
          // Ignore storage errors (private mode, quota exceeded, etc.).
        }
      },
    };

    return createBufferedPanelGroupStorage(backend);
  }, []);

  // Compute selected change
  const selectedChange = useMemo(
    () => fileChanges.find((c) => c.path === selectedPath) ?? null,
    [fileChanges, selectedPath],
  );

  const getSizing = useCallback(() => {
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440;
    const minPercent = (MIN_DRAWER_WIDTH / viewportWidth) * 100;
    const maxPercent = MAX_DRAWER_WIDTH_PERCENT * 100;
    return {
      viewportWidth,
      minPercent,
      maxPercent,
    };
  }, []);

  const widthPxToPercent = useCallback(
    (widthPx: number) => {
      const { viewportWidth, minPercent, maxPercent } = getSizing();
      return clampPercent((widthPx / viewportWidth) * 100, minPercent, maxPercent);
    },
    [getSizing],
  );

  const percentToWidthPx = useCallback((percent: number) => {
    const { viewportWidth } = getSizing();
    return Math.round((viewportWidth * percent) / 100);
  }, [getSizing]);

  const setDrawerLayoutByWidth = useCallback(
    (widthPx: number) => {
      if (typeof window === "undefined") {
        setDrawerWidth(widthPx);
        return;
      }

      const { viewportWidth } = getSizing();
      const maxWidthPx = Math.round(viewportWidth * MAX_DRAWER_WIDTH_PERCENT);
      const clampedWidthPx = Math.round(
        Math.max(MIN_DRAWER_WIDTH, Math.min(widthPx, maxWidthPx)),
      );

      const drawerPercent = widthPxToPercent(clampedWidthPx);
      desiredDrawerPercentRef.current = drawerPercent;
      latestLayoutRef.current = [100 - drawerPercent, drawerPercent];
      if (drawerPanelRef.current) {
        drawerPanelRef.current.resize(drawerPercent);
      } else {
        panelGroupRef.current?.setLayout(latestLayoutRef.current);
      }
      setDrawerWidth(clampedWidthPx);
    },
    [drawerPanelRef, getSizing, setDrawerWidth, widthPxToPercent],
  );

  const commitDrawerWidthFromLayout = useCallback(() => {
    if (typeof window === "undefined") return;

    let drawerPercent: number | undefined;
    try {
      drawerPercent = drawerPanelRef.current?.getSize();
    } catch {
      drawerPercent = undefined;
    }
    if (drawerPercent == null) {
      drawerPercent =
        (panelGroupRef.current?.getLayout() ?? latestLayoutRef.current)?.[1];
    }
    if (
      drawerPercent === undefined ||
      Number.isNaN(drawerPercent) ||
      drawerPercent <= 0
    ) {
      return;
    }

    const widthPx = percentToWidthPx(drawerPercent);
    setDrawerWidth(widthPx);
  }, [percentToWidthPx, setDrawerWidth]);

  const commitDrawerWidthFromPercent = useCallback(
    (drawerPercent: number) => {
      if (typeof window === "undefined") return;
      if (Number.isNaN(drawerPercent) || drawerPercent <= 0) return;
      setDrawerWidth(percentToWidthPx(drawerPercent));
    },
    [percentToWidthPx, setDrawerWidth],
  );

  const maybeCorrectBouncedLayout = useCallback(
    (layout: number[] | null) => {
      if (typeof window === "undefined") return;
      if (isMobile) return;
      if (!isOpen) return;
      if (isResizingRef.current) return;
      if (!isDrawerExpanded) return;
      if (!layout || layout.length < 2) return;

      const desiredPercent = desiredDrawerPercentRef.current;
      if (desiredPercent == null || desiredPercent <= 0) return;

      const currentPercent = layout[1];
      if (currentPercent == null || Number.isNaN(currentPercent)) return;

      // Avoid ping-pong loops from minor precision differences.
      if (Math.abs(currentPercent - desiredPercent) < 0.5) return;

      window.requestAnimationFrame(() => {
        if (!isOpen) return;
        if (isResizingRef.current) return;
        try {
          drawerPanelRef.current?.resize(desiredPercent);
        } catch {
          // Ignore resize failures; the panel group may be mid-initialization.
        }
      });
    },
    [isDrawerExpanded, isMobile, isOpen],
  );

  React.useLayoutEffect(() => {
    if (isMobile) return;
    if (typeof window === "undefined") return;

    if (openAnimationRafRef.current !== null) {
      window.cancelAnimationFrame(openAnimationRafRef.current);
      openAnimationRafRef.current = null;
    }

    const panel = drawerPanelRef.current;
    if (!panel) return;

    if (!isOpen) {
      didAnimateOpenRef.current = false;
      autoSaveControls.suspend();
      try {
        panel.collapse();
      } catch {
        // Ignore collapse failures; this can happen briefly while PanelGroup initializes.
      }
      autoSaveControls.resumeAndDiscard();
      return;
    }

    if (didAnimateOpenRef.current) return;

    autoSaveControls.suspend();

    const layoutPercent =
      panelGroupRef.current?.getLayout()?.[1] ?? latestLayoutRef.current?.[1];
    const targetPercent =
      typeof layoutPercent === "number" && layoutPercent > 0
        ? layoutPercent
        : widthPxToPercent(drawerWidth);
    desiredDrawerPercentRef.current = targetPercent;

    // Just opened: start collapsed so the resize handle doesn't "appear" at the final position.
    setIsDrawerExpanded(false);
    try {
      panel.collapse();
    } catch {
      // Ignore collapse failures; this can happen briefly while PanelGroup initializes.
    }

    const expandWithRetry = (attempt: number) => {
      try {
        drawerPanelRef.current?.resize(targetPercent);
        commitDrawerWidthFromPercent(targetPercent);
        autoSaveControls.resumeAndFlush();
        didAnimateOpenRef.current = true;
        openAnimationRafRef.current = null;
      } catch {
        if (attempt >= 10) {
          autoSaveControls.resumeAndFlush();
          openAnimationRafRef.current = null;
          return;
        }
        openAnimationRafRef.current = window.requestAnimationFrame(() =>
          expandWithRetry(attempt + 1),
        );
      }
    };

    openAnimationRafRef.current = window.requestAnimationFrame(() =>
      expandWithRetry(0),
    );

    return () => {
      if (openAnimationRafRef.current !== null) {
        window.cancelAnimationFrame(openAnimationRafRef.current);
        openAnimationRafRef.current = null;
      }
    };
  }, [
    autoSaveControls,
    commitDrawerWidthFromPercent,
    drawerWidth,
    isMobile,
    isOpen,
    widthPxToPercent,
  ]);

  React.useEffect(() => {
    if (isMobile) return;
    if (typeof window === "undefined") return;

    if (ensureExpandedIntervalRef.current !== null) {
      window.clearInterval(ensureExpandedIntervalRef.current);
      ensureExpandedIntervalRef.current = null;
    }

    if (!isOpen) return;

    // Safety net: in rare cases the open animation can be interrupted, leaving the panel collapsed.
    // Ensure the drawer expands within a short window.
    let attemptsLeft = 20; // ~1s at 50ms
    ensureExpandedIntervalRef.current = window.setInterval(() => {
      if (!isOpen) return;
      if (attemptsLeft <= 0) {
        if (ensureExpandedIntervalRef.current !== null) {
          window.clearInterval(ensureExpandedIntervalRef.current);
          ensureExpandedIntervalRef.current = null;
        }
        return;
      }

      attemptsLeft -= 1;

      const desiredPercent =
        desiredDrawerPercentRef.current ?? widthPxToPercent(drawerWidth);
      if (desiredPercent <= 0 || Number.isNaN(desiredPercent)) return;

      let currentSize = 0;
      try {
        currentSize = drawerPanelRef.current?.getSize() ?? 0;
      } catch {
        currentSize = 0;
      }

      if (currentSize > 0.5) {
        if (ensureExpandedIntervalRef.current !== null) {
          window.clearInterval(ensureExpandedIntervalRef.current);
          ensureExpandedIntervalRef.current = null;
        }
        return;
      }

      try {
        drawerPanelRef.current?.resize(desiredPercent);
      } catch {
        // Ignore resize failures; the panel group may be mid-initialization.
      }
    }, 50);

    return () => {
      if (ensureExpandedIntervalRef.current !== null) {
        window.clearInterval(ensureExpandedIntervalRef.current);
        ensureExpandedIntervalRef.current = null;
      }
    };
  }, [drawerWidth, isMobile, isOpen, widthPxToPercent]);

  const handlePreviewActiveChange = useCallback(
    (isPreview: boolean) => {
      if (isMobile) return;
      // Prevent preview logic from fighting with active resizing.
      if (isResizing) return;

      // Option 1: switching diff/preview must not change drawer width.
      if (isPreview) {
        if (isInPreviewRef.current) return;
        isInPreviewRef.current = true;
        beforePreviewListCollapsedRef.current = isListCollapsed;
        setIsListCollapsed(true);
        return;
      }

      if (!isInPreviewRef.current) return;
      isInPreviewRef.current = false;
      setIsListCollapsed(beforePreviewListCollapsedRef.current);
    },
    [isListCollapsed, isMobile, isResizing],
  );

  const handleRequestClose = useCallback(() => {
    isInPreviewRef.current = false;
    setIsListCollapsed(false);
    if (isMaximized) {
      setDrawerLayoutByWidth(lastNonMaxWidthRef.current);
      setIsMaximized(false);
    }
    closeDrawer();
  }, [closeDrawer, isMaximized, setDrawerLayoutByWidth]);

  React.useEffect(() => {
    if (!isOpen) {
      setIsResizing(false);
    }
  }, [isOpen]);

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

  const DrawerContent = (
    <>
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b flex flex-row items-center justify-between">
        <div>
          <SheetTitle className="text-base">
            {t("fileChangesDrawer.title")}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({fileChanges.length})
            </span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("fileChangesDrawer.title")}
          </SheetDescription>
        </div>
        <div className="flex items-center gap-1">
          {!isMobile && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsListCollapsed((prev) => !prev)}
                className="size-8"
                title={
                  isListCollapsed
                    ? t("fileChangesDrawer.expandList")
                    : t("fileChangesDrawer.collapseList")
                }
              >
                {isListCollapsed ? (
                  <PanelLeftOpen className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (typeof window === "undefined") return;
                  if (!isMaximized) {
                    lastNonMaxWidthRef.current = drawerWidth;
                    setDrawerLayoutByWidth(
                      Math.round(window.innerWidth * MAX_DRAWER_WIDTH_PERCENT),
                    );
                    setIsMaximized(true);
                  } else {
                    setDrawerLayoutByWidth(lastNonMaxWidthRef.current);
                    setIsMaximized(false);
                  }
                }}
                className="size-8"
                title={
                  isMaximized
                    ? t("fileChangesDrawer.restoreSize")
                    : t("fileChangesDrawer.maximize")
                }
              >
                {isMaximized ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            className="size-8"
            title={t("fileChangesDrawer.download")}
          >
            <Download className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRequestClose}
            className="size-8"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex-1 min-h-0",
          isMobile
            ? "flex flex-col"
            : isListCollapsed
              ? "flex"
              : "grid grid-cols-[260px_1fr]",
        )}
      >
        {!isListCollapsed && (
          <DrawerFileList
            fileChanges={fileChanges}
            selectedPath={selectedPath}
            onSelectPath={setSelectedPath}
            isMobile={isMobile}
          />
        )}
        <DrawerDiffViewer
          change={selectedChange}
          onPreviewActiveChange={handlePreviewActiveChange}
        />
      </div>
    </>
  );

  const defaultDrawerPercent = widthPxToPercent(drawerWidth);
  const panelMotionClass = cn(
    isResizing ? "transition-none" : "transition-[flex-grow] will-change-[flex-grow]",
    isOpen ? "duration-300 ease-out" : "duration-200 ease-in",
  );

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleRequestClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        hideCloseButton
        className={cn(
          "p-0",
          isMobile
            ? "h-[85vh] w-full max-w-full rounded-t-lg flex flex-col"
            : cn(
                "inset-0 h-screen w-screen max-w-none overflow-hidden",
                "bg-transparent shadow-none border-0 pointer-events-none",
                // Keep the SheetContent mounted for Radix exit animation, but neutralize the default slide.
                "data-[state=open]:slide-in-from-right-0 data-[state=closed]:slide-out-to-right-0",
              ),
        )}
        style={
          isMobile
            ? undefined
            : ({
                // Ensure the full-screen container never slides; only the drawer panel animates.
                "--tw-enter-translate-x": "0",
                "--tw-exit-translate-x": "0",
              } as React.CSSProperties)
        }
      >
        {isMobile ? (
          DrawerContent
        ) : (
          <ResizablePanelGroup
            ref={panelGroupRef}
            autoSaveId="file-changes-drawer"
            storage={panelGroupStorage}
            direction="horizontal"
            className="h-full w-full pointer-events-none"
            onLayout={(layout) => {
              latestLayoutRef.current = layout;
              maybeCorrectBouncedLayout(layout);
            }}
          >
            <ResizablePanel
              id="file-changes-drawer-mask"
              defaultSize={100 - defaultDrawerPercent}
              className={cn(panelMotionClass, "pointer-events-auto")}
              onClick={handleRequestClose}
            />
            <ResizableHandle
              withHandle
              hitAreaMargins={{ coarse: 24, fine: 12 }}
              onDragging={(dragging) => {
                setIsResizing(dragging);
                isResizingRef.current = dragging;
                if (dragging && isMaximized) {
                  setIsMaximized(false);
                }
                if (dragging && desiredDrawerPercentRef.current == null) {
                  let currentSize: number | null = null;
                  try {
                    currentSize = drawerPanelRef.current?.getSize() ?? null;
                  } catch {
                    currentSize = null;
                  }
                  desiredDrawerPercentRef.current = currentSize;
                }
                if (!dragging) {
                  const desiredPercent = desiredDrawerPercentRef.current;
                  if (desiredPercent != null && desiredPercent > 0) {
                    commitDrawerWidthFromPercent(desiredPercent);
                    maybeCorrectBouncedLayout(
                      panelGroupRef.current?.getLayout() ?? latestLayoutRef.current,
                    );
                  } else {
                    commitDrawerWidthFromLayout();
                    maybeCorrectBouncedLayout(latestLayoutRef.current);
                  }
                }
              }}
              className={cn(
                "cursor-col-resize",
                "data-[panel-resize-handle-active]:bg-primary/30 hover:bg-primary/20",
                "transition-colors transition-opacity",
                isOpen && isDrawerExpanded
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none",
              )}
            />
            <ResizablePanel
              ref={drawerPanelRef}
              id="file-changes-drawer-panel"
              collapsible
              collapsedSize={0}
              defaultSize={defaultDrawerPercent}
              minSize={Math.max(1, widthPxToPercent(MIN_DRAWER_WIDTH))}
              maxSize={MAX_DRAWER_WIDTH_PERCENT * 100}
              onResize={(size) => {
                latestLayoutRef.current = [100 - size, size];
                if (isResizingRef.current) {
                  desiredDrawerPercentRef.current = size;
                }
              }}
              onCollapse={() => setIsDrawerExpanded(false)}
              onExpand={() => setIsDrawerExpanded(true)}
              className={cn(
                "pointer-events-auto h-full flex flex-col bg-background",
                panelMotionClass,
                isDrawerExpanded ? "border-l" : "border-0",
                isResizing ? "shadow-none" : "shadow-lg",
              )}
            >
              {DrawerContent}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </SheetContent>
    </Sheet>
  );
}
